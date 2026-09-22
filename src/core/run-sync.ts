import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AdapterRegistry,
  GitEvidenceAdapter,
  LocalEvidenceAdapter,
  type Adapter,
  type NormalizedEvidence,
} from '../adapters/index.js';
import { loadConfig } from '../config/index.js';
import { renderHtml as defaultRenderHtml, renderMarkdown } from '../renderers/index.js';
import { validateRoadmap } from '../schemas/index.js';
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
  format?: RenderFormat;
  adapters?: Adapter[];
  now?: string;
  renderHtml?: typeof defaultRenderHtml;
}

export interface RunSyncResult {
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
    .map((line) => JSON.parse(line) as TransitionReceipt);
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

export async function runSync(options: RunSyncOptions): Promise<RunSyncResult> {
  const roadmapText = await optionalText(join(options.root, '.roadmap', 'roadmap.json'));
  if (roadmapText === undefined)
    throw new Error('Invalid repository: missing .roadmap/roadmap.json');
  const validated = validateRoadmap(parseJson(roadmapText, 'roadmap'));
  if (!validated.valid) {
    throw new Error(`Invalid roadmap: ${validated.diagnostics[0]?.message ?? 'validation failed'}`);
  }

  const configText = (await optionalText(join(options.root, '.roadmap', 'config.json'))) ?? '{}';
  const config = loadConfig(parseJson(configText, 'config'));
  if (!config.valid) {
    throw new Error(`Invalid config: ${config.diagnostics[0]?.message ?? 'validation failed'}`);
  }

  const historyText = await optionalText(join(options.root, '.roadmap', 'history.jsonl'));
  const priorReceipts = parseHistory(historyText);
  const shouldCollect = options.mode !== 'render';
  const collection = shouldCollect
    ? await new AdapterRegistry(
        options.adapters ?? [new LocalEvidenceAdapter(), new GitEvidenceAdapter()],
      ).collect({ repositoryRoot: options.root })
    : { evidence: [], diagnostics: [], cursors: {} };
  const evidence = collection.evidence.map(domainEvidence);

  if (options.mode === 'collect') {
    return {
      schemaVersion: '1.0.0',
      mode: options.mode,
      dryRun: options.dryRun ?? false,
      roadmap: validated.value,
      evidence,
      receipts: [],
      recommendations: [],
      diagnostics: collection.diagnostics.map((entry) => entry.message),
      changedPaths: [],
    };
  }

  const reconciled =
    options.mode === 'render'
      ? {
          roadmap: validated.value,
          receipts: [] as TransitionReceipt[],
          recommendations: validated.value.recommendations,
          diagnostics: [] as string[],
        }
      : reconcile({
          roadmap: validated.value,
          evidence,
          receipts: priorReceipts,
          config: config.config,
          now: options.now ?? new Date().toISOString(),
        });
  const allReceipts = [...priorReceipts, ...reconciled.receipts];
  const consistency = validateConsistency(reconciled.roadmap, allReceipts);
  const finalValidation = validateRoadmap(reconciled.roadmap);
  if (!finalValidation.valid || consistency.length > 0) {
    const message = finalValidation.valid
      ? (consistency[0]?.message ?? 'Consistency validation failed')
      : (finalValidation.diagnostics[0]?.message ?? 'Schema validation failed');
    throw new Error(`Invalid reconciled roadmap: ${message}`);
  }

  const writes: TransactionWrite[] = [];
  if (options.mode === 'reconcile' || options.mode === 'sync') {
    writes.push({ path: '.roadmap/roadmap.json', content: canonicalJson(reconciled.roadmap) });
    writes.push({
      path: '.roadmap/history.jsonl',
      content: allReceipts.map(canonicalJsonLine).join(''),
    });
  }
  if (options.mode === 'render' || options.mode === 'sync') {
    const format = options.format ?? 'all';
    if (format === 'all' || format === 'markdown') {
      writes.push({ path: 'ROADMAP.md', content: renderMarkdown(reconciled.roadmap) });
    }
    if (format === 'all' || format === 'html') {
      writes.push({
        path: '.roadmap/roadmap.html',
        content: (options.renderHtml ?? defaultRenderHtml)(reconciled.roadmap),
      });
    }
  }

  const changed = await changedWrites(options.root, writes);
  if (!(options.dryRun ?? false) && changed.length > 0) {
    await new RepositoryTransaction(options.root).commit(changed);
  }

  return {
    schemaVersion: '1.0.0',
    mode: options.mode,
    dryRun: options.dryRun ?? false,
    roadmap: reconciled.roadmap,
    evidence,
    receipts: reconciled.receipts,
    recommendations: reconciled.recommendations,
    diagnostics: [
      ...collection.diagnostics.map((entry) => entry.message),
      ...reconciled.diagnostics,
    ],
    changedPaths: changed.map((write) => write.path),
  };
}
