import { describe, expect, it } from 'vitest';

import { applyTransition, validateConsistency } from '../../../src/core/index.js';
import type { TransitionReceipt } from '../../../src/types/index.js';
import { evidence, item, roadmap } from './helpers.js';

describe('applyTransition', () => {
  it('returns a new revision and auditable receipt without mutating input', () => {
    const state = roadmap();
    const original = structuredClone(state);
    const signal = evidence('ev-complete', 'deterministic', 'completed');

    const result = applyTransition({
      roadmap: state,
      itemId: 'del-cli',
      newStatus: 'completed',
      evidence: [signal],
      authorizingRule: 'deterministic:automatic',
      actor: 'test-adapter',
      timestamp: '2026-09-20T13:00:00.000Z',
    });

    expect(state).toEqual(original);
    expect(result.roadmap.revision).toBe(4);
    expect(result.roadmap.items[0]?.status).toBe('completed');
    expect(result.receipt).toMatchObject({
      itemId: 'del-cli',
      previousStatus: 'active',
      newStatus: 'completed',
      evidenceIds: ['ev-complete'],
      evidenceClass: 'deterministic',
      authorizingRule: 'deterministic:automatic',
      disposition: 'automatic',
    });
  });

  it('rejects illegal moves without mutating state', () => {
    const state = roadmap({ items: [item({ status: 'completed' })] });
    const original = structuredClone(state);

    expect(() =>
      applyTransition({
        roadmap: state,
        itemId: 'del-cli',
        newStatus: 'proposed',
        evidence: [evidence('ev-reopen', 'deterministic', 'proposed')],
        authorizingRule: 'deterministic:automatic',
        actor: 'test',
        timestamp: '2026-09-20T13:00:00.000Z',
      }),
    ).toThrow(/illegal transition/i);
    expect(state).toEqual(original);
  });

  it('permits deterministic release evidence to complete a proposed release', () => {
    const signal = evidence('ev-release', 'deterministic', 'completed');
    const result = applyTransition({
      roadmap: roadmap({ items: [item({ id: 'rel-first', kind: 'release', status: 'proposed' })] }),
      itemId: 'rel-first',
      newStatus: 'completed',
      evidence: [signal],
      authorizingRule: 'deterministic:automatic',
      actor: 'local',
      timestamp: '2026-09-21T18:00:00.000Z',
    });

    expect(result.roadmap.items[0]?.status).toBe('completed');
    expect(result.receipt).toMatchObject({
      previousStatus: 'proposed',
      newStatus: 'completed',
      evidenceClass: 'deterministic',
    });
  });

  it.each([
    ['deliverable', 'deterministic'],
    ['release', 'inferred'],
  ] as const)(
    'rejects proposed-to-completed for %s items with %s evidence',
    (kind, evidenceClass) => {
      expect(() =>
        applyTransition({
          roadmap: roadmap({ items: [item({ kind, status: 'proposed' })] }),
          itemId: 'del-cli',
          newStatus: 'completed',
          evidence: [evidence('ev-complete', evidenceClass, 'completed')],
          authorizingRule: `${evidenceClass}:automatic`,
          actor: 'test',
          timestamp: '2026-09-21T18:00:00.000Z',
        }),
      ).toThrow(/illegal transition/i);
    },
  );

  it('permits an explicit reversal that supersedes an earlier receipt', () => {
    const result = applyTransition({
      roadmap: roadmap({ items: [item({ status: 'completed' })] }),
      itemId: 'del-cli',
      newStatus: 'active',
      evidence: [evidence('ev-reversal', 'corroborated', 'active')],
      authorizingRule: 'corroborated:approved-reversal',
      actor: 'roadmap-owner',
      timestamp: '2026-09-20T13:00:00.000Z',
      disposition: 'approved',
      supersedes: 'tr-earlier',
    });

    expect(result.receipt).toMatchObject({ supersedes: 'tr-earlier', disposition: 'approved' });
  });
});

describe('validateConsistency', () => {
  it('reports broken references, duplicate IDs, and unsupported outcome completion', () => {
    const invalid = roadmap({
      items: [
        item({ id: 'out-adoption', kind: 'outcome', status: 'completed', measurements: [] }),
        item({ id: 'out-adoption', kind: 'outcome', measurements: [] }),
      ],
      relationships: [{ from: 'missing', to: 'out-adoption', type: 'supports' }],
    });

    expect(validateConsistency(invalid).map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'duplicate-id',
        'broken-reference',
        'unsupported-outcome-completion',
      ]),
    );
  });

  it('reports duplicate receipt processing', () => {
    const receipt = {
      id: 'tr-one',
      schemaVersion: '1.0.0',
      itemId: 'del-cli',
      previousStatus: 'active',
      newStatus: 'completed',
      timestamp: '2026-09-20T13:00:00.000Z',
      evidenceIds: ['ev-complete'],
      evidenceClass: 'deterministic',
      authorizingRule: 'deterministic:automatic',
      actor: 'test',
      disposition: 'automatic',
      extensions: {},
    } satisfies TransitionReceipt;

    expect(validateConsistency(roadmap(), [receipt, receipt])).toContainEqual(
      expect.objectContaining({ code: 'duplicate-receipt' }),
    );
  });
});
