import { describe, expect, it } from 'vitest';

import type { Roadmap, RoadmapItem } from '../../../src/types/index.js';
import { buildRoadmapViewModel } from '../../../src/renderers/index.js';

function item(
  overrides: Partial<RoadmapItem> & Pick<RoadmapItem, 'id' | 'kind' | 'title'>,
): RoadmapItem {
  return {
    status: 'active',
    horizon: 'now',
    commitment: 'planned',
    confidence: 'medium',
    extensions: {},
    ...overrides,
  };
}

function roadmap(): Roadmap {
  return {
    schemaVersion: '1.0.0',
    revision: 7,
    title: 'RMP delivery',
    items: [
      item({
        id: 'out-adoption',
        kind: 'outcome',
        title: 'Increase adoption',
        signal: { metric: 'weekly active repositories', target: 10, unit: 'repositories' },
      }),
      item({ id: 'del-cli', kind: 'deliverable', title: 'Ship CLI', status: 'completed' }),
      item({ id: 'mil-schema', kind: 'milestone', title: 'Stabilize schema' }),
      item({
        id: 'rel-october',
        kind: 'release',
        title: 'October release',
        horizon: 'next',
        schedule: {
          precision: 'window',
          earliest: '2026-10-01',
          latest: '2026-10-31',
          evidenceIds: [],
        },
      }),
    ],
    relationships: [
      { from: 'del-cli', to: 'out-adoption', type: 'supports' },
      { from: 'rel-october', to: 'mil-schema', type: 'dependsOn' },
    ],
    evidence: [
      {
        id: 'ev-plan',
        class: 'strategic',
        source: 'plan',
        sourceRef: 'plan.md',
        observedAt: '2026-09-20T12:00:00Z',
        summary: 'Release window approved for planning',
        extensions: {},
      },
    ],
    recommendations: [
      {
        id: 'rec-date',
        itemId: 'rel-october',
        proposedStatus: 'active',
        supportingEvidenceIds: ['ev-plan'],
        conflictingEvidenceIds: [],
        confidence: 'medium',
        rationale: 'Confirm the release window',
        requiredApprover: 'maintainer',
        status: 'open',
      },
    ],
    extensions: {},
  };
}

describe('buildRoadmapViewModel', () => {
  it('projects every view from the same canonical revision with stable ordering', () => {
    const view = buildRoadmapViewModel(roadmap());

    expect(view.revision).toBe(7);
    expect(Object.values(view.views).every((projection) => projection.revision === 7)).toBe(true);
    expect(view.views.outcome.items.map((entry) => entry.id)).toEqual(['out-adoption']);
    expect(view.views.delivery.items.map((entry) => entry.id)).toEqual(['del-cli', 'mil-schema']);
    expect(view.views.release.items.map((entry) => entry.id)).toEqual(['rel-october']);
    expect(view.views.dependency.relationships).toHaveLength(2);
    expect(view.views.history.evidence.map((entry) => entry.id)).toEqual(['ev-plan']);
  });

  it('does not infer outcome completion from completed delivery', () => {
    const view = buildRoadmapViewModel(roadmap());

    expect(view.views.delivery.items[0]?.status).toBe('completed');
    expect(view.views.outcome.items[0]?.status).toBe('active');
  });

  it('labels planning windows as forecasts and evidence-backed exact dates as committed', () => {
    const state = roadmap();
    state.items.push(
      item({
        id: 'rel-committed',
        kind: 'release',
        title: 'Committed release',
        commitment: 'committed',
        schedule: { precision: 'exact', date: '2026-11-15', evidenceIds: ['ev-plan'] },
      }),
    );

    const releases = buildRoadmapViewModel(state).views.release.items;

    expect(releases.find((entry) => entry.id === 'rel-october')?.scheduleLabel).toContain(
      'Forecast',
    );
    expect(releases.find((entry) => entry.id === 'rel-committed')?.scheduleLabel).toContain(
      'Committed',
    );
  });
});
