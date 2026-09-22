import { formatLabel, type RoadmapFormat } from '../formats/index.js';
import type { Roadmap, RoadmapItem } from '../types/index.js';
import { buildRoadmapViewModel, type ProjectedItem, type RoadmapProjection } from './view-model.js';

export interface HtmlRenderOptions {
  audience?: string;
  horizon?: string;
  decision?: string;
  format?: RoadmapFormat;
}

interface StrategyFrame {
  anchor: string;
  baseline: string;
  risks: string[];
  assumptions: string[];
  openQuestions: string[];
  nextActions: string[];
  deferrals: string[];
}

const patternDescriptions: Readonly<Record<RoadmapFormat, string>> = {
  'outcome-lanes': 'Outcomes pair desired movement with measures and supporting work.',
  'now-next-later': 'Work is grouped by horizon without implying unsupported dates.',
  'strategy-choice': 'Options remain comparable across evidence, risk, and reversibility.',
  milestones: 'Observable markers show progress without manufacturing schedule precision.',
  'opportunity-tree': 'Outcomes, opportunities, and candidate solutions retain their lineage.',
  'portfolio-bets': 'Bets remain visible across horizon, confidence, and learning value.',
  'quarterly-lanes': 'Planning windows coordinate work while preserving farther-out uncertainty.',
  dashboard: 'A compact summary highlights status, confidence, risk, and next decisions.',
  'gantt-release': 'Evidence-backed dates show release sequence; forecasts remain markers.',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function strategyFrame(roadmap: Roadmap): StrategyFrame {
  const strategy = roadmap.extensions.strategy ?? {};
  return {
    anchor:
      typeof strategy.anchor === 'string' ? strategy.anchor : 'No strategic anchor is recorded.',
    baseline:
      typeof strategy.baseline === 'string' ? strategy.baseline : 'No baseline is recorded.',
    risks: stringList(strategy.risks),
    assumptions: stringList(strategy.assumptions),
    openQuestions: stringList(strategy.openQuestions),
    nextActions: stringList(strategy.nextActions),
    deferrals: stringList(strategy.deferrals),
  };
}

function list(values: string[], empty: string): string {
  const entries = values.length === 0 ? [empty] : values;
  return `<ul>${entries.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`;
}

function itemCard(item: ProjectedItem): string {
  const signal = item.signal;
  const measure =
    signal === undefined
      ? 'No measure recorded'
      : `${escapeHtml(signal.metric)}: target ${String(signal.target)} ${escapeHtml(signal.unit)}`;
  const schedule =
    item.scheduleLabel === undefined
      ? ''
      : `<p class="schedule">${escapeHtml(item.scheduleLabel)}</p>`;
  return `<article class="roadmap-card commitment-${item.commitment} status-${item.status}" data-item data-status="${item.status}" data-horizon="${item.horizon}">
    <div class="card-heading"><h4>${escapeHtml(item.title)}</h4><span class="status-label">${escapeHtml(item.status)}</span></div>
    <p class="item-id">${escapeHtml(item.id)}</p>
    <p><strong>Commitment:</strong> ${escapeHtml(item.commitment)} · <strong>Confidence:</strong> ${escapeHtml(item.confidence)}</p>
    <p><strong>Measure:</strong> ${measure}</p>${schedule}
  </article>`;
}

function nowNextLater(items: ProjectedItem[]): string {
  return `<div class="pattern-now-next-later horizon-grid">${(['now', 'next', 'later'] as const)
    .map(
      (horizon) => `<section class="lane" aria-labelledby="lane-${horizon}">
        <h3 id="lane-${horizon}">${horizon.charAt(0).toUpperCase()}${horizon.slice(1)}</h3>
        ${
          items
            .filter((item) => item.horizon === horizon)
            .map(itemCard)
            .join('') || '<p>No items.</p>'
        }
      </section>`,
    )
    .join('')}</div>`;
}

function outcomeLanes(items: ProjectedItem[]): string {
  return `<div class="pattern-outcome-lanes lane-stack">${items.map(itemCard).join('') || '<p>No outcomes are defined.</p>'}</div>`;
}

function matrix(items: ProjectedItem[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr data-item data-status="${item.status}" data-horizon="${item.horizon}"><th scope="row">${escapeHtml(item.title)}</th><td>${escapeHtml(item.confidence)}</td><td>${escapeHtml(item.commitment)}</td><td>${escapeHtml(item.status)}</td></tr>`,
    )
    .join('');
  return `<div class="pattern-strategy-choice table-wrap"><table><thead><tr><th>Option</th><th>Evidence</th><th>Reversibility</th><th>Recommendation</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function milestones(items: ProjectedItem[]): string {
  return `<ol class="pattern-milestones marker-path">${items.map((item) => `<li>${itemCard(item)}</li>`).join('') || '<li>No milestones are defined.</li>'}</ol>`;
}

function opportunityTree(items: ProjectedItem[]): string {
  return `<div class="pattern-opportunity-tree tree" role="tree">${items.map((item) => `<div role="treeitem">${itemCard(item)}</div>`).join('') || '<p>No discovery lineage is defined.</p>'}</div>`;
}

function portfolio(items: ProjectedItem[]): string {
  return `<div class="pattern-portfolio-bets portfolio-grid">${items.map(itemCard).join('') || '<p>No portfolio bets are defined.</p>'}</div>`;
}

function quarterly(items: ProjectedItem[]): string {
  return `<div class="pattern-quarterly-lanes quarter-grid">${(['now', 'next', 'later'] as const)
    .map(
      (horizon) =>
        `<section><h3>${horizon === 'now' ? 'Current window' : horizon === 'next' ? 'Next window' : 'Later window'}</h3>${
          items
            .filter((item) => item.horizon === horizon)
            .map(itemCard)
            .join('') || '<p>No planned work.</p>'
        }</section>`,
    )
    .join('')}</div>`;
}

function dashboard(items: ProjectedItem[]): string {
  const active = items.filter((item) => item.status === 'active').length;
  const blocked = items.filter((item) => item.status === 'blocked').length;
  return `<div class="pattern-dashboard"><dl class="metrics"><div><dt>Items</dt><dd>${String(items.length)}</dd></div><div><dt>Active</dt><dd>${String(active)}</dd></div><div><dt>Blocked</dt><dd>${String(blocked)}</dd></div></dl><div class="dashboard-rows">${items.map(itemCard).join('')}</div></div>`;
}

function gantt(items: ProjectedItem[]): string {
  const entries = items
    .map((item) => {
      const exact =
        item.schedule?.precision === 'exact' &&
        item.commitment === 'committed' &&
        item.schedule.evidenceIds.length > 0;
      const mark = exact ? 'timeline-bar' : 'timeline-marker';
      return `<div class="timeline-row" data-item data-status="${item.status}" data-horizon="${item.horizon}"><strong>${escapeHtml(item.title)}</strong><span class="${mark}">${escapeHtml(item.scheduleLabel ?? 'Milestone: date not evidenced')}</span></div>`;
    })
    .join('');
  return `<div class="pattern-gantt-release timeline">${entries || '<p>No releases are defined.</p>'}</div>`;
}

function pattern(format: RoadmapFormat, projection: RoadmapProjection): string {
  const content = (() => {
    switch (format) {
      case 'outcome-lanes':
        return outcomeLanes(projection.items);
      case 'now-next-later':
        return nowNextLater(projection.items);
      case 'strategy-choice':
        return matrix(projection.items);
      case 'milestones':
        return milestones(projection.items);
      case 'opportunity-tree':
        return opportunityTree(projection.items);
      case 'portfolio-bets':
        return portfolio(projection.items);
      case 'quarterly-lanes':
        return quarterly(projection.items);
      case 'dashboard':
        return dashboard(projection.items);
      case 'gantt-release':
        return gantt(projection.items);
    }
  })();
  return `<div class="pattern pattern-${format}" data-pattern="${format}"><p class="pattern-note">${escapeHtml(patternDescriptions[format])}</p>${content}</div>`;
}

function relationshipList(roadmap: Roadmap): string {
  if (roadmap.relationships.length === 0) return '<p>No dependencies are recorded.</p>';
  return `<ul class="relationships">${roadmap.relationships
    .map(
      (relationship) =>
        `<li data-item data-status="relationship" data-horizon="all"><code>${escapeHtml(relationship.from)}</code> ${escapeHtml(relationship.type)} <code>${escapeHtml(relationship.to)}</code>${relationship.expectedImpact === undefined ? '' : `: ${escapeHtml(relationship.expectedImpact)}`}</li>`,
    )
    .join('')}</ul>`;
}

function evidenceList(roadmap: Roadmap): string {
  if (roadmap.evidence.length === 0) return '<p>No evidence is recorded.</p>';
  return roadmap.evidence
    .map(
      (evidence) =>
        `<details class="evidence-entry"><summary>${escapeHtml(evidence.summary)} <span class="badge">${escapeHtml(evidence.class)}</span></summary><dl><dt>Source</dt><dd>${escapeHtml(evidence.source)}</dd><dt>Reference</dt><dd>${escapeHtml(evidence.sourceRef)}</dd><dt>Observed</dt><dd>${escapeHtml(evidence.observedAt)}</dd></dl></details>`,
    )
    .join('');
}

function styles(): string {
  return `:root{--bg:#f5f7f8;--surface:#fff;--text:#182026;--muted:#59636d;--line:#cfd6dc;--green:#176b45;--amber:#8a5a00;--blue:#285f9e;--red:#9b2c2c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}main{padding:24px}.wrap{max-width:1180px;margin:auto}h1,h2,h3,h4{line-height:1.2;letter-spacing:0}.metadata,.muted,.pattern-note,.item-id{color:var(--muted)}.strategy-grid,.decision-grid,.evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.strategy-grid>div,.decision-grid>section{border-left:3px solid var(--line);padding-left:12px}.toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:16px 0}.toolbar label{display:grid;gap:4px}.toolbar button,.toolbar select,.tabs button{font:inherit}.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);overflow-x:auto}.tabs button{border:0;border-bottom:3px solid transparent;background:transparent;padding:10px 12px;white-space:nowrap}.tabs button[aria-selected="true"]{border-color:var(--blue);font-weight:700}.tabs button:focus-visible,.toolbar button:focus-visible,.toolbar select:focus-visible,summary:focus-visible{outline:3px solid #f0a929;outline-offset:2px}.tabpanel{padding:18px 0}.tabpanel[hidden]{display:none}.horizon-grid,.portfolio-grid,.quarter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.lane-stack,.dashboard-rows{display:grid;gap:12px}.roadmap-card{background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--amber);border-radius:7px;padding:12px;margin:10px 0;overflow-wrap:anywhere;break-inside:avoid}.commitment-committed{border-left-color:var(--green)}.commitment-exploratory{border-left-style:dashed;border-left-color:var(--blue)}.status-blocked{outline:2px solid var(--red)}.card-heading{display:flex;justify-content:space-between;gap:8px}.card-heading h4{margin:0}.status-label,.badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:.78rem;font-weight:700}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--surface)}th,td{border:1px solid var(--line);padding:10px;text-align:left}.marker-path{border-left:3px solid var(--line);padding-left:24px}.tree [role="treeitem"]{margin-left:clamp(0px,4vw,48px)}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metrics div{background:var(--surface);border:1px solid var(--line);padding:12px}.metrics dd{font-size:1.5rem;font-weight:800;margin:0}.timeline{display:grid;gap:10px}.timeline-row{display:grid;grid-template-columns:minmax(130px,1fr) 2fr;gap:10px;align-items:center}.timeline-bar,.timeline-marker{display:block;padding:8px;border:1px solid var(--green);background:#e8f5ee}.timeline-marker{border-style:dashed;border-color:var(--amber);background:#fff7df}.legend{display:flex;flex-wrap:wrap;gap:8px}.legend span{border:1px solid var(--line);padding:4px 8px}.evidence-entry{background:var(--surface);border:1px solid var(--line);padding:10px;margin:8px 0}.notice{border:1px solid var(--blue);padding:10px;background:#eef5fd}.download-link{position:absolute;left:-10000px}@media (max-width:760px){main{padding:14px}.strategy-grid,.decision-grid,.evidence-grid,.horizon-grid,.portfolio-grid,.quarter-grid,.metrics{grid-template-columns:1fr}.timeline-row{grid-template-columns:1fr}.card-heading{display:block}.tabs{scrollbar-width:thin}}@media print{body{background:#fff}main{padding:0}.toolbar,.tabs{display:none}.tabpanel[hidden]{display:block}.roadmap-card,.evidence-entry{break-inside:avoid}.tabpanel{page-break-before:auto}}`;
}

function script(revision: number): string {
  return `(() => {
  const UI_STATE_KEY = 'rmp-ui-state-${String(revision)}';
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('[role="tabpanel"]')];
  const statusFilter = document.querySelector('[data-filter="status"]');
  const horizonFilter = document.querySelector('[data-filter="horizon"]');
  const download = document.getElementById('proposal-download');
  const readState = () => { try { return JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}'); } catch { return {}; } };
  const writeState = (state) => { try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(state)); } catch {} };
  const clearState = () => { try { localStorage.removeItem(UI_STATE_KEY); } catch {} };
  const showTab = (id, focus = false) => {
    tabs.forEach((tab) => { const active = tab.getAttribute('aria-controls') === id; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus) tab.focus(); });
    panels.forEach((panel) => { panel.hidden = panel.id !== id; });
    const state = readState(); state.tab = id; writeState(state);
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showTab(tab.getAttribute('aria-controls')));
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const move = event.key === 'ArrowRight' ? 1 : -1;
        const next = tabs[(index + move + tabs.length) % tabs.length];
        showTab(next.getAttribute('aria-controls'), true);
      }
    });
  });
  const applyFilters = () => {
    document.querySelectorAll('[data-item]').forEach((item) => {
      const statusMatches = statusFilter.value === 'all' || item.dataset.status === statusFilter.value;
      const horizonMatches = horizonFilter.value === 'all' || item.dataset.horizon === horizonFilter.value;
      item.hidden = !(statusMatches && horizonMatches);
    });
    writeState({ tab: document.querySelector('[role="tab"][aria-selected="true"]').getAttribute('aria-controls'), status: statusFilter.value, horizon: horizonFilter.value });
  };
  statusFilter.addEventListener('change', applyFilters);
  horizonFilter.addEventListener('change', applyFilters);
  document.getElementById('reset-ui').addEventListener('click', () => { clearState(); statusFilter.value = 'all'; horizonFilter.value = 'all'; showTab('view-outcome'); applyFilters(); });
  document.getElementById('export-proposal').addEventListener('click', () => {
    const proposal = { schemaVersion: '1.0.0', roadmapRevision: ${String(revision)}, proposalOnly: true, canonicalStateChanged: false, createdAt: new Date().toISOString(), recommendations: [] };
    if (download.href.startsWith('blob:')) URL.revokeObjectURL(download.href);
    download.href = URL.createObjectURL(new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' }));
    download.click();
  });
  const state = readState();
  if (typeof state.status === 'string') statusFilter.value = state.status;
  if (typeof state.horizon === 'string') horizonFilter.value = state.horizon;
  showTab(typeof state.tab === 'string' ? state.tab : 'view-outcome');
  applyFilters();
})();`;
}

export function renderHtml(roadmap: Roadmap, options: HtmlRenderOptions = {}): string {
  const model = buildRoadmapViewModel(roadmap);
  const selected = options.format ?? model.format.selected;
  const frame = strategyFrame(roadmap);
  const audience = options.audience ?? 'Repository team';
  const horizon = options.horizon ?? 'Now / Next / Later';
  const decision = options.decision ?? 'Sequence evidence-backed roadmap work';
  const rationale =
    options.format === undefined ? model.format.rationale : patternDescriptions[options.format];
  const validationNeeds =
    model.validationNeeds.length === 0
      ? ['No format-specific validation gaps.']
      : model.validationNeeds;
  const tabs = [
    ['outcome', 'Outcomes', 'view-outcome'],
    ['delivery', 'Delivery', 'view-delivery'],
    ['release', 'Releases', 'view-release'],
    ['dependency', 'Dependencies', 'view-dependency'],
    ['history', 'Evidence / history', 'view-history'],
  ] as const;
  const panels = tabs
    .map(([view, label, id], index) => {
      const projection = model.views[view];
      let content: string;
      if (view === 'dependency') content = relationshipList(roadmap);
      else if (view === 'history') content = evidenceList(roadmap);
      else content = pattern(selected, projection);
      return `<section id="${id}" class="tabpanel" role="tabpanel" aria-labelledby="tab-${view}"${index === 0 ? '' : ' hidden'}><h3>${label}</h3>${content}</section>`;
    })
    .join('');
  const embeddedData = JSON.stringify({ revision: roadmap.revision, format: selected }).replaceAll(
    '<',
    '\\u003c',
  );

  return `<!doctype html>
<html lang="en" data-revision="${String(roadmap.revision)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(roadmap.title)}</title><style>${styles()}</style></head>
<body><main><div class="wrap">
  <header><p class="muted">Roadmap revision ${String(model.revision)} · Schema ${escapeHtml(model.schemaVersion)}</p><h1>${escapeHtml(model.title)}</h1><p class="metadata"><strong>Audience:</strong> ${escapeHtml(audience)} · <strong>Horizon:</strong> ${escapeHtml(horizon)} · <strong>Decision:</strong> ${escapeHtml(decision)}</p></header>
  <section aria-labelledby="strategy-frame"><h2 id="strategy-frame">Strategy frame</h2><div class="strategy-grid"><div><h3>Strategic anchor</h3><p>${escapeHtml(frame.anchor)}</p></div><div><h3>Baseline</h3><p>${escapeHtml(frame.baseline)}</p></div></div><p><strong>Selected format:</strong> ${escapeHtml(formatLabel(selected))}</p><p><strong>Rationale:</strong> ${escapeHtml(rationale)}</p><div class="legend" aria-label="Commitment and confidence legend"><span>Committed</span><span>Directional bet</span><span>Exploratory option</span><span>Blocked</span><span>Confidence: high / medium / low</span></div></section>
  <section id="roadmap-views" aria-labelledby="roadmap-heading"><h2 id="roadmap-heading">Roadmap visualization</h2><div class="toolbar"><label>Filter by status<select aria-label="Filter by status" data-filter="status"><option value="all">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="proposed">Proposed</option></select></label><label>Filter by horizon<select aria-label="Filter by horizon" data-filter="horizon"><option value="all">All horizons</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></label><button id="reset-ui" type="button">Reset local view</button><button id="export-proposal" type="button">Export recommendation proposal</button><a id="proposal-download" class="download-link" download="roadmap-proposal.json">Download proposal</a></div><p class="notice">Local interactions only. Canonical roadmap state is unchanged.</p><div class="tabs" role="tablist" aria-label="Roadmap views">${tabs.map(([view, label, id], index) => `<button id="tab-${view}" type="button" role="tab" aria-controls="${id}" aria-selected="${String(index === 0)}" tabindex="${index === 0 ? '0' : '-1'}">${label}</button>`).join('')}</div>${panels}</section>
  <section aria-labelledby="decision-summary"><h2 id="decision-summary">Decision summary</h2><div class="decision-grid"><section><h3>Next actions</h3>${list(frame.nextActions, 'No next actions are recorded.')}</section><section><h3>Deferrals</h3>${list(frame.deferrals, 'No deferrals are recorded.')}</section><section><h3>Validation needs</h3>${list(validationNeeds, 'No validation needs are recorded.')}</section><section><h3>Open questions</h3>${list(frame.openQuestions, 'No open questions are recorded.')}</section></div></section>
  <section id="evidence-risk" aria-labelledby="evidence-risk-heading"><h2 id="evidence-risk-heading">Evidence and risk</h2><div class="evidence-grid"><section><h3>Evidence</h3>${evidenceList(roadmap)}</section><section><h3>Measures</h3>${list(
    roadmap.items.flatMap((item: RoadmapItem) =>
      item.signal === undefined
        ? []
        : [`${item.signal.metric}: target ${String(item.signal.target)} ${item.signal.unit}`],
    ),
    'No measures are recorded.',
  )}</section><section><h3>Risks</h3>${list(frame.risks, 'No risks are recorded.')}</section><section><h3>Assumptions</h3>${list(frame.assumptions, 'No assumptions are recorded.')}</section><section><h3>Dependencies</h3>${relationshipList(roadmap)}</section></div></section>
</div></main><script type="application/json" id="roadmap-data">${embeddedData}</script><script>${script(roadmap.revision)}</script></body></html>\n`;
}
