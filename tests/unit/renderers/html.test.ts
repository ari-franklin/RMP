import { describe, expect, it } from 'vitest';

import type { Roadmap, RoadmapItem } from '../../../src/types/index.js';
import type { RoadmapFormat } from '../../../src/formats/index.js';
import { renderHtml } from '../../../src/renderers/html.js';

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
    revision: 12,
    title: 'RMP <Launch> & learn',
    items: [
      item({
        id: 'out-adoption',
        kind: 'outcome',
        title: 'Increase adoption',
        signal: { metric: 'active repositories', target: 25, unit: 'repositories' },
        measurements: [
          {
            observedAt: '2026-09-20T12:00:00Z',
            value: 10,
            successful: false,
            evidenceIds: ['ev-metric'],
          },
        ],
      }),
      item({
        id: 'del-cli',
        kind: 'deliverable',
        title: 'Ship offline CLI',
        commitment: 'committed',
        confidence: 'high',
        status: 'blocked',
      }),
      item({ id: 'mil-schema', kind: 'milestone', title: 'Stabilize schema', horizon: 'next' }),
      item({
        id: 'rel-forecast',
        kind: 'release',
        title: 'Forecast release',
        horizon: 'next',
        schedule: {
          precision: 'window',
          earliest: '2026-10-01',
          latest: '2026-10-31',
          evidenceIds: [],
        },
      }),
      item({
        id: 'rel-committed',
        kind: 'release',
        title: 'Committed release',
        commitment: 'committed',
        confidence: 'high',
        schedule: { precision: 'exact', date: '2026-11-15', evidenceIds: ['ev-plan'] },
      }),
    ],
    relationships: [
      { from: 'del-cli', to: 'out-adoption', type: 'supports', expectedImpact: 'Adoption' },
      { from: 'rel-committed', to: 'mil-schema', type: 'dependsOn' },
    ],
    evidence: [
      {
        id: 'ev-metric',
        class: 'observedOutcome',
        source: 'measurement',
        sourceRef: 'metrics/adoption.json',
        observedAt: '2026-09-20T12:00:00Z',
        summary: 'Ten repositories are active',
        extensions: {},
      },
      {
        id: 'ev-plan',
        class: 'strategic',
        source: 'plan',
        sourceRef: 'plans/release.md',
        observedAt: '2026-09-19T12:00:00Z',
        summary: '</script><script>globalThis.compromised=true</script>',
        extensions: {},
      },
    ],
    recommendations: [
      {
        id: 'rec-unblock',
        itemId: 'del-cli',
        proposedStatus: 'active',
        supportingEvidenceIds: ['ev-plan'],
        conflictingEvidenceIds: [],
        confidence: 'medium',
        rationale: 'Resolve the release blocker',
        requiredApprover: 'maintainer',
        status: 'open',
      },
    ],
    extensions: {
      strategy: {
        anchor: 'Repository-first maintenance',
        baseline: 'Roadmaps drift after delivery',
        risks: ['Weak evidence'],
        assumptions: ['Teams keep stable identifiers'],
        openQuestions: ['Which signal is durable?'],
        nextActions: ['Validate adoption signal'],
        deferrals: ['Hosted synchronization'],
      },
    },
  };
}

const formats: RoadmapFormat[] = [
  'outcome-lanes',
  'now-next-later',
  'strategy-choice',
  'milestones',
  'opportunity-tree',
  'portfolio-bets',
  'quarterly-lanes',
  'dashboard',
  'gantt-release',
];

