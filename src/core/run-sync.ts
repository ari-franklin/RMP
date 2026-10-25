import { resolveRepositoryPath } from '../utils/paths.js';
import { createAdapters } from '../adapters/factory.js';
import { withRepositoryOperation } from '../storage/operation-lock.js';
import { projectNotionWorkflow } from '../content/project-notion.js';
import type { NotionWorkflowPolicy } from '../content/notion-policy.js';
import type { SourceChange } from '../history/source-changes.js';
import type { NotionSnapshot, SourceHealth } from '../adapters/notion-types.js';
import {
  readSourceHealth,
  failedSourceHealth,
  renderSourceNotice,
  sourceHealthMessage,
} from './source-health.js';
import { contentId } from '../utils/ids.js';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { AdapterRegistry, type Adapter, type NormalizedEvidence } from '../adapters/index.js';
import { loadConfig } from '../config/index.js';
import { renderHtml as defaultRenderHtml, renderMarkdown } from '../renderers/index.js';
import { validateRoadmap, validateTransitionReceipt } from '../schemas/index.js';
import { RepositoryTransaction, type TransactionWrite } from '../storage/index.js';
import type { Evidence, Roadmap, TransitionReceipt } from '../types/index.js';
import { canonicalJson, canonicalJsonLine } from '../utils/json.js';
import { reconcile } from './reconcile.js';
import { validateConsistency } from './validate-consistency.js';

export type SyncMode = 'collect' | 'reconcile' | 'render' | 'sync';
export type RenderFormat = 'all' | 'markdown' | 'html';

export interface RunSyncOptions {
  root: string;
  mode: SyncMode;
  dryRun?: boolean;
  offline?: boolean;
  notion?: Pick<
    import('../adapters/notion.js').NotionCollectionOptions,
    'environment' | 'transport'
  >;
  transactionOptions?: import('../storage/transaction.js').TransactionOptions;
  format?: RenderFormat;
  adapters?: Adapter[];
  now?: string;
  renderHtml?: typeof defaultRenderHtml;
}

export interface RunSyncResult {
  sourceHealth?: import('../adapters/notion-types.js').SourceHealth;
  degraded?: boolean;
  schemaVersion: '1.0.0';
  mode: SyncMode;
  dryRun: boolean;
  roadmap: Roadmap;
  evidence: Evidence[];
  receipts: TransitionReceipt[];
  recommendations: Roadmap['recommendations'];
  diagnostics: string[];
  changedPaths: string[];
}

async function optionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseJson(text: string, description: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`Invalid ${description} JSON`, { cause: error });
  }
}

function proposedStatus(event: NormalizedEvidence): string | undefined {
  if (typeof event.data.status === 'string') return event.data.status;
  if (event.kind === 'planCompletion' || event.kind === 'release' || event.kind === 'tag') {
    return 'completed';
  }
  if (event.kind === 'measurement' && event.data.successful === true) return 'completed';
  return undefined;
}

function domainEvidence(event: NormalizedEvidence): Evidence {
  const status = proposedStatus(event);
  const measurement =
    event.kind === 'measurement' &&
    typeof event.data.value === 'number' &&
    typeof event.data.successful === 'boolean'
      ? { value: event.data.value, successful: event.data.successful }
      : undefined;
  return {
    id: event.id.startsWith('ev-') ? event.id : `ev-${event.id}`,
    class: event.class,
    source: event.provenance.provider,
    sourceRef: event.provenance.sourceRef,
    observedAt: event.observedAt,
    summary: event.summary,
    extensions: {
      'rmp.dev/transition': {
        ...(event.itemRefs[0] === undefined ? {} : { itemId: event.itemRefs[0] }),
        sourceLinks: [event.provenance.sourceRef],
        ...(status === undefined ? {} : { proposedStatus: status }),
        ...(measurement === undefined ? {} : { measurement }),
      },
    },
  };
}

function parseHistory(text: string | undefined): TransitionReceipt[] {
  if (text === undefined || text.trim() === '') return [];
  return text
    .trim()
    .split('\n')
    .map((line) => {
      const result = validateTransitionReceipt(parseJson(line, 'history'));
      if (!result.valid) throw new Error('Invalid transition history');
      return result.value;
    });
}

async function changedWrites(
  root: string,
  writes: TransactionWrite[],
): Promise<TransactionWrite[]> {
  const changed: TransactionWrite[] = [];
  for (const write of writes) {
    if ((await optionalText(join(root, write.path))) !== write.content) changed.push(write);
  }
  return changed.sort((left, right) => left.path.localeCompare(right.path));
}

