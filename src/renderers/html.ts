import { formatLabel, type RoadmapFormat } from '../formats/index.js';
import type { Roadmap, RoadmapItem } from '../types/index.js';
import { buildRoadmapViewModel, type ProjectedItem, type RoadmapProjection } from './view-model.js';

export interface HtmlRenderOptions {
  audience?: string;
  horizon?: string;
  decision?: string;
  format?: RoadmapFormat;
  defaultView?: 'outcome' | 'delivery' | 'release' | 'dependency' | 'evidence';
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
  const outcomes = roadmap.items.filter((item) => item.kind === 'outcome');
  const anchor = outcomes.find((item) => item.status === 'active') ?? outcomes[0];
  const statusCounts = new Map<string, number>();
  for (const item of roadmap.items) {
    statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
  }
  const baseline = [...statusCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${String(count)} ${status}`)
    .join(' · ');
  return {
    anchor:
      typeof strategy.anchor === 'string'
        ? strategy.anchor
        : (anchor?.title ?? 'Roadmap intent has not been defined.'),
    baseline:
      typeof strategy.baseline === 'string'
        ? strategy.baseline
        : `${String(roadmap.items.length)} roadmap items · ${baseline || 'no delivery state'}`,
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
      ? ''
      : `<p><strong>Measure:</strong> ${escapeHtml(signal.metric)}: target ${String(signal.target)} ${escapeHtml(signal.unit)}</p>`;
  const description =
    item.description === undefined
      ? ''
      : `<p class="item-description">${escapeHtml(item.description)}</p>`;
  const schedule =
    item.scheduleLabel === undefined
      ? ''
      : `<p class="schedule">${escapeHtml(item.scheduleLabel)}</p>`;
  return `<article class="roadmap-card commitment-${item.commitment} status-${item.status}" data-item data-status="${item.status}" data-horizon="${item.horizon}">
    <div class="card-heading"><h4>${escapeHtml(item.title)}</h4><span class="status-label">${escapeHtml(item.status)}</span></div>
    <p class="item-id">${escapeHtml(item.kind)} · ${escapeHtml(item.id)}</p>${description}
    <p><strong>Commitment:</strong> ${escapeHtml(item.commitment)} · <strong>Confidence:</strong> ${escapeHtml(item.confidence)}</p>
    ${measure}${schedule}
  </article>`;
}

function overviewCard(item: ProjectedItem): string {
  const description =
    item.description === undefined ? '' : `<p>${escapeHtml(item.description)}</p>`;
  return `<article class="board-card commitment-${item.commitment} status-${item.status}" data-item data-status="${item.status}" data-horizon="${item.horizon}">
    <div class="board-card-top"><span class="commitment-label">${escapeHtml(item.commitment)}</span><span class="status-label">${escapeHtml(item.status)}</span></div>
    <h4>${escapeHtml(item.title)}</h4>${description}
    <footer><span>${escapeHtml(item.confidence)} confidence</span><code>${escapeHtml(item.id)}</code></footer>
  </article>`;
}

function nowNextLater(items: ProjectedItem[], namespace: string): string {
  return `<div class="pattern-now-next-later horizon-grid">${(['now', 'next', 'later'] as const)
    .map((horizon) => {
      const laneItems = items.filter((item) => item.horizon === horizon);
      return `<section class="lane" aria-labelledby="lane-${namespace}-${horizon}">
        <h3 id="lane-${namespace}-${horizon}">${horizon.charAt(0).toUpperCase()}${horizon.slice(1)} <span class="lane-count">${String(laneItems.length)}</span></h3>
        ${laneItems.map(overviewCard).join('') || '<p class="muted">No work scheduled.</p>'}
      </section>`;
    })
    .join('')}</div>`;
}

function outcomeLanes(items: ProjectedItem[]): string {
  return `<div class="pattern-outcome-lanes">${nowNextLater(items, 'outcomes')}</div>`;
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

function pattern(
  format: RoadmapFormat,
  projection: RoadmapProjection,
  namespace = 'roadmap',
): string {
  const content = (() => {
    switch (format) {
      case 'outcome-lanes':
        return outcomeLanes(projection.items);
      case 'now-next-later':
        return nowNextLater(projection.items, namespace);
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

function optionalListSection(title: string, values: string[]): string {
  return values.length === 0 ? '' : `<section><h3>${title}</h3>${list(values, '')}</section>`;
}

function styles(): string {
  return `:root{--bg:#f4f6f8;--surface:#fff;--text:#17212b;--muted:#5a6875;--line:#cfd8df;--green:#13784d;--amber:#9a6400;--blue:#2f63ad;--red:#a33131;--soft-green:#e9f7f0;--soft-amber:#fff5df;--soft-blue:#edf3fc;--soft-red:#fbecec}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.45}main{padding:20px}.wrap{max-width:1480px;margin:auto}header{display:flex;align-items:end;justify-content:space-between;gap:24px;border-bottom:3px solid var(--text);padding:6px 0 14px}header h1{margin:0;font-size:2rem}h1,h2,h3,h4{line-height:1.2;letter-spacing:0}.metadata,.muted,.pattern-note,.item-id,.lane-count{color:var(--muted)}.metadata{margin:0;text-align:right;font-size:.9rem}.strategy-grid,.decision-grid,.evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.strategy-grid>div,.decision-grid>section{border-left:3px solid var(--line);padding-left:12px}.rendering-notes{margin:14px 0;color:var(--muted)}.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin:10px 0}.toolbar label{display:grid;gap:3px;font-size:.78rem;font-weight:700;color:var(--muted)}.toolbar button,.toolbar select,.tabs button{font:inherit}.toolbar button,.toolbar select{min-height:34px;border:1px solid #aebbc5;background:var(--surface);padding:5px 9px}.tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto}.tabs button{border:0;border-bottom:3px solid transparent;background:transparent;padding:9px 12px;white-space:nowrap}.tabs button[aria-selected="true"]{border-color:var(--blue);font-weight:800}.tabs button:focus-visible,.toolbar button:focus-visible,.toolbar select:focus-visible,summary:focus-visible{outline:3px solid #f0a929;outline-offset:2px}#roadmap-views{margin-top:16px}#roadmap-heading{font-size:1.1rem;margin:0}.tabpanel{padding:12px 0}.tabpanel>h3{position:absolute;left:-10000px}.tabpanel[hidden]{display:none}.board-scroll{overflow-x:auto;border:1px solid var(--line);background:var(--surface)}.roadmap-board{display:grid;grid-template-columns:180px repeat(3,minmax(280px,1fr));min-width:1040px}.board-corner,.board-column-head{position:sticky;top:0;z-index:2;background:#edf1f4;border-bottom:1px solid var(--line);padding:10px 12px;font-size:.78rem;font-weight:800;text-transform:uppercase}.board-column-head{display:flex;justify-content:space-between;border-left:1px solid var(--line)}.board-column-head span{color:var(--muted)}.board-row-label{background:#f7f9fa;border-top:1px solid var(--line);padding:14px 12px}.board-row-label strong,.board-row-label span{display:block}.board-row-label span{margin-top:4px;color:var(--muted);font-size:.78rem}.board-cell{display:grid;align-content:start;gap:8px;min-height:96px;border-top:1px solid var(--line);border-left:1px solid var(--line);padding:8px}.board-card{border:1px solid #b9c6cf;border-left:4px solid var(--amber);border-radius:5px;background:var(--soft-amber);padding:10px;box-shadow:0 1px 2px #17212b12;overflow-wrap:anywhere}.board-card.commitment-committed{border-left-color:var(--green);background:var(--soft-green)}.board-card.commitment-exploratory{border-left-color:var(--blue);border-left-style:dashed;background:var(--soft-blue)}.board-card.status-blocked{border-left-color:var(--red);background:var(--soft-red)}.board-card-top,.board-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.commitment-label{color:var(--muted);font-size:.67rem;font-weight:800;text-transform:uppercase}.board-card h4{margin:7px 0 5px;font-size:.92rem}.board-card p{margin:0 0 8px;color:#34424e;font-size:.79rem}.board-card footer{color:var(--muted);font-size:.7rem}.board-card code{font-size:.66rem}.horizon-grid,.portfolio-grid,.quarter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.lane-stack,.dashboard-rows{display:grid;gap:12px}.lane-count{font-size:.8rem;font-weight:600}.roadmap-card{background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--amber);border-radius:7px;padding:14px;margin:10px 0;overflow-wrap:anywhere;break-inside:avoid}.commitment-committed{border-left-color:var(--green)}.commitment-exploratory{border-left-style:dashed;border-left-color:var(--blue)}.status-blocked{outline:2px solid var(--red)}.card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.card-heading h4{margin:0;min-width:0}.status-label,.badge{display:inline-flex;flex:0 0 auto;white-space:nowrap;border:1px solid currentColor;border-radius:999px;padding:2px 7px;font-size:.68rem;font-weight:800}.item-description{margin:.7rem 0}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--surface)}th,td{border:1px solid var(--line);padding:10px;text-align:left}.marker-path{border-left:3px solid var(--line);padding-left:24px}.tree [role="treeitem"]{margin-left:clamp(0px,4vw,48px)}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metrics div{background:var(--surface);border:1px solid var(--line);padding:12px}.metrics dd{font-size:1.5rem;font-weight:800;margin:0}.timeline{display:grid;gap:10px}.timeline-row{display:grid;grid-template-columns:minmax(130px,1fr) 2fr;gap:10px;align-items:center}.timeline-bar,.timeline-marker{display:block;padding:8px;border:1px solid var(--green);background:#e8f5ee}.timeline-marker{border-style:dashed;border-color:var(--amber);background:#fff7df}.legend{display:flex;flex-wrap:wrap;gap:8px}.legend span{border:1px solid var(--line);padding:4px 8px}.evidence-entry{background:var(--surface);border:1px solid var(--line);padding:10px;margin:8px 0}.download-link{position:absolute;left:-10000px}section[aria-labelledby="strategy-frame"],section[aria-labelledby="decision-summary"],#evidence-risk{margin-top:28px;border-top:1px solid var(--line);padding-top:20px}@media (max-width:760px){main{padding:12px}header{display:block}header h1{font-size:1.55rem}.metadata{text-align:left;margin-top:6px}.strategy-grid,.decision-grid,.evidence-grid,.horizon-grid,.portfolio-grid,.quarter-grid,.metrics{grid-template-columns:1fr}.timeline-row{grid-template-columns:1fr}.tabs{scrollbar-width:thin}.board-scroll{overflow:visible}.roadmap-board{display:block;min-width:0}.board-corner,.board-column-head,.board-row-label{display:none}.board-cell{display:grid;min-height:0;border:0;border-top:1px solid var(--line);padding:12px}.board-cell:empty{display:none}.board-cell:not(:empty)::before{content:attr(data-label);display:block;margin-bottom:2px;color:var(--muted);font-size:.72rem;font-weight:800;text-transform:uppercase}}@media print{body{background:#fff}main{padding:0}.toolbar,.tabs{display:none}.tabpanel[hidden]{display:block}.roadmap-card,.board-card,.evidence-entry{box-shadow:none;break-inside:avoid}.tabpanel{page-break-before:auto}.board-scroll{overflow:visible}.roadmap-board{min-width:0;grid-template-columns:140px repeat(3,1fr)}}`;
}

function script(revision: number): string {
  return `(() => {
  const UI_STATE_KEY = 'rmp-ui-state-v2-${String(revision)}';
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
  document.getElementById('reset-ui').addEventListener('click', () => { clearState(); statusFilter.value = 'all'; horizonFilter.value = 'all'; showTab('view-overview'); applyFilters(); });
  document.getElementById('export-proposal').addEventListener('click', () => {
    const proposal = { schemaVersion: '1.0.0', roadmapRevision: ${String(revision)}, proposalOnly: true, canonicalStateChanged: false, createdAt: new Date().toISOString(), recommendations: [] };
    if (download.href.startsWith('blob:')) URL.revokeObjectURL(download.href);
    download.href = URL.createObjectURL(new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' }));
    download.click();
  });
  const state = readState();
  if (typeof state.status === 'string') statusFilter.value = state.status;
  if (typeof state.horizon === 'string') horizonFilter.value = state.horizon;
  showTab(typeof state.tab === 'string' ? state.tab : 'view-overview');
  applyFilters();
})();`;
}

export function renderHtml(roadmap: Roadmap, options: HtmlRenderOptions = {}): string {
  const model = buildRoadmapViewModel(roadmap);
  const selected = options.format ?? model.format.selected;
  const frame = strategyFrame(roadmap);
  const horizon = options.horizon ?? 'Now / Next / Later';
  const rationale =
    options.format === undefined ? model.format.rationale : patternDescriptions[options.format];
  const tabs = [
    ['overview', 'Overview', 'view-overview'],
    ['outcome', 'Outcomes', 'view-outcome'],
    ['delivery', 'Delivery', 'view-delivery'],
    ['release', 'Releases', 'view-release'],
    ['dependency', 'Dependencies', 'view-dependency'],
    ['history', 'Evidence / history', 'view-history'],
  ] as const;
  const configuredView = options.defaultView === 'evidence' ? 'history' : options.defaultView;
  const defaultView = configuredView ?? 'overview';
  const defaultPanelId = `view-${defaultView}`;
  const panels = tabs
    .map(([view, label, id]) => {
      const projection = model.views[view];
      let content: string;
      if (view === 'overview') content = pattern(selected, projection, view);
      else if (view === 'dependency') content = relationshipList(roadmap);
      else if (view === 'history') content = evidenceList(roadmap);
      else if (view === 'outcome') content = pattern('outcome-lanes', projection, view);
      else if (view === 'release') {
        content = pattern(
          selected === 'gantt-release' ? selected : 'now-next-later',
          projection,
          view,
        );
      } else content = pattern('now-next-later', projection, view);
      return `<section id="${id}" class="tabpanel" role="tabpanel" aria-labelledby="tab-${view}"${view === defaultView ? '' : ' hidden'}><h3>${label}</h3>${content}</section>`;
    })
    .join('');
  const embeddedData = JSON.stringify({ revision: roadmap.revision, format: selected }).replaceAll(
    '<',
    '\\u003c',
  );
  const decisionSections = [
    optionalListSection('Next actions', frame.nextActions),
    optionalListSection('Deferrals', frame.deferrals),
    optionalListSection('Validation needs', model.validationNeeds),
    optionalListSection('Open questions', frame.openQuestions),
  ].join('');
  const measures = roadmap.items.flatMap((item: RoadmapItem) =>
    item.signal === undefined
      ? []
      : [`${item.signal.metric}: target ${String(item.signal.target)} ${item.signal.unit}`],
  );
  const evidenceSections = [
    roadmap.evidence.length === 0
      ? ''
      : `<section><h3>Evidence</h3>${evidenceList(roadmap)}</section>`,
    optionalListSection('Measures', measures),
    optionalListSection('Risks', frame.risks),
    optionalListSection('Assumptions', frame.assumptions),
    roadmap.relationships.length === 0
      ? ''
      : `<section><h3>Dependencies</h3>${relationshipList(roadmap)}</section>`,
  ].join('');
  const activeCount = roadmap.items.filter((item) => item.status === 'active').length;
  const proposedCount = roadmap.items.filter((item) => item.status === 'proposed').length;
  const metadata = [
    `${String(activeCount)} active`,
    ...(proposedCount === 0 ? [] : [`${String(proposedCount)} proposed`]),
    horizon,
    ...(options.audience === undefined ? [] : [`Audience: ${options.audience}`]),
    ...(options.decision === undefined ? [] : [`Decision: ${options.decision}`]),
  ];

  return `<!doctype html>
<html lang="en" data-revision="${String(roadmap.revision)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(roadmap.title)}</title><style>${styles()}</style></head>
<body><main><div class="wrap">
  <header><p class="muted">Roadmap revision ${String(model.revision)} · Schema ${escapeHtml(model.schemaVersion)}</p><h1>${escapeHtml(model.title)}</h1><p class="metadata">${metadata.map(escapeHtml).join(' · ')}</p></header>
  <section id="roadmap-views" aria-labelledby="roadmap-heading"><h2 id="roadmap-heading">Roadmap</h2><div class="toolbar"><label>Status<select aria-label="Filter by status" data-filter="status"><option value="all">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="proposed">Proposed</option></select></label><label>Horizon<select aria-label="Filter by horizon" data-filter="horizon"><option value="all">All horizons</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></label><button id="reset-ui" type="button" aria-label="Reset local view">Reset view</button><button id="export-proposal" type="button" aria-label="Export recommendation proposal">Export proposal</button><a id="proposal-download" class="download-link" download="roadmap-proposal.json">Download proposal</a></div><div class="tabs" role="tablist" aria-label="Roadmap views">${tabs.map(([view, label, id]) => `<button id="tab-${view}" type="button" role="tab" aria-controls="${id}" aria-selected="${String(view === defaultView)}" tabindex="${view === defaultView ? '0' : '-1'}">${label}</button>`).join('')}</div>${panels}</section>
  <section aria-labelledby="strategy-frame"><h2 id="strategy-frame">Context</h2><div class="strategy-grid"><div><h3>Strategic anchor</h3><p>${escapeHtml(frame.anchor)}</p></div><div><h3>Current state</h3><p>${escapeHtml(frame.baseline)}</p></div></div><details class="rendering-notes"><summary>View design</summary><p><strong>Format:</strong> ${escapeHtml(formatLabel(selected))}</p><p>${escapeHtml(rationale)}</p></details><div class="legend" aria-label="Commitment and confidence legend"><span>Committed</span><span>Directional bet</span><span>Exploratory option</span><span>Blocked</span><span>Confidence: high / medium / low</span></div></section>
  ${decisionSections === '' ? '' : `<section aria-labelledby="decision-summary"><h2 id="decision-summary">Decision summary</h2><div class="decision-grid">${decisionSections}</div></section>`}
  ${evidenceSections === '' ? '' : `<section id="evidence-risk" aria-labelledby="evidence-risk-heading"><h2 id="evidence-risk-heading">Evidence and context</h2><div class="evidence-grid">${evidenceSections}</div></section>`}
</div></main><script type="application/json" id="roadmap-data">${embeddedData}</script><script>${script(roadmap.revision).replaceAll('view-overview', defaultPanelId)}</script></body></html>\n`;
}
