import type { Evidence, Roadmap, RoadmapItem, RoadmapStatus } from '../../../src/types/index.js';

export function item(overrides: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: 'del-cli',
    kind: 'deliverable',
    title: 'Ship the CLI',
    status: 'active',
    horizon: 'now',
    commitment: 'committed',
    confidence: 'high',
    extensions: {},
    ...overrides,
  };
}

export function evidence(
  id: string,
  evidenceClass: Evidence['class'],
  proposedStatus: RoadmapStatus,
  extension: Record<string, unknown> = { itemId: 'del-cli' },
): Evidence {
  return {
    id,
    class: evidenceClass,
    source: 'test',
    sourceRef: `test:${id}`,
    observedAt: '2026-09-20T12:00:00.000Z',
    summary: `${evidenceClass} evidence for ${proposedStatus}`,
    extensions: {
      'rmp.dev/transition': { proposedStatus, ...extension },
    },
  };
}

export function roadmap(overrides: Partial<Roadmap> = {}): Roadmap {
  return {
    schemaVersion: '1.0.0',
    revision: 3,
    title: 'Test roadmap',
    items: [item()],
    relationships: [],
    evidence: [],
    recommendations: [],
    extensions: {},
    ...overrides,
  };
}
