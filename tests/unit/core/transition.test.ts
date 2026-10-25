import { fixture, post, pid, iid, managed } from '../../helpers/notion-projection.js';
import { contentId } from '../../../src/utils/ids.js';
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

describe('registered Notion mirror transitions', () => {
  function request() {
    const input = fixture([post(1, 'published')], { pageToItem: { [pid(1)]: iid(1) } });
    input.roadmap.items = [managed(1)];
    const observed = input.snapshot.posts[0];
    if (!observed) throw new Error('Fixture missing');
    return {
      roadmap: input.roadmap,
      itemId: iid(1),
      newStatus: 'completed' as const,
      evidence: [
        {
          id: `ev-${contentId('notion', observed)}`,
          class: 'deterministic' as const,
          source: 'notion',
          sourceRef: `https://www.notion.so/${pid(1)}`,
          observedAt: observed.lastEditedAt,
          summary: 'Observed',
          extensions: {},
        },
      ],
      authorizingRule: 'notion:source-mirror:v1',
      actor: 'notion',
      timestamp: input.now,
      config: input.config,
      sourceMirror: {
        policy: input.policy,
        snapshot: input.snapshot,
        health: input.health,
        pageId: pid(1),
      },
    };
  }
  it('permits one direct publication receipt without fake active state', () => {
    const result = applyTransition(request());
    expect(result.receipt).toMatchObject({ previousStatus: 'proposed', newStatus: 'completed' });
  });
  it.each([
    'mapping',
    'source-owner',
    'policy',
    'approval',
    'terminal',
    'outcome',
    'evidence',
    'freshness',
    'no-config',
  ] as const)('rejects a %s bypass even through direct core calls', (bad) => {
    const input = request();
    const target = input.roadmap.items[0];
    if (!target) throw new Error('Fixture missing');
    if (bad === 'mapping') {
      const p = input.sourceMirror.snapshot.posts[0];
      if (!p) throw new Error('Fixture missing');
      p.statusOptionId = 'idea';
      input.sourceMirror.snapshot.contentHash = contentId(
        'notion',
        input.sourceMirror.snapshot.posts,
      );
      input.sourceMirror.policy.statusMapping.idea.roadmapStatus = 'completed';
      input.roadmap.extensions['content/notion-workflow'] = structuredClone(
        input.sourceMirror.policy,
      ) as unknown as Record<string, unknown>;
      input.evidence[0] = {
        ...input.evidence[0],
        id: `ev-${contentId('notion', p)}`,
      } as (typeof input.evidence)[number];
    }
    if (bad === 'source-owner')
      target.extensions['content/workflow'] = {
        source: 'notion:writing-ideas',
        dataSourceId: 'other-source',
      };
    if (bad === 'policy') delete input.roadmap.extensions['content/notion-workflow'];
    if (bad === 'approval')
      input.config.authority = { ...input.config.authority, deterministic: 'approval' };
    if (bad === 'terminal') target.status = 'cancelled';
    if (bad === 'outcome') target.kind = 'outcome';
    if (bad === 'evidence')
      input.evidence[0] = {
        ...input.evidence[0],
        id: 'ev-fake',
      } as (typeof input.evidence)[number];
    if (bad === 'freshness') Object.assign(input.sourceMirror.health, { state: 'stale' });
    if (bad === 'no-config') {
      const { config, ...withoutConfig } = input;
      expect(config).toBeDefined();
      expect(() => applyTransition(withoutConfig)).toThrow();
    } else expect(() => applyTransition(input)).toThrow();
  });
});