describe('renderHtml', () => {
  it('renders deterministic, escaped, self-contained semantic HTML', () => {
    const first = renderHtml(roadmap());
    const second = renderHtml(roadmap());

    expect(first).toBe(second);
    expect(first).toContain('<!doctype html>');
    expect(first).toContain('<title>RMP &lt;Launch&gt; &amp; learn</title>');
    expect(first).not.toContain('<script>globalThis.compromised=true</script>');
    expect(first).not.toMatch(/(?:src|href)=["']https?:/);
    expect(first).not.toContain('@import');
    expect(first).toContain('data-revision="12"');
  });

  it('places a comprehensive overview and five drill-down views before the evidence detail', () => {
    const html = renderHtml(roadmap());

    expect(html.match(/<button[^>]+role="tab"/g)).toHaveLength(6);
    expect(html.match(/<section[^>]+role="tabpanel"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Roadmap views"');
    expect(html).toContain('id="tab-overview"');
    expect(html).toMatch(/id="tab-overview"[^>]+aria-selected="true"/);
    expect(html).toContain('id="view-overview"');
    expect(html).toContain('data-pattern="now-next-later"');
    expect(html).toContain("showTab(typeof state.tab === 'string' ? state.tab : 'view-overview')");
    expect(html).toContain(`rmp-ui-state-v2-${String(roadmap().revision)}`);
    expect(html).toContain("event.key === 'ArrowRight'");
    expect(html.indexOf('id="roadmap-views"')).toBeLessThan(html.indexOf('id="evidence-risk"'));
    expect(html.indexOf('id="roadmap-views"')).toBeLessThan(html.indexOf('id="strategy-frame"'));
  });

  it('opens the configured perspective while retaining all alternate views', () => {
    const html = renderHtml(roadmap(), { defaultView: 'delivery' });

    expect(html).toMatch(/id="tab-delivery"[^>]+aria-selected="true"/);
    expect(html).toMatch(/id="tab-overview"[^>]+aria-selected="false"/);
    expect(html).toContain("showTab(typeof state.tab === 'string' ? state.tab : 'view-delivery')");
    expect(html).toContain('id="view-outcome"');
    expect(html).toContain('id="view-release"');
  });

  it('renders measured outcome roadmaps as a horizon kanban', () => {
    const state = roadmap();
    state.items = state.items.filter((entry) => entry.kind !== 'release');

    const html = renderHtml(state);

    expect(html).toContain('data-pattern="outcome-lanes"');
    expect(html).toContain('class="pattern-now-next-later horizon-grid"');
  });

  it('derives useful framing and renders item descriptions without empty boilerplate', () => {
    const state = roadmap();
    state.extensions = {};
    const delivery = state.items[1];
    if (delivery === undefined) throw new Error('Expected delivery fixture');
    state.items[1] = {
      ...delivery,
      description: 'Deliver a reliable repository-native maintenance workflow.',
    };

    const html = renderHtml(state);

    expect(html).toContain('Increase adoption');
    expect(html).toContain('Deliver a reliable repository-native maintenance workflow.');
    expect(html).toContain('4 active');
    expect(html).not.toContain('No strategic anchor is recorded.');
    expect(html).not.toContain('No baseline is recorded.');
    expect(html).not.toContain('No next actions are recorded.');
    expect(html).not.toContain('No risks are recorded.');
    expect(html).not.toContain('Repository team');
    expect(html).not.toContain('Sequence evidence-backed roadmap work');
    expect(html).not.toContain('Local interactions only. Canonical roadmap state is unchanged.');
  });

  it('exposes framing, uncertainty, measures, risks, and validation needs as text', () => {
    const html = renderHtml(roadmap(), {
      audience: 'Delivery team',
      horizon: 'Now through 2026',
      decision: 'Sequence the release safely',
    });

    for (const text of [
      'Delivery team',
      'Now through 2026',
      'Sequence the release safely',
      'Repository-first maintenance',
      'Roadmaps drift after delivery',
      'active repositories',
      'Weak evidence',
      'Teams keep stable identifiers',
      'Which signal is durable?',
      'Validate adoption signal',
      'Hosted synchronization',
      'Validation needs',
      'Confidence: high',
      '<span class="commitment-label">committed</span>',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('distinguishes committed dates from forecasts and only emits positioned bars for exact data', () => {
    const html = renderHtml(roadmap(), { format: 'gantt-release' });

    expect(html).toContain('Committed: 2026-11-15');
    expect(html).toContain('Forecast: 2026-10-01 to 2026-10-31');
    expect(html).toContain('class="timeline-bar"');
    expect(html).toContain('class="timeline-marker"');
  });

  it.each(formats)('renders the %s pattern with a distinct layout hook', (format) => {
    const html = renderHtml(roadmap(), { format });

    expect(html).toContain(`data-pattern="${format}"`);
    expect(html).toContain(`pattern-${format}`);
  });

  it('embeds responsive and print rules plus local filtering, evidence, proposal, and reset controls', () => {
    const html = renderHtml(roadmap());

    expect(html).toMatch(/@media\s*\(max-width:\s*760px\)/);
    expect(html).toContain('@media print');
    expect(html).toMatch(/overflow-wrap:\s*anywhere/);
    expect(html).toContain('data-filter="status"');
    expect(html).toContain('<details class="evidence-entry"');
    expect(html).toContain('id="export-proposal"');
    expect(html).toContain('id="reset-ui"');
    expect(html).toContain('localStorage.setItem(UI_STATE_KEY');
    expect(html).toContain('localStorage.removeItem(UI_STATE_KEY)');
    expect(html).toContain('application/json');
    expect(html).toContain('proposalOnly: true');
    expect(html).not.toContain('Canonical roadmap state is unchanged');
  });
});
