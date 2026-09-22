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

function premiumStyles(): string {
  return `
:root{--bg:#f3f5f4;--surface:#fcfdfc;--text:#121816;--muted:#66706c;--line:rgba(18,24,22,.11);--green:#08775c;--amber:#9d6600;--blue:#315fba;--red:#a23d49;--soft-green:#e9f5ef;--soft-amber:#fff5df;--soft-blue:#edf3ff;--soft-red:#fbeef0;--shadow:0 24px 70px rgba(24,38,32,.07),0 3px 12px rgba(24,38,32,.045);--curve:cubic-bezier(.32,.72,0,1)}
html{background:#e9edeb}body{min-height:100dvh;background:var(--bg);font-family:"Geist","Avenir Next","SF Pro Display",sans-serif;font-variant-numeric:tabular-nums}body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:4;opacity:.025;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E")}main{padding:clamp(18px,3vw,48px)}.wrap{max-width:1520px;margin:auto}header{display:grid;grid-template-columns:minmax(150px,.7fr) minmax(360px,1.6fr) minmax(240px,1fr);align-items:end;gap:28px;padding:18px 4px 30px;border:0;box-shadow:inset 0 -1px rgba(18,24,22,.12)}header h1{max-width:760px;margin:0;font-size:clamp(2.1rem,4vw,4.6rem);font-weight:650;line-height:.96;letter-spacing:0}header>.muted{margin:0;font-size:.72rem;font-weight:650;text-transform:uppercase;letter-spacing:.12em}.metadata{max-width:400px;justify-self:end;font-size:.82rem;line-height:1.6}
#roadmap-views{margin-top:30px}#roadmap-heading{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:var(--muted)}.toolbar{gap:8px;margin:14px 0 24px}.toolbar label{gap:6px;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase}.toolbar button,.toolbar select{min-height:40px;border:0;border-radius:999px;background:rgba(252,253,252,.86);padding:7px 14px;color:var(--text);box-shadow:inset 0 0 0 1px rgba(18,24,22,.09),0 7px 20px rgba(24,38,32,.045);transition:transform 520ms var(--curve),box-shadow 520ms var(--curve),background-color 520ms var(--curve)}.toolbar button:hover,.toolbar select:hover{transform:translateY(-2px);background:#fff;box-shadow:inset 0 0 0 1px rgba(18,24,22,.08),0 12px 28px rgba(24,38,32,.08)}.toolbar button:active{transform:scale(.98)}.tabs{width:max-content;max-width:100%;gap:4px;border:0;border-radius:999px;background:rgba(18,24,22,.055);padding:5px;box-shadow:inset 0 1px 2px rgba(18,24,22,.045)}.tabs button{border:0!important;border-radius:999px;padding:9px 15px;color:var(--muted);font-size:.82rem;transition:transform 520ms var(--curve),color 520ms var(--curve),background-color 520ms var(--curve),box-shadow 520ms var(--curve)}.tabs button:hover{color:var(--text);transform:translateY(-1px)}.tabs button[aria-selected="true"]{color:var(--text);background:var(--surface);box-shadow:0 7px 18px rgba(24,38,32,.08),inset 0 0 0 1px rgba(255,255,255,.7)}.tabpanel{padding:28px 0 8px}.pattern-note{max-width:680px;margin:0 0 24px;font-size:.92rem}
.horizon-grid{grid-template-columns:repeat(12,minmax(0,1fr));align-items:start;gap:18px}.horizon-grid>.lane{grid-column:span 4;min-width:0;padding:7px;border-radius:22px;background:rgba(18,24,22,.045);box-shadow:inset 0 0 0 1px rgba(18,24,22,.035)}.lane>h3{display:flex;align-items:center;justify-content:space-between;margin:0 0 7px;padding:12px 13px 9px;font-size:.76rem;font-weight:750;text-transform:uppercase;letter-spacing:.12em}.lane-count{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:rgba(18,24,22,.065);font-size:.7rem}.lane>.muted{padding:22px 14px 28px;margin:0}.board-card,.roadmap-card{position:relative;border:0!important;border-radius:16px;background:var(--surface);padding:16px;margin:0 0 7px;box-shadow:inset 0 0 0 1px rgba(18,24,22,.075),inset 0 1px rgba(255,255,255,.9),0 9px 24px rgba(24,38,32,.06);transition:transform 650ms var(--curve),box-shadow 650ms var(--curve)}.board-card::before,.roadmap-card::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;border-radius:16px 0 0 16px;background:var(--amber)}.board-card:hover,.roadmap-card:hover{transform:translateY(-4px);box-shadow:inset 0 0 0 1px rgba(18,24,22,.07),inset 0 1px rgba(255,255,255,.95),0 18px 42px rgba(24,38,32,.11)}.board-card.commitment-committed,.roadmap-card.commitment-committed{background:var(--soft-green)}.board-card.commitment-committed::before,.roadmap-card.commitment-committed::before{background:var(--green)}.board-card.commitment-exploratory,.roadmap-card.commitment-exploratory{background:var(--soft-blue)}.board-card.commitment-exploratory::before,.roadmap-card.commitment-exploratory::before{background:var(--blue)}.board-card.status-blocked,.roadmap-card.status-blocked{outline:0;background:var(--soft-red)}.board-card.status-blocked::before,.roadmap-card.status-blocked::before{background:var(--red)}.board-card h4{margin:14px 0 7px;font-size:1rem;line-height:1.25}.board-card p{font-size:.82rem;line-height:1.55}.board-card-top{align-items:flex-start}.commitment-label{letter-spacing:.1em}.status-label,.badge{border:0;border-radius:999px;background:rgba(252,253,252,.64);padding:4px 9px;box-shadow:inset 0 0 0 1px rgba(18,24,22,.12);font-size:.64rem}.board-card footer{padding-top:5px}.board-card code,.item-id,code{font-family:"Geist Mono","SFMono-Regular",monospace}
.strategy-grid,.decision-grid,.evidence-grid{gap:18px}.strategy-grid>div,.decision-grid>section,.evidence-grid>section{border:0;border-radius:20px;background:rgba(252,253,252,.72);padding:24px;box-shadow:inset 0 0 0 1px rgba(18,24,22,.065),var(--shadow)}section[aria-labelledby="strategy-frame"],section[aria-labelledby="decision-summary"],#evidence-risk{margin-top:52px;border:0;padding-top:0}section[aria-labelledby="strategy-frame"]>h2,section[aria-labelledby="decision-summary"]>h2,#evidence-risk-heading{margin:0 0 20px;font-size:clamp(1.45rem,2.4vw,2.35rem);font-weight:650}.strategy-grid h3,.decision-grid h3,.evidence-grid h3{margin-top:0;font-size:.72rem;text-transform:uppercase;letter-spacing:.11em;color:var(--muted)}.rendering-notes{margin:18px 0 12px;padding:0 4px}.rendering-notes summary{width:max-content;cursor:pointer;color:var(--muted);transition:transform 500ms var(--curve),color 500ms var(--curve)}.rendering-notes summary:hover{color:var(--text);transform:translateX(3px)}.legend{gap:7px}.legend span{border:0;border-radius:999px;background:rgba(252,253,252,.74);padding:7px 11px;box-shadow:inset 0 0 0 1px rgba(18,24,22,.075);font-size:.75rem}.evidence-entry{border:0;border-radius:14px;background:rgba(252,253,252,.75);padding:14px 16px;box-shadow:inset 0 0 0 1px rgba(18,24,22,.07)}
.metrics{gap:14px}.metrics div{border:0;border-radius:18px;padding:20px;background:var(--surface);box-shadow:inset 0 0 0 1px rgba(18,24,22,.07),var(--shadow)}.metrics dd{font-size:2.25rem}.portfolio-grid,.quarter-grid{gap:18px}.portfolio-grid>.roadmap-card:nth-child(1){grid-column:span 2}.table-wrap{overflow:auto;border-radius:20px;padding:6px;background:rgba(18,24,22,.045);box-shadow:inset 0 0 0 1px rgba(18,24,22,.04)}table{border:0;border-radius:15px;overflow:hidden;background:var(--surface)}th,td{border:0;padding:15px 18px;box-shadow:inset 0 -1px rgba(18,24,22,.07)}.marker-path{border:0;padding:4px 0 4px 38px;counter-reset:markers}.marker-path>li{position:relative;list-style:none}.marker-path>li::before{counter-increment:markers;content:counter(markers);position:absolute;left:-38px;top:10px;display:grid;place-items:center;width:25px;height:25px;border-radius:999px;background:var(--text);color:#fff;font-size:.68rem}.timeline{gap:7px;padding:7px;border-radius:22px;background:rgba(18,24,22,.045);box-shadow:inset 0 0 0 1px rgba(18,24,22,.035)}.timeline-row{grid-template-columns:minmax(170px,.8fr) 2.2fr;gap:14px;padding:12px;border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 1px rgba(18,24,22,.065)}.timeline-bar,.timeline-marker{border:0;border-radius:999px;padding:10px 16px;background:var(--soft-green);box-shadow:inset 0 0 0 1px rgba(8,119,92,.17)}.timeline-marker{background:var(--soft-amber);box-shadow:inset 0 0 0 1px rgba(157,102,0,.18)}
.reveal{opacity:0;transform:translateY(20px)}.reveal.is-visible{opacity:1;transform:translateY(0);transition:opacity 820ms var(--curve),transform 820ms var(--curve)}[hidden]{display:none!important}
@media(max-width:920px){header{grid-template-columns:1fr;gap:12px}header h1{grid-row:1}.metadata{justify-self:start;text-align:left}.horizon-grid{grid-template-columns:1fr}.horizon-grid>.lane{grid-column:auto}.strategy-grid,.decision-grid,.evidence-grid,.portfolio-grid,.quarter-grid,.metrics{grid-template-columns:1fr}.portfolio-grid>.roadmap-card:nth-child(1){grid-column:auto}}
@media(max-width:760px){main{padding:20px 14px 38px}header{padding:10px 2px 24px}header h1{font-size:2.2rem}.toolbar{align-items:stretch}.toolbar label{flex:1 1 130px}.toolbar select{width:100%}.toolbar button{flex:1 1 auto}.tabs{width:100%;border-radius:18px;overflow-x:auto}.tabs button{padding:9px 12px}.tabpanel{padding-top:20px}.horizon-grid{gap:14px}.horizon-grid>.lane{padding:6px;border-radius:18px}.board-card,.roadmap-card{border-radius:13px;padding:14px}.board-card::before,.roadmap-card::before{border-radius:13px 0 0 13px}section[aria-labelledby="strategy-frame"],section[aria-labelledby="decision-summary"],#evidence-risk{margin-top:38px}.strategy-grid>div,.decision-grid>section,.evidence-grid>section{padding:19px}.timeline-row{grid-template-columns:1fr}.marker-path{padding-left:34px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important}.reveal{opacity:1;transform:none}}
@media print{body{background:#fff}body::before{display:none}main{padding:0}.toolbar,.tabs{display:none}.tabpanel[hidden]{display:block!important}.reveal{opacity:1;transform:none}.board-card,.roadmap-card,.evidence-entry,.strategy-grid>div,.decision-grid>section,.evidence-grid>section{box-shadow:inset 0 0 0 1px rgba(18,24,22,.12);break-inside:avoid}}
`;
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
  const reveals = [...document.querySelectorAll('.board-card, .roadmap-card, .strategy-grid > div, .decision-grid > section, .evidence-grid > section')];
  reveals.forEach((element) => element.classList.add('reveal'));
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), { threshold: 0.08 });
    reveals.forEach((element) => observer.observe(element));
  } else reveals.forEach((element) => element.classList.add('is-visible'));
  requestAnimationFrame(() => requestAnimationFrame(() => reveals.forEach((element) => element.classList.add('is-visible'))));
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
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(roadmap.title)}</title><style>${styles()}${premiumStyles()}</style></head>
<body><main><div class="wrap">
  <header><p class="muted">Roadmap revision ${String(model.revision)} · Schema ${escapeHtml(model.schemaVersion)}</p><h1>${escapeHtml(model.title)}</h1><p class="metadata">${metadata.map(escapeHtml).join(' · ')}</p></header>
  <section id="roadmap-views" aria-labelledby="roadmap-heading"><h2 id="roadmap-heading">Roadmap</h2><div class="toolbar"><label>Status<select aria-label="Filter by status" data-filter="status"><option value="all">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="proposed">Proposed</option></select></label><label>Horizon<select aria-label="Filter by horizon" data-filter="horizon"><option value="all">All horizons</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option></select></label><button id="reset-ui" type="button" aria-label="Reset local view">Reset view</button><button id="export-proposal" type="button" aria-label="Export recommendation proposal">Export proposal</button><a id="proposal-download" class="download-link" download="roadmap-proposal.json">Download proposal</a></div><div class="tabs" role="tablist" aria-label="Roadmap views">${tabs.map(([view, label, id]) => `<button id="tab-${view}" type="button" role="tab" aria-controls="${id}" aria-selected="${String(view === defaultView)}" tabindex="${view === defaultView ? '0' : '-1'}">${label}</button>`).join('')}</div>${panels}</section>
  <section aria-labelledby="strategy-frame"><h2 id="strategy-frame">Context</h2><div class="strategy-grid"><div><h3>Strategic anchor</h3><p>${escapeHtml(frame.anchor)}</p></div><div><h3>Current state</h3><p>${escapeHtml(frame.baseline)}</p></div></div><details class="rendering-notes"><summary>View design</summary><p><strong>Format:</strong> ${escapeHtml(formatLabel(selected))}</p><p>${escapeHtml(rationale)}</p></details><div class="legend" aria-label="Commitment and confidence legend"><span>Committed</span><span>Directional bet</span><span>Exploratory option</span><span>Blocked</span><span>Confidence: high / medium / low</span></div></section>
  ${decisionSections === '' ? '' : `<section aria-labelledby="decision-summary"><h2 id="decision-summary">Decision summary</h2><div class="decision-grid">${decisionSections}</div></section>`}
  ${evidenceSections === '' ? '' : `<section id="evidence-risk" aria-labelledby="evidence-risk-heading"><h2 id="evidence-risk-heading">Evidence and context</h2><div class="evidence-grid">${evidenceSections}</div></section>`}
</div></main><script type="application/json" id="roadmap-data">${embeddedData}</script><script>${script(roadmap.revision).replaceAll('view-overview', defaultPanelId)}</script></body></html>\n`;
}
