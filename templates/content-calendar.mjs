export function transformContentCalendarHtml(html, roadmap, analytics = null) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function hideElementById(source, tag, id) {
    const pattern = new RegExp(`<${tag}\\b([^>]*\\bid="${id}"[^>]*)>`);
    return source.replace(pattern, (openingTag, attributes) => {
      if (/\bdata-content-calendar-hidden\b/.test(attributes)) return openingTag;
      const hidden = /\bhidden\b/.test(attributes) ? '' : ' hidden';
      return `<${tag}${attributes}${hidden} data-content-calendar-hidden>`;
    });
  }

  for (const view of ['context', 'dependency', 'history']) {
    html = hideElementById(html, 'button', `tab-${view}`);
    html = hideElementById(html, 'section', `view-${view}`);
    html = setTabState(html, view, false);
  }

  html = hideElementById(html, 'section', 'evidence-risk');

  html = html
    .replace(/(<button id="tab-outcome"[^>]*>)Outcomes(<\/button>)/, '$1Posts (Kanban)$2')
    .replace(/(<section id="view-outcome"[^>]*><h3>)Outcomes(<\/h3>)/, '$1Posts (Kanban)$2')
    .replace(/(<button id="tab-delivery"[^>]*>)Delivery(<\/button>)/, '$1Themes$2')
    .replace(/(<section id="view-delivery"[^>]*><h3>)Delivery(<\/h3>)/, '$1Themes$2')
    .replace(/(<button id="tab-release"[^>]*>)Releases(<\/button>)/, '$1Releases (Published)$2')
    .replace(/(<section id="view-release"[^>]*><h3>)Releases(<\/h3>)/, '$1Releases (Published)$2');

  function transformSection(source, startId, endId, transform) {
    const start = source.indexOf(`<section id="${startId}"`);
    const end = source.indexOf(`<section id="${endId}"`, start + 1);
    if (start === -1 || end === -1) return source;
    return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
  }

  function moveElementBefore(source, tag, movedId, targetId) {
    const movedStart = source.indexOf(`<${tag} id="${movedId}"`);
    const targetStart = source.indexOf(`<${tag} id="${targetId}"`);
    if (movedStart === -1 || targetStart === -1 || movedStart < targetStart) return source;
    const movedEnd =
      tag === 'button'
        ? source.indexOf(`</${tag}>`, movedStart) + `</${tag}>`.length
        : findSectionEnd(source, movedStart);
    if (movedEnd <= movedStart) return source;
    const moved = source.slice(movedStart, movedEnd);
    const withoutMoved = source.slice(0, movedStart) + source.slice(movedEnd);
    const nextTargetStart = withoutMoved.indexOf(`<${tag} id="${targetId}"`);
    return withoutMoved.slice(0, nextTargetStart) + moved + withoutMoved.slice(nextTargetStart);
  }

  function findSectionEnd(source, start) {
    const nextSection = source.indexOf('<section id=', start + 1);
    if (nextSection !== -1) return nextSection;
    const roadmapData = source.indexOf('<script type="application/json" id="roadmap-data"', start);
    return roadmapData === -1 ? source.length : roadmapData;
  }

  function updateOpeningTag(source, tag, id, update) {
    const pattern = new RegExp(`<${tag}\\b([^>]*\\bid="${id}"[^>]*)>`);
    return source.replace(pattern, (openingTag, attributes) => `<${tag}${update(attributes)}>`);
  }

  function setTabState(source, id, selected) {
    return updateOpeningTag(source, 'button', `tab-${id}`, (attributes) => {
      let next = attributes
        .replace(/\saria-selected="(?:true|false)"/, '')
        .replace(/\stabindex="-?\d+"/, '');
      next += ` aria-selected="${selected ? 'true' : 'false'}" tabindex="${selected ? '0' : '-1'}"`;
      return next;
    });
  }

  function setPanelState(source, id, selected) {
    return updateOpeningTag(source, 'section', `view-${id}`, (attributes) => {
      let next = attributes.replace(/\shidden\b/g, '');
      if (!selected) next += ' hidden';
      return next;
    });
  }

  function workflow(item) {
    return item.extensions?.['content/workflow'] ?? {};
  }

  function normalizeForMatch(value) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/&amp;/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function slugFromPostId(postId) {
    return String(postId ?? '').replace(/^\d+\./, '');
  }

  function numericIdFromPostId(postId) {
    return String(postId ?? '').split('.')[0] || null;
  }

  const analyticsPosts = analytics?.posts ?? [];
  const analyticsBySlug = new Map(analyticsPosts.map((post) => [post.slug, post]));
  const analyticsByNumericId = new Map(analyticsPosts.map((post) => [post.numericId, post]));
  const analyticsByTitle = new Map(
    analyticsPosts
      .filter((post) => post.title)
      .map((post) => [normalizeForMatch(post.title), post]),
  );

  function analyticsForItem(item) {
    const meta = workflow(item);
    const postId = meta.postId;
    return (
      analyticsBySlug.get(slugFromPostId(postId)) ??
      analyticsByNumericId.get(numericIdFromPostId(postId)) ??
      analyticsByTitle.get(normalizeForMatch(item.title)) ??
      null
    );
  }

  function formatNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return '0';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value));
  }

  function formatSeconds(value) {
    if (value == null || Number.isNaN(Number(value))) return '0s';
    const seconds = Math.round(Number(value));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  }

  function analyticsBadges(item) {
    const ga = analyticsForItem(item)?.ga;
    if (!ga) return '';
    return `<div class="analytics-badges" aria-label="Google Analytics metrics">
    <span title="GA4 views, ${escapeHtml(analytics?.period?.startDate ?? 'selected period')} to ${escapeHtml(analytics?.period?.endDate ?? 'selected period')}">${formatNumber(ga.views)} views</span>
    <span title="GA4 active users">${formatNumber(ga.activeUsers)} users</span>
    <span title="Average engagement time per active user">${formatSeconds(ga.averageEngagementSeconds)} avg</span>
  </div>`;
  }

  function tagBadges(item) {
    const tags = analyticsForItem(item)?.tags ?? [];
    if (tags.length === 0) return '';
    return `<div class="tag-badges">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
  }

  function themeStats(posts) {
    const metrics = posts.map((post) => analyticsForItem(post)?.ga).filter(Boolean);
    return {
      matched: metrics.length,
      views: metrics.reduce((sum, metric) => sum + (metric.views ?? 0), 0),
      users: metrics.reduce((sum, metric) => sum + (metric.activeUsers ?? 0), 0),
    };
  }

  function isNotionPost(item) {
    return workflow(item).source === 'notion:writing-ideas';
  }

  function isPublishedPost(item) {
    const meta = workflow(item);
    return (
      item.kind === 'milestone' &&
      (meta.notionStatus === 'published' || meta.published === true || meta.stage === 'publish')
    );
  }

  function publishDate(item) {
    return (
      item.schedule?.date ??
      item.description?.match(/Publish date: (\d{4}-\d{2}-\d{2})\./)?.[1] ??
      item.description?.match(/Published (\d{4}-\d{2}-\d{2})\./)?.[1] ??
      null
    );
  }

  function postCard(item) {
    const meta = workflow(item);
    const status = meta.notionStatus ?? meta.stage ?? item.status;
    const format = meta.format ? ` · ${meta.format}` : '';
    return `<article class="board-card commitment-${escapeHtml(item.commitment)} status-${escapeHtml(item.status)}" data-item data-item-id="${escapeHtml(item.id)}" data-status="${escapeHtml(item.status)}" data-horizon="${escapeHtml(item.horizon)}">
    <div class="board-card-top"><span class="workflow-label">${escapeHtml(status)}</span></div>
    <h4>${escapeHtml(item.title)}</h4>
    <p>${escapeHtml(item.description ?? `Notion status: ${status}.`)}</p>
    <footer><span>${escapeHtml(item.confidence)} confidence${escapeHtml(format)}</span><code>${escapeHtml(item.id)}</code></footer>
  </article>`;
  }

  function postRow(item) {
    const meta = workflow(item);
    const status = isPublishedPost(item)
      ? 'published'
      : (meta.notionStatus ?? meta.stage ?? item.status);
    const format = meta.format ? ` · ${meta.format}` : '';
    const date = publishDate(item);
    const detail = [item.horizon, format.replace(/^ · /, ''), date].filter(Boolean).join(' · ');
    return `<li class="theme-post-row" data-item data-status="${escapeHtml(item.status)}" data-horizon="${escapeHtml(item.horizon)}">
    <span class="workflow-label">${escapeHtml(status)}</span>
    <span class="theme-post-main"><strong>${escapeHtml(item.title)}</strong>${tagBadges(item)}${analyticsBadges(item)}</span>
    <small>${escapeHtml(detail)}</small>
  </li>`;
  }

  function themeBucket(item) {
    if (isPublishedPost(item)) return 'published';
    if (item.horizon === 'now') return 'now';
    if (item.horizon === 'next') return 'next';
    return 'later';
  }

  function statusSection(label, bucket, posts, open = false) {
    const rows =
      posts.map(postRow).join('') ||
      `<li class="theme-post-empty">No ${escapeHtml(label.toLowerCase())} posts.</li>`;
    return `<details class="theme-status-section theme-status-${escapeHtml(bucket)}"${open ? ' open' : ''}>
    <summary><span>${escapeHtml(label)}</span><strong>${posts.length}</strong></summary>
    <ul>${rows}</ul>
  </details>`;
  }

  function postKanbanSection(original) {
    const posts = roadmap.items.filter((item) => {
      const meta = workflow(item);
      return meta.source === 'notion:writing-ideas' && !isPublishedPost(item);
    });
    const lanes = [
      ['now', 'Now', 'drafting'],
      ['next', 'Next', 'outlining'],
      ['later', 'Later', 'idea'],
    ];
    const body = lanes
      .map(([horizon, label, notionStatus]) => {
        const items = posts.filter((item) => item.horizon === horizon);
        const cards =
          items.map(postCard).join('') ||
          `<p class="muted">No ${escapeHtml(notionStatus)} posts.</p>`;
        return `<section class="lane" data-drop-horizon="${horizon}" aria-labelledby="lane-posts-${horizon}">
      <h3 id="lane-posts-${horizon}">${label} <span class="lane-count">${items.length}</span></h3>
      ${cards}
    </section>`;
      })
      .join('');
    return original.replace(
      /<div class="pattern pattern-outcome-lanes"[\s\S]*<\/div><\/section>$/,
      `<div class="pattern pattern-outcome-lanes" data-pattern="post-kanban"><p class="pattern-note">Posts are grouped by Notion status: drafting is Now, outlining is Next, and idea is Later.</p><div class="pattern-now-next-later horizon-grid">${body}</div></div></section>`,
    );
  }

  function publishedSection(original) {
    const posts = roadmap.items.filter(isPublishedPost);
    const dated = posts
      .map((item) => ({ item, date: publishDate(item) }))
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')));
    const rows =
      dated
        .map(({ item, date }) => {
          const label = date
            ? new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              }).format(new Date(`${date}T00:00:00Z`))
            : 'Published';
          return `<div class="timeline-row timeline-undated" data-item data-status="${escapeHtml(item.status)}" data-horizon="${escapeHtml(item.horizon)}"><strong>${escapeHtml(item.title)}${tagBadges(item)}${analyticsBadges(item)}</strong><span class="timeline-marker">${escapeHtml(label)}</span></div>`;
        })
        .join('') || `<p class="muted">No published posts are currently tracked from Notion.</p>`;
    return original.replace(
      /<div class="pattern pattern-gantt-release"[\s\S]*<\/div><\/section>$/,
      `<div class="pattern pattern-gantt-release" data-pattern="published-posts"><p class="pattern-note">Published posts from the roadmap archive and Notion Posts database.</p><div class="pattern-gantt-release release-timeline"><section class="release-undated"><h3>Published posts <span>${posts.length}</span></h3><div class="timeline">${rows}</div></section></div></div></section>`,
    );
  }

  function themesSection(original) {
    const themes = roadmap.items.filter((item) => item.kind === 'deliverable');
    const posts = new Map(
      roadmap.items
        .filter((item) => isNotionPost(item) || isPublishedPost(item))
        .map((item) => [item.id, item]),
    );
    const byTheme = new Map(themes.map((theme) => [theme.id, []]));
    for (const relationship of roadmap.relationships) {
      if (relationship.type !== 'delivers') continue;
      const post = posts.get(relationship.from);
      if (!post || !byTheme.has(relationship.to)) continue;
      byTheme.get(relationship.to).push(post);
    }
    const assigned = new Set([...byTheme.values()].flat().map((post) => post.id));
    const unassigned = [...posts.values()].filter((post) => !assigned.has(post.id));
    if (unassigned.length) {
      themes.push({
        id: 'unassigned',
        title: 'Unassigned',
        description: 'Posts awaiting an editorial theme.',
      });
      byTheme.set('unassigned', unassigned);
    }
    const horizonRank = { now: 0, next: 1, later: 2 };
    const statusRank = { active: 0, proposed: 1, completed: 2, blocked: 3, cancelled: 4 };
    const bucketOrder = [
      ['published', 'Published'],
      ['now', 'Now'],
      ['next', 'Next'],
      ['later', 'Later'],
    ];
    const groups = themes
      .map((theme) => {
        const children = (byTheme.get(theme.id) ?? []).sort(
          (left, right) =>
            (themeBucket(left) === 'published' ? 0 : 1) -
              (themeBucket(right) === 'published' ? 0 : 1) ||
            horizonRank[left.horizon] - horizonRank[right.horizon] ||
            statusRank[left.status] - statusRank[right.status] ||
            left.title.localeCompare(right.title),
        );
        if (children.length === 0) return '';
        const stats = themeStats(children);
        const buckets = new Map(bucketOrder.map(([bucket]) => [bucket, []]));
        for (const child of children) buckets.get(themeBucket(child)).push(child);
        const sections = bucketOrder
          .filter(([bucket]) => buckets.get(bucket).length > 0)
          .map(([bucket, label]) =>
            statusSection(label, bucket, buckets.get(bucket), bucket !== 'published'),
          )
          .join('');
        return `<section class="theme-group">
        <h3>${escapeHtml(theme.title)} <span>${children.length}</span></h3>
        <p>${escapeHtml(theme.description ?? 'Editorial theme')}</p>
        <div class="theme-analytics-summary">
          <span>${formatNumber(stats.views)} views</span>
          <span>${formatNumber(stats.users)} users</span>
          <span>${formatNumber(stats.matched)} GA matches</span>
          ${analytics?.tags?.available ? '' : '<span>Substack tags unavailable</span>'}
        </div>
        <div class="theme-status-stack">${sections}</div>
      </section>`;
      })
      .filter(Boolean)
      .join('');
    return original.replace(
      /<div class="pattern pattern-delivery-plan"[\s\S]*<\/div><\/section>$/,
      `<div class="pattern pattern-themes" data-pattern="theme-map"><p class="pattern-note">Themes group posts by editorial epic, with published work separated from Now, Next, and Later.</p><div class="theme-grid">${groups}</div></div></section>`,
    );
  }

  html = transformSection(html, 'view-outcome', 'view-delivery', postKanbanSection);

  html = transformSection(html, 'view-delivery', 'view-release', themesSection);

  html = transformSection(html, 'view-release', 'view-dependency', (release) =>
    publishedSection(release)
      .replace(
        'Evidence-backed dates show release sequence; forecasts remain markers.',
        'Archive refresh work comes first; published posts remain below as a dated editorial history.',
      )
      .replace('Upcoming / date open', 'Refresh queue')
      .replaceAll('Date not evidenced', 'Timing open')
      .replace(
        /<time datetime="(\d{4})-(\d{2})-(\d{2})">[^<]+<\/time>/g,
        (_match, year, month, day) => {
          const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
          const label = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(date);
          return `<time datetime="${year}-${month}-${day}">${label}</time>`;
        },
      ),
  );

  html = moveElementBefore(html, 'button', 'tab-delivery', 'tab-outcome');
  html = moveElementBefore(html, 'section', 'view-delivery', 'view-outcome');
  for (const view of ['outcome', 'delivery', 'release']) {
    html = setTabState(html, view, view === 'delivery');
    html = setPanelState(html, view, view === 'delivery');
  }

  const contentCalendarStyles = `
<style data-content-calendar-styles>
#view-delivery .delivery-plan-group > .delivery-plan-row:not(.delivery-plan-child),
#view-delivery .delivery-plan-row[data-status="completed"]{display:none!important}
#view-delivery .pattern-delivery-plan{max-width:none}
#view-delivery .delivery-plan-group>h3{color:var(--text);font-size:.74rem}
#view-delivery .delivery-plan-label strong{font-size:.9rem}
#view-delivery .delivery-plan-bar{padding:7px 12px}
.theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;max-width:1280px}
.theme-group{border-radius:18px;background:rgba(252,253,252,.78);box-shadow:inset 0 0 0 1px rgba(18,24,22,.075),0 10px 30px rgba(24,38,32,.055);padding:16px}
.theme-group h3{display:flex;align-items:center;justify-content:space-between;margin:0 0 6px;font-size:1rem}
.theme-group h3 span{display:grid;place-items:center;min-width:25px;height:25px;border-radius:999px;background:rgba(18,24,22,.065);font-size:.72rem}
.theme-group p{margin:0 0 12px;color:var(--muted);font-size:.82rem}
.theme-analytics-summary,.analytics-badges,.tag-badges{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.theme-analytics-summary{margin:-3px 0 12px}
.theme-analytics-summary span,.analytics-badges span,.tag-badges span{display:inline-flex;align-items:center;border-radius:999px;background:rgba(18,24,22,.06);padding:3px 8px;color:var(--muted);font-size:.66rem;font-weight:750;white-space:nowrap}
.analytics-badges{margin-top:6px}
.analytics-badges span{background:var(--soft-green);color:var(--green)}
.tag-badges{margin-top:6px}
.tag-badges span{background:var(--soft-blue);color:var(--blue)}
.theme-status-stack{display:grid;gap:8px}
.theme-status-section{border-radius:14px;background:rgba(255,255,255,.62);box-shadow:inset 0 0 0 1px rgba(18,24,22,.065);overflow:hidden}
.theme-status-section summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;padding:10px 12px;font-size:.78rem;font-weight:750;list-style:none}
.theme-status-section summary::-webkit-details-marker{display:none}
.theme-status-section summary:before{content:"+";display:grid;place-items:center;width:18px;height:18px;border-radius:999px;background:rgba(18,24,22,.075);font-weight:800}
.theme-status-section[open] summary:before{content:"-"}
.theme-status-section summary span{margin-right:auto}
.theme-status-section summary strong{display:grid;place-items:center;min-width:23px;height:23px;border-radius:999px;background:rgba(18,24,22,.065);font-size:.7rem}
.theme-status-section ul{display:grid;gap:7px;list-style:none;margin:0;padding:0 10px 10px}
.theme-status-published summary{color:#23513d}
.theme-status-now summary{color:#6a4424}
.theme-status-next summary{color:#244c6a}
.theme-status-later summary{color:#585858}
.theme-post-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:9px;align-items:center;border-radius:12px;background:var(--surface);padding:10px;box-shadow:inset 0 0 0 1px rgba(18,24,22,.065)}
.theme-post-main{min-width:0}
.theme-post-row strong{min-width:0;font-size:.86rem;line-height:1.25}
.theme-post-row small{color:var(--muted);font-size:.7rem;white-space:nowrap}
.theme-post-empty{border-radius:12px;color:var(--muted);font-size:.78rem;padding:9px 10px;background:rgba(255,255,255,.45)}
#view-release .release-timeline{display:flex;flex-direction:column;max-width:1120px}
#view-release .release-undated{order:-1}
#view-release .release-undated .timeline{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
#view-release .release-undated .timeline-undated{grid-template-columns:minmax(0,1fr) auto;margin:0}
#view-release .timeline-row strong{display:block;min-width:0}
#view-release .timeline-event time{font-size:.76rem;font-weight:650}
@media(max-width:900px){.theme-grid{grid-template-columns:1fr}.theme-post-row{grid-template-columns:1fr}.theme-post-row small{white-space:normal}}
@media(max-width:760px){#view-release .release-undated .timeline{grid-template-columns:1fr}}
</style>`;

  if (!html.includes('data-content-calendar-styles')) {
    html = html.replace('</head>', `${contentCalendarStyles}</head>`);
  }

  html = html.replaceAll(
    'document.querySelectorAll(\'[role="tab"]\')',
    'document.querySelectorAll(\'[role="tab"]:not([hidden])\')',
  );

  html = html
    .replace(
      /const UI_STATE_KEY = 'rmp-ui-state-v2-([^']+)';/,
      "const UI_STATE_KEY = 'productaf-content-roadmap-template-v1-$1';",
    )
    .replace(
      /showTab\(typeof state\.tab === 'string' \? state\.tab : 'view-[a-z]+'\);/,
      "showTab(typeof state.tab === 'string' ? state.tab : 'view-delivery');",
    );

  return html;
}
