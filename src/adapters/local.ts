import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import type {
  Adapter,
  AdapterCollection,
  AdapterCollectionContext,
  AdapterDiagnostic,
  AdapterIdentity,
  NormalizedEvidence,
} from './types.js';

interface LocalRecord {
  id?: unknown;
  itemId?: unknown;
  itemIds?: unknown;
  metric?: unknown;
  observedAt?: unknown;
  releasedAt?: unknown;
  successful?: unknown;
  tag?: unknown;
  value?: unknown;
}

async function filesUnder(root: string, suffix: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const path = resolve(root, entry.name);
        return entry.isDirectory()
          ? filesUnder(path, suffix)
          : entry.name.endsWith(suffix)
            ? [path]
            : [];
      }),
    );
    return files.flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function itemRefs(record: LocalRecord): string[] | undefined {
  if (typeof record.itemId === 'string') return [record.itemId];
  if (Array.isArray(record.itemIds) && record.itemIds.every((value) => typeof value === 'string')) {
    return record.itemIds;
  }
  return [];
}

export class LocalEvidenceAdapter implements Adapter {
  readonly identity: AdapterIdentity = {
    provider: 'local',
    version: '1.0.0',
    capabilities: ['measurements', 'releases', 'workItems'],
  };

  async collect(context: AdapterCollectionContext): Promise<AdapterCollection> {
    const evidence: NormalizedEvidence[] = [];
    const diagnostics: AdapterDiagnostic[] = [];

    await this.collectPlans(context.repositoryRoot, evidence);
    await this.collectRecords(context.repositoryRoot, 'measurements', evidence, diagnostics);
    await this.collectRecords(context.repositoryRoot, 'releases', evidence, diagnostics);

    return { evidence, diagnostics };
  }

  private async collectPlans(root: string, evidence: NormalizedEvidence[]): Promise<void> {
    for (const path of await filesUnder(resolve(root, 'plans'), '.md')) {
      const content = await readFile(path, 'utf8');
      const itemId = /^RMP-Item:\s*(\S+)\s*$/im.exec(content)?.[1];
      const completed = /^RMP-Status:\s*completed\s*$/im.test(content);
      if (!itemId || !completed) continue;
      const sourceRef = relative(root, path);
      evidence.push({
        id: `local-plan-${itemId}`,
        kind: 'planCompletion',
        class: 'deterministic',
        observedAt: '1970-01-01T00:00:00.000Z',
        summary: `Plan explicitly completed for ${itemId}`,
        itemRefs: [itemId],
        provenance: { provider: 'local', eventId: `plan:${sourceRef}:${itemId}`, sourceRef },
        data: {},
      });
    }
  }

  private async collectRecords(
    root: string,
    directory: 'measurements' | 'releases',
    evidence: NormalizedEvidence[],
    diagnostics: AdapterDiagnostic[],
  ): Promise<void> {
    for (const path of await filesUnder(resolve(root, '.roadmap', directory), '.json')) {
      const sourceRef = relative(root, path);
      let record: LocalRecord;
      try {
        record = JSON.parse(await readFile(path, 'utf8')) as LocalRecord;
      } catch {
        diagnostics.push({
          provider: 'local',
          code: 'invalid-record',
          message: 'Invalid JSON record',
          sourceRef,
        });
        continue;
      }
      const refs = itemRefs(record);
      if (refs && refs.length > 1) {
        diagnostics.push({
          provider: 'local',
          code: 'ambiguous-item',
          message: 'Record identifies multiple roadmap items',
          sourceRef,
        });
        continue;
      }
      if (typeof record.id !== 'string' || refs === undefined || refs.length !== 1) {
        diagnostics.push({
          provider: 'local',
          code: 'invalid-record',
          message: 'Record requires one item and immutable ID',
          sourceRef,
        });
        continue;
      }
      const measurement = directory === 'measurements';
      const observedAt = measurement ? record.observedAt : record.releasedAt;
      if (typeof observedAt !== 'string') {
        diagnostics.push({
          provider: 'local',
          code: 'invalid-record',
          message: 'Record requires an observation timestamp',
          sourceRef,
        });
        continue;
      }
      evidence.push({
        id: `local-${record.id}`,
        kind: measurement ? 'measurement' : 'release',
        class: measurement ? 'observedOutcome' : 'deterministic',
        observedAt,
        summary: measurement
          ? `Measured ${String(record.metric)}`
          : `Released ${String(record.tag)}`,
        itemRefs: refs,
        provenance: { provider: 'local', eventId: record.id, sourceRef },
        data: { ...record },
      });
    }
  }
}
