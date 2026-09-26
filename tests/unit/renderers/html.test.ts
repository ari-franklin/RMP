import { describe, expect, it } from 'vitest';

import type { Roadmap, RoadmapItem } from '../../../src/types/index.js';
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
        sourceRef: 'plans/plan.md',
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

  it('opens project context and provides five focused roadmap views', () => {
    const html = renderHtml(roadmap());

    expect(html.match(/<button[^>]+role="tab"/g)).toHaveLength(6);
    expect(html.match(/<section[^>]+role="tabpanel"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="Roadmap views"');
    expect(html).not.toContain('id="tab-overview"');
    expect(html).toMatch(/id="tab-context"[^>]+aria-selected="true"/);
    expect(html).toContain('id="view-context"');
    expect(html).toContain("showTab(typeof state.tab === 'string' ? state.tab : 'view-context')");
    expect(html).toContain(`rmp-ui-state-v2-${String(roadmap().revision)}`);
    expect(html).toContain("event.key === 'ArrowRight'");
    expect(html.indexOf('id="roadmap-views"')).toBeLessThan(html.indexOf('id="evidence-risk"'));
    expect(html.indexOf('id="roadmap-views"')).toBeLessThan(html.indexOf('id="strategy-frame"'));
  });

  it('opens the configured perspective while retaining all alternate views', () => {
    const html = renderHtml(roadmap(), { defaultView: 'delivery' });

    expect(html).toMatch(/id="tab-delivery"[^>]+aria-selected="true"/);
    expect(html).toMatch(/id="tab-context"[^>]+aria-selected="false"/);
    expect(html).toContain("showTab(typeof state.tab === 'string' ? state.tab : 'view-delivery')");
    expect(html).toContain('id="view-outcome"');
    expect(html).toContain('id="view-release"');
    expect(html).toMatch(/id="view-outcome"[\s\S]+?data-pattern="outcome-lanes"/);
    expect(html).toMatch(/id="view-delivery"[\s\S]+?data-pattern="delivery-plan"/);
    expect(html).toMatch(/id="view-release"[\s\S]+?data-pattern="gantt-release"/);
  });

  it('renders measured outcome roadmaps without using kanban for delivery', () => {
    const state = roadmap();
    state.items = state.items.filter((entry) => entry.kind !== 'release');

    const html = renderHtml(state);

    expect(html).toContain('data-pattern="outcome-lanes"');
    expect(html).toContain('class="pattern-now-next-later horizon-grid"');
    expect(html).toMatch(/id="view-delivery"[\s\S]+?data-pattern="delivery-plan"/);
    expect(html).toContain('class="delivery-plan-axis"');
    expect(html).toContain('class="delivery-plan-bar horizon-now');
    expect(html).toContain('<strong>Supports:</strong> Increase adoption');
    expect(html).toContain('data-delivery-window="0">30 days</span>');
    expect(html).toContain('data-delivery-window="1">60 days</span>');
    expect(html).toContain('data-delivery-window="2">90 days</span>');
    expect(html).toContain('draggable="true" data-item data-item-id="out-adoption"');
    expect(html).toContain('data-drop-horizon="now"');
    expect(html).toContain('nextState.horizonMoves');
    expect(html).toContain('id="save-roadmap" class="primary-save" type="button" disabled');
    expect(html).toContain("fetch('/api/save'");
    expect(html).toContain('updateSaveButton()');
    expect(html).toContain("location.href = 'http://127.0.0.1:4177/#rmp-save='");
    expect(html).not.toContain('Open with rmp serve to save');
  });

  it('keeps completed work out of the outcomes roadmap', () => {
    const state = roadmap();
    const delivery = state.items.find((entry) => entry.id === 'del-cli');
    if (delivery === undefined) throw new Error('Expected delivery fixture');
    delivery.status = 'completed';

    const html = renderHtml(state);
    const outcomePanel = html.match(/id="view-outcome"[\s\S]+?id="view-delivery"/)?.[0] ?? '';

    expect(outcomePanel).not.toContain('Ship offline CLI');
  });

  it('leaves browser-created outcomes untagged until they have a workflow artifact', () => {
    const state = roadmap();
    const outcome = state.items.find((entry) => entry.kind === 'outcome');
    if (outcome === undefined) throw new Error('Expected outcome fixture');
    state.items.push({
      ...outcome,
      id: 'out-browser-test',
      title: 'New browser outcome',
      extensions: { 'rmp/workflow': { artifacts: [] } },
    });

    const html = renderHtml(state);
    const card = html.match(/data-item-id="out-browser-test"[\s\S]+?<\/article>/)?.[0] ?? '';

    expect(card).not.toContain('workflow-label');
  });

  it('derives useful project context without generic boilerplate', () => {
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
    ]) {
      expect(html).toContain(text);
    }
  });

  it('renders exact releases as dated events and keeps forecast windows as open markers', () => {
    const html = renderHtml(roadmap(), { format: 'gantt-release' });

    expect(html).toContain('<time datetime="2026-11-15">2026-11-15</time>');
    expect(html).toContain('class="timeline-dot"');
    expect(html).toContain('Forecast: 2026-10-01 to 2026-10-31');
    expect(html).toContain('class="timeline-marker"');
    expect(html).toContain('Published <span>1</span>');
    expect(html).toContain('Upcoming / date open <span>1</span>');
  });

  it('embeds responsive and print rules plus local editing, evidence, save, and reset controls', () => {
    const html = renderHtml(roadmap());

    expect(html).toMatch(/@media\s*\(max-width:\s*760px\)/);
    expect(html).toContain('@media print');
    expect(html).toMatch(/overflow-wrap:\s*anywhere/);
    expect(html).toContain('data-filter="status"');
    expect(html).toContain('<details class="evidence-entry"');
    expect(html).not.toContain('id="export-proposal"');
    expect(html).toContain('id="reset-ui"');
    expect(html).toContain('localStorage.setItem(UI_STATE_KEY');
    expect(html).toContain('localStorage.removeItem(UI_STATE_KEY)');
    expect(html).toContain('application/json');
    expect(html).toContain('id="add-outcome"');
    expect(html).toContain('data-edit-field="title"');
    expect(html).toContain('<span class="workflow-label">planned</span>');
    expect(html).toContain('card.innerHTML = \'<div class="board-card-top"></div>');
    expect(html).not.toContain('<span class="status-label">active</span>');
    expect(html).toContain('IntersectionObserver');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('cubic-bezier(.32,.72,0,1)');
    expect(html).toContain('font-family:"Geist"');
    expect(html).not.toContain('Canonical roadmap state is unchanged');
  });
});