async function readState(root: string) {
  const read = async (path: string) => optionalText(await resolveRepositoryPath(root, path));
  const roadmapText = await read('.roadmap/roadmap.json');
  if (roadmapText === undefined)
    throw new Error('Invalid repository: missing .roadmap/roadmap.json');
  const validated = validateRoadmap(parseJson(roadmapText, 'roadmap'));
  if (!validated.valid) throw new Error('Invalid roadmap: schema validation failed');
  const configText = (await read('.roadmap/config.json')) ?? '{}';
  const config = loadConfig(parseJson(configText, 'config'));
  if (!config.valid) throw new Error('Invalid config: schema validation failed');
  const historyText = await read('.roadmap/history.jsonl');
  const journalText = await read('.roadmap/source-changes.jsonl');
  const snapshotText = await read('.roadmap/sources/notion-posts.json');
  const healthText = await read('.roadmap/sources/notion-health.json');
  return {
    roadmap: validated.value,
    config: config.config,
    configText,
    historyText,
    journalText,
    snapshotText,
    health: readSourceHealth(healthText),
  };
}

export async function runSync(options: RunSyncOptions): Promise<RunSyncResult> {
  const readOnly = options.mode === 'collect' || (options.dryRun ?? false);
  const initial = await withRepositoryOperation(options.root, async () => {
    if (!readOnly) await new RepositoryTransaction(options.root).recover();
    return readState(options.root);
  });
  const shouldCollect = options.mode !== 'render';
  const policy = initial.roadmap.extensions['content/notion-workflow'] as unknown as
    NotionWorkflowPolicy | undefined;
  const defaults = createAdapters(initial.config, {
    ...options.notion,
    ...(options.offline === undefined ? {} : { offline: options.offline }),
    ...(policy?.statusOptions ? { statusOptionIds: Object.keys(policy.statusOptions) } : {}),
  });
  // Explicit adapters are trusted local evidence overrides; configured Notion still
  // uses the bounded provider and cannot be enabled through an override.
  const adapters =
    options.adapters === undefined
      ? defaults
      : [
          ...options.adapters.filter((a) => a.identity.provider !== 'notion'),
          ...defaults.filter((a) => a.identity.provider === 'notion'),
        ];
  const collection = shouldCollect
    ? await new AdapterRegistry(adapters).collect({ repositoryRoot: options.root })
    : { evidence: [], diagnostics: [], cursors: {} };
  const evidence = collection.evidence.map(domainEvidence);
  const source = 'sources' in collection ? collection.sources[0] : undefined;
  return withRepositoryOperation(options.root, async () => {
    if (!readOnly) await new RepositoryTransaction(options.root).recover();
    const current = await readState(options.root);
    if (
      current.configText !== initial.configText ||
      canonicalJson(current.roadmap.extensions['content/notion-workflow']) !==
        canonicalJson(policy) ||
      current.snapshotText !== initial.snapshotText
    )
      throw new Error('Source configuration or snapshot changed during collection; retry');
    const priorReceipts = parseHistory(current.historyText);
    const priorJournal: SourceChange[] = current.journalText?.trim()
      ? current.journalText
          .trim()
          .split('\n')
          .map((line) => {
            const value = parseJson(line, 'source journal') as Partial<SourceChange> | null;
            if (!value || typeof value !== 'object') throw new Error('Invalid source journal');
            const { id, ...fields } = value;
            if (
              id !== contentId('sc', fields) ||
              typeof value.timestamp !== 'string' ||
              !Number.isFinite(Date.parse(value.timestamp)) ||
              !value.itemId ||
              !value.evidenceId ||
              !value.after ||
              value.after.id !== value.itemId
            )
              throw new Error('Invalid source journal');
            return value as SourceChange;
          })
      : [];
    const now = options.now ?? new Date().toISOString();
    let roadmap = current.roadmap;
    let sourceHealth: SourceHealth | undefined = current.health;
    let acceptedSnapshot: NotionSnapshot | undefined;
    let sourceReceipts: TransitionReceipt[] = [];
    let journal: SourceChange[] = [];
    let degraded = false;
    const diagnostics = collection.diagnostics.map((d) => d.message);
    let hasSnapshot = false;
    if (current.snapshotText) {
      const cached = parseJson(current.snapshotText, 'source snapshot') as NotionSnapshot;
      hasSnapshot =
        cached.dataSourceId === current.config.adapters.notion?.dataSourceId &&
        cached.contentHash === contentId('notion', cached.posts);
    }
    if (source) {
      if (source.ok) {
        if (options.mode === 'collect') {
          sourceHealth = source.health;
        } else if (policy) {
          const projection = projectNotionWorkflow({
            roadmap,
            snapshot: source.collection.snapshot,
            health: source.health,
            policy,
            config: current.config,
            now,
            receipts: priorReceipts,
            journal: priorJournal,
          });
          diagnostics.push(...projection.diagnostics);
          if (projection.valid) {
            roadmap = projection.roadmap;
            sourceReceipts = projection.receipts;
            journal = projection.journal;
            acceptedSnapshot = source.collection.snapshot;
            sourceHealth = source.health;
          } else {
            degraded = true;
            sourceHealth = failedSourceHealth(
              {
                provider: 'notion',
                state: 'uninitialized',
                lastAttemptAt: now,
                errorCode: 'schema',
              },
              current.health,
              hasSnapshot,
            );
          }
        } else {
          degraded = true;
          sourceHealth = failedSourceHealth(
            { provider: 'notion', state: 'uninitialized', lastAttemptAt: now, errorCode: 'schema' },
            current.health,
            hasSnapshot,
          );
        }
      } else {
        degraded = source.health.state !== 'offline';
        sourceHealth = failedSourceHealth(source.health, current.health, hasSnapshot);
        diagnostics.push(...source.diagnostics);
      }
    }
    if (sourceHealth) diagnostics.push(sourceHealthMessage(sourceHealth));
    if (options.mode === 'collect')
      return {
        schemaVersion: '1.0.0',
        mode: options.mode,
        dryRun: options.dryRun ?? false,
        roadmap,
        evidence: [
          ...evidence,
          ...(source?.ok ? source.collection.evidence.map(domainEvidence) : []),
        ],
        receipts: [],
        recommendations: [],
        diagnostics,
        changedPaths: [],
        degraded,
        ...(sourceHealth ? { sourceHealth } : {}),
      };
    const reconciled =
      options.mode === 'render'
        ? { roadmap, receipts: [], recommendations: roadmap.recommendations, diagnostics: [] }
        : reconcile({
            roadmap,
            evidence,
            receipts: [...priorReceipts, ...sourceReceipts],
            config: current.config,
            now,
          });
    const receipts = [...sourceReceipts, ...reconciled.receipts];
    const allReceipts = [...priorReceipts, ...receipts];
    const consistency = validateConsistency(reconciled.roadmap, allReceipts);
    if (!validateRoadmap(reconciled.roadmap).valid || consistency.length)
      throw new Error('Invalid reconciled roadmap');
    const writes: TransactionWrite[] = [];
    if (options.mode === 'reconcile' || options.mode === 'sync') {
      writes.push({ path: '.roadmap/roadmap.json', content: canonicalJson(reconciled.roadmap) });
      writes.push({
        path: '.roadmap/history.jsonl',
        content:
          (current.historyText ?? '') +
          (current.historyText && !current.historyText.endsWith('\n') ? '\n' : '') +
          receipts.map(canonicalJsonLine).join(''),
      });
      if (journal.length)
        writes.push({
          path: '.roadmap/source-changes.jsonl',
          content:
            (current.journalText ?? '') +
            (current.journalText && !current.journalText.endsWith('\n') ? '\n' : '') +
            journal.map(canonicalJsonLine).join(''),
        });
      if (acceptedSnapshot)
        writes.push({
          path: '.roadmap/sources/notion-posts.json',
          content: canonicalJson(acceptedSnapshot),
        });
      if (sourceHealth && source)
        writes.push({
          path: '.roadmap/sources/notion-health.json',
          content: canonicalJson(sourceHealth),
        });
    }
    if (options.mode === 'render' || options.mode === 'sync') {
      const format = options.format ?? 'all';
      if (format === 'all' || format === 'markdown')
        writes.push({
          path: 'ROADMAP.md',
          content:
            renderMarkdown(reconciled.roadmap) +
            (sourceHealth ? `\n## Source freshness\n\n${sourceHealthMessage(sourceHealth)}\n` : ''),
        });
      if (format === 'all' || format === 'html')
        writes.push({
          path: '.roadmap/roadmap.html',
          content: renderSourceNotice(
            options.renderHtml
              ? options.renderHtml(reconciled.roadmap)
              : defaultRenderHtml(reconciled.roadmap, {
                  defaultView: current.config.views.default,
                  stateScope: resolve(options.root),
                }),
            sourceHealth,
          ),
        });
    }
    const changed = await changedWrites(options.root, writes);
    if (!readOnly && changed.length)
      await new RepositoryTransaction(options.root, options.transactionOptions).commit(changed);
    return {
      schemaVersion: '1.0.0',
      mode: options.mode,
      dryRun: options.dryRun ?? false,
      roadmap: reconciled.roadmap,
      evidence,
      receipts,
      recommendations: reconciled.recommendations,
      diagnostics: [...diagnostics, ...reconciled.diagnostics],
      changedPaths: changed.map((w) => w.path),
      degraded,
      ...(sourceHealth ? { sourceHealth } : {}),
    };
  });
}
