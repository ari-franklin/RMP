import { describe, expect, it } from 'vitest';

import type { Roadmap } from '../../../src/types/index.js';
import { renderMarkdown } from '../../../src/renderers/index.js';

const state: Roadmap = {
  schemaVersion: '1.0.0',
  revision: 3,
  title: 'Focused roadmap',
  items: [
    {
      id: 'out-focus',
      kind: 'outcome',
      title: 'Improve focus',
      status: 'active',
      horizon: 'now',
      commitment: 'planned',
      confidence: 'medium',
      signal: { metric: 'completed priorities', target: 5, unit: 'priorities' },
      extensions: {},
    },
    {
      id: 'del-current',
      kind: 'deliverable',
      title: 'Current work',
      status: 'blocked',
      horizon: 'now',
      commitment: 'committed',
      confidence: 'high',
      extensions: {},
    },
    {
      id: 'del-backlog',
      kind: 'deliverable',
      title: 'Uncommitted distant backlog',
      status: 'proposed',
      horizon: 'later',
      commitment: 'exploratory',
      confidence: 'low',
      extensions: {},
    },
  ],
  relationships: [],
  evidence: [],
  recommendations: [],
  extensions: {},
};

describe('renderMarkdown', () => {
  it('is deterministic and includes rationale, focus, risks, and revision metadata', () => {
    const first = renderMarkdown(state);
    const second = renderMarkdown(state);

    expect(first).toBe(second);
    expect(first).toContain('# Focused roadmap');
    expect(first).toContain('Revision: 3');
    expect(first).toContain('Selected format: Outcome lanes');
    expect(first).toContain('## Strategic anchor');
    expect(first).toContain('## Current focus');
    expect(first).toContain('## Blockers');
    expect(first).toContain('## Validation needs');
  });

  it('does not dump exploratory later backlog into the concise projection', () => {
    const markdown = renderMarkdown(state);

    expect(markdown).toContain('Current work');
    expect(markdown).not.toContain('Uncommitted distant backlog');
  });
});
