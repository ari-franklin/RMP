import { describe, expect, it } from 'vitest';

import { matchEvidence } from '../../../src/core/index.js';
import { evidence, item, roadmap } from './helpers.js';

describe('matchEvidence', () => {
  it('prefers an explicit item reference over all other candidates', () => {
    const state = roadmap({
      items: [
        item({ id: 'del-cli', extensions: { 'rmp.dev/source': { links: ['plan:phase-3'] } } }),
        item({ id: 'del-docs', title: 'Write docs' }),
      ],
    });
    const signal = evidence('ev-explicit', 'deterministic', 'completed', {
      itemId: 'del-docs',
      sourceLinks: ['plan:phase-3'],
    });

    expect(matchEvidence(state, signal)).toEqual({
      kind: 'explicit',
      itemIds: ['del-docs'],
      evidenceId: 'ev-explicit',
    });
  });

  it('uses a unique source link when no explicit item reference exists', () => {
    const state = roadmap({
      items: [
        item({ extensions: { 'rmp.dev/source': { links: ['plan:phase-2'] } } }),
        item({ id: 'del-docs', title: 'Write docs' }),
      ],
    });

    expect(
      matchEvidence(
        state,
        evidence('ev-link', 'corroborated', 'completed', { sourceLinks: ['plan:phase-2'] }),
      ),
    ).toMatchObject({ kind: 'source-link', itemIds: ['del-cli'] });
  });

  it('reports ambiguous source links without selecting an automatic target', () => {
    const state = roadmap({
      items: [
        item({ extensions: { 'rmp.dev/source': { links: ['issue:42'] } } }),
        item({
          id: 'del-docs',
          title: 'Write docs',
          extensions: { 'rmp.dev/source': { links: ['issue:42'] } },
        }),
      ],
    });

    expect(
      matchEvidence(
        state,
        evidence('ev-ambiguous', 'deterministic', 'completed', { sourceLinks: ['issue:42'] }),
      ),
    ).toMatchObject({ kind: 'ambiguous', itemIds: ['del-cli', 'del-docs'] });
  });

  it('marks title similarity as fuzzy and unmatched evidence as unmatched', () => {
    const fuzzy = evidence('ev-fuzzy', 'inferred', 'blocked', {
      title: 'Ship CLI',
    });
    const missing = evidence('ev-missing', 'inferred', 'blocked', {
      title: 'Completely unrelated work',
    });

    expect(matchEvidence(roadmap(), fuzzy).kind).toBe('fuzzy');
    expect(matchEvidence(roadmap(), missing)).toMatchObject({ kind: 'unmatched', itemIds: [] });
  });
});
