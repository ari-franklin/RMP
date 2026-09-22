import { describe, expect, it } from 'vitest';

import { reconcile } from '../../../src/core/index.js';
import { evidence, item, roadmap } from './helpers.js';

describe('reconcile', () => {
  it('automatically applies strong evidence and ignores duplicate processing', () => {
    const signal = evidence('ev-complete', 'deterministic', 'completed');
    const first = reconcile({
      roadmap: roadmap(),
      evidence: [signal],
      now: '2026-09-20T13:00:00.000Z',
    });
    const second = reconcile({
      roadmap: first.roadmap,
      evidence: [signal],
      receipts: first.receipts,
      now: '2026-09-20T14:00:00.000Z',
    });

    expect(first.receipts).toHaveLength(1);
    expect(first.roadmap.items[0]?.status).toBe('completed');
    expect(second.receipts).toEqual([]);
    expect(second.recommendations).toEqual([]);
    expect(second.roadmap).toEqual(first.roadmap);
  });

  it('creates recommendations for stale signals, blockers, and strategic changes', () => {
    const result = reconcile({
      roadmap: roadmap(),
      evidence: [
        evidence('ev-stale', 'inferred', 'blocked'),
        evidence('ev-strategy', 'strategic', 'cancelled'),
      ],
      now: '2026-09-20T13:00:00.000Z',
    });

    expect(result.receipts).toEqual([]);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations.map((entry) => entry.supportingEvidenceIds)).toEqual([
      ['ev-stale'],
      ['ev-strategy'],
    ]);
    expect(result.roadmap.items[0]?.status).toBe('active');
  });

  it('records conflicting evidence in one recommendation and makes no transition', () => {
    const result = reconcile({
      roadmap: roadmap(),
      evidence: [
        evidence('ev-done', 'deterministic', 'completed'),
        evidence('ev-blocked', 'deterministic', 'blocked'),
      ],
      now: '2026-09-20T13:00:00.000Z',
    });

    expect(result.receipts).toEqual([]);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toMatchObject({
      supportingEvidenceIds: ['ev-blocked'],
      conflictingEvidenceIds: ['ev-done'],
    });
    expect(result.roadmap.items[0]?.status).toBe('active');
  });

  it('completes delivery while leaving a linked outcome open', () => {
    const state = roadmap({
      items: [
        item(),
        item({
          id: 'out-adoption',
          kind: 'outcome',
          title: 'Increase adoption',
          signal: { metric: 'adoption', target: 10, unit: 'repos' },
          measurements: [],
        }),
      ],
      relationships: [{ from: 'del-cli', to: 'out-adoption', type: 'supports' }],
    });

    const result = reconcile({
      roadmap: state,
      evidence: [evidence('ev-deploy', 'deterministic', 'completed')],
      now: '2026-09-20T13:00:00.000Z',
    });

    expect(result.roadmap.items.find((entry) => entry.id === 'del-cli')?.status).toBe('completed');
    expect(result.roadmap.items.find((entry) => entry.id === 'out-adoption')?.status).toBe(
      'active',
    );
  });

  it('completes an outcome only from its successful measured signal', () => {
    const signal = evidence('ev-outcome', 'observedOutcome', 'completed', {
      itemId: 'out-adoption',
      measurement: { value: 12, successful: true },
    });
    const state = roadmap({
      items: [
        item({
          id: 'out-adoption',
          kind: 'outcome',
          signal: { metric: 'adoption', target: 10, unit: 'repos' },
          measurements: [],
        }),
      ],
    });

    const result = reconcile({
      roadmap: state,
      evidence: [signal],
      now: '2026-09-20T13:00:00.000Z',
    });

    expect(result.roadmap.items[0]).toMatchObject({
      status: 'completed',
      measurements: [
        {
          value: 12,
          successful: true,
          evidenceIds: ['ev-outcome'],
        },
      ],
    });
  });
});
