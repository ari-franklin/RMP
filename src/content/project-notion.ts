import type { NotionSnapshot, SourceHealth, NotionPost } from '../adapters/notion-types.js';
import {
  selectNotionNow,
  hasSupportedNotionMapping,
  type NotionWorkflowPolicy,
} from './notion-policy.js';
import type {
  Evidence,
  Roadmap,
  RmpConfig,
  TransitionReceipt,
  RoadmapItem,
} from '../types/index.js';
import { createSourceChange, type SourceChange } from '../history/source-changes.js';
import { contentId } from '../utils/ids.js';
import { canonicalJson } from '../utils/json.js';
import { validateRoadmap, validateTransitionReceipt } from '../schemas/index.js';
import { applyTransition } from '../core/apply-transition.js';
import { evaluateNotionMirrorAuthority } from '../core/evaluate-authority.js';
import { createRecommendation } from '../core/create-recommendation.js';

export interface ProjectNotionInput {
  roadmap: Roadmap;
  snapshot: NotionSnapshot;
  health: SourceHealth;
  policy: NotionWorkflowPolicy;
  config: RmpConfig;
  now: string;
  receipts?: TransitionReceipt[];
  journal?: SourceChange[];
}
export interface NotionProjection {
  valid: boolean;
  roadmap: Roadmap;
  receipts: TransitionReceipt[];
  journal: SourceChange[];
  diagnostics: string[];
  nowSelection: string[];
  nextOrder: string[];
}

function checkInput(input: ProjectNotionInput): void {
  const { snapshot: s, policy: p, health: h, roadmap: r } = input;
  const timestamp = Date.parse(input.now);
  if (
    !Number.isFinite(timestamp) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(input.now) ||
    [...(input.receipts ?? []), ...(input.journal ?? [])].some(
      (entry) => Date.parse(entry.timestamp) > timestamp,
    )
  )
    throw new Error('Audit timestamp must follow accepted history');
  const envelope: { schemaVersion: unknown; provider: unknown } = s;
  const healthProvider: unknown = h.provider;
  if (
    !validateRoadmap(r).valid ||
    canonicalJson(r.extensions['content/notion-workflow']) !== canonicalJson(p) ||
    p.nowSelection.length > 2 ||
    new Set(p.nowSelection).size !== p.nowSelection.length ||
    envelope.schemaVersion !== 1 ||
    envelope.provider !== 'notion' ||
    p.dataSourceId !== s.dataSourceId ||
    input.config.adapters.notion?.dataSourceId !== s.dataSourceId ||
    !input.config.adapters.enabled.includes('notion') ||
    healthProvider !== 'notion' ||
    h.state !== 'fresh' ||
    h.lastSuccessfulAt !== s.fetchedAt ||
    s.contentHash !== contentId('notion', s.posts) ||
    new Set(s.posts.map((post) => post.pageId)).size !== s.posts.length
  )
    throw new Error('Invalid source, freshness or registered workflow policy');
  if (!hasSupportedNotionMapping(p)) throw new Error('Unsupported editorial mapping');
  for (const [pageId, itemId] of Object.entries(p.pageToItem))
    if (itemId !== `mil-notion-${pageId}`) throw new Error('Invalid source ownership');
  for (const ids of Object.values(p.pageToThemes))
    for (const id of ids)
      if (!r.items.some((i) => i.id === id && i.kind === 'deliverable'))
        throw new Error('Unknown theme assignment');
  for (const alias of p.publishedMatches)
    if (
      !r.items.some((i) => i.id === alias.itemId && i.kind === 'milestone') ||
      Object.values(p.pageToItem).includes(alias.itemId)
    )
      throw new Error('Invalid publication alias');
  for (const post of s.posts) {
    if (
      !/^[0-9a-f]{32}$/.test(post.pageId) ||
      post.dataSourceId !== s.dataSourceId ||
      !post.title ||
      !Object.hasOwn(p.statusMapping, p.statusOptions[post.statusOptionId] ?? '')
    )
      throw new Error('Unknown source vocabulary or invalid page');
    const existing = r.items.find((i) => i.id === `mil-notion-${post.pageId}`);
    if (
      existing &&
      (existing.kind !== 'milestone' ||
        existing.extensions['content/workflow']?.source !== 'notion:writing-ideas')
    )
      throw new Error('Source identity collides with local work');
  }
}
function observation(post: NotionPost): Evidence {
  return {
    id: `ev-${contentId('notion', post)}`,
    class: 'deterministic',
    source: 'notion',
    sourceRef: `https://www.notion.so/${post.pageId}`,
    observedAt: post.lastEditedAt,
    summary: 'Notion post snapshot observed',
    extensions: { 'content/notion-observation': { ...post } },
  };
}

/** Pure projection of a freshly collected, complete snapshot. No IO or clock reads. */
export function projectNotionWorkflow(input: ProjectNotionInput): NotionProjection {
  const failure: NotionProjection = {
    valid: false,
    roadmap: input.roadmap,
    receipts: [],
    journal: [],
    diagnostics: [],
    nowSelection: [],
    nextOrder: [],
  };
  try {
    checkInput(input);
    const { snapshot, policy } = input;
    let roadmap = structuredClone(input.roadmap);
    const receipts: TransitionReceipt[] = [];
    const journal: SourceChange[] = [];
    const diagnostics: string[] = [];
    const nowSelection = selectNotionNow(policy, snapshot.posts);
    const eligible = snapshot.posts.filter((p) => !p.archived && !p.inTrash);
    const nextOrder = eligible
      .filter(
        (p) =>
          policy.statusOptions[p.statusOptionId] === 'outlining' ||
          (policy.statusOptions[p.statusOptionId] === 'drafting' &&
            !nowSelection.includes(p.pageId)),
      )
      .sort((a, b) => {
        const overflow = (p: NotionPost) =>
          policy.statusOptions[p.statusOptionId] === 'drafting' ? 0 : 1;
        const rank = (p: NotionPost) =>
          policy.nextCuration.find((c) => c.id === p.pageId)?.rank ?? Number.MAX_SAFE_INTEGER;
        return overflow(a) - overflow(b) || rank(a) - rank(b) || a.pageId.localeCompare(b.pageId);
      })
      .map((p) => p.pageId);
    const addEvidence = (e: Evidence) => {
      if (!roadmap.evidence.some((v) => v.id === e.id)) roadmap.evidence.push(e);
    };
    const update = (post: NotionPost, desired: RoadmapItem, alias = false) => {
      const before = roadmap.items.find((i) => i.id === desired.id);
      const e = observation(post);
      const sourceMirror = { policy, snapshot, health: input.health, pageId: post.pageId };
      const decision = evaluateNotionMirrorAuthority({
        item: before ?? desired,
        evidence: e,
        proposedStatus: desired.status,
        matchKind: 'explicit',
        config: input.config,
        sourceMirror,
      });
      if (decision.disposition !== 'automatic') {
        diagnostics.push(`Review required for ${desired.id}: ${decision.rationale}`);
        if (before && before.status !== desired.status) {
          const rec = createRecommendation({
            itemId: before.id,
            proposedStatus: desired.status,
            supportingEvidence: [e],
            rationale: decision.rationale,
            requiredApprover: decision.requiredApprover,
          });
          if (!roadmap.recommendations.some((r) => r.id === rec.id))
            roadmap.recommendations.push(rec);
          addEvidence(e);
        }
        return;
      }
      addEvidence(e);
      if (before && canonicalJson(before) === canonicalJson(desired)) return;
      if (before && before.status !== desired.status) {
        const previous =
          [...(input.receipts ?? []), ...receipts].filter((r) => r.itemId === before.id).at(-1)
            ?.id ?? 'initial';
        const transition = applyTransition({
          roadmap,
          itemId: before.id,
          newStatus: desired.status,
          evidence: [e],
          authorizingRule: decision.rule,
          actor: 'notion',
          timestamp: input.now,
          sourceMirror,
          config: input.config,
          rationale: `${decision.rationale} Previous receipt: ${previous}; policy: ${contentId('policy', policy)}`,
        });
        roadmap = transition.roadmap;
        receipts.push(transition.receipt);
      }
      if (before) roadmap.items = roadmap.items.map((i) => (i.id === desired.id ? desired : i));
      else {
        roadmap.items.push(desired);
        for (const theme of new Set(policy.pageToThemes[post.pageId] ?? []))
          roadmap.relationships.push({ from: desired.id, to: theme, type: 'delivers' });
      }
      // Alias authority only permits completion; local alias fields stay untouched.
      if (!alias) {
        const previousChangeId =
          [...(input.journal ?? []), ...journal].filter((j) => j.itemId === desired.id).at(-1)
            ?.id ?? null;
        journal.push(
          createSourceChange({
            schemaVersion: 1,
            provider: 'notion',
            dataSourceId: snapshot.dataSourceId,
            pageId: post.pageId,
            itemId: desired.id,
            evidenceId: e.id,
            policyVersion: 1,
            policyHash: contentId('policy', policy),
            timestamp: input.now,
            previousChangeId,
            before: before ?? null,
            after: desired,
          }),
        );
      }
    };
    const ownedPages = { ...policy.pageToItem };
    for (const i of roadmap.items)
      if (
        i.kind === 'milestone' &&
        i.extensions['content/workflow']?.source === 'notion:writing-ideas' &&
        /^mil-notion-[0-9a-f]{32}$/.test(i.id)
      )
        ownedPages[i.id.slice(11)] = i.id;
    for (const [pageId, itemId] of Object.entries(ownedPages))
      if (!snapshot.posts.some((p) => p.pageId === pageId))
        diagnostics.push(`Missing source page ${pageId}; retained ${itemId} for review.`);
    for (const post of [...snapshot.posts].sort((a, b) => a.pageId.localeCompare(b.pageId))) {
      if (post.archived || post.inTrash) {
        diagnostics.push(`Archived source page ${post.pageId}; retained for review.`);
        continue;
      }
      const status = policy.statusOptions[post.statusOptionId];
      if (!status) throw new Error('Unknown source vocabulary');
      const rule =
        status === 'drafting' && !nowSelection.includes(post.pageId)
          ? policy.draftingOverflow
          : policy.statusMapping[status];
      const id = `mil-notion-${post.pageId}`;
      const before = roadmap.items.find((i) => i.id === id);
      const e = observation(post);
      const localMetadata = { ...before?.extensions['content/workflow'] };
      delete localMetadata.type;
      delete localMetadata.blog;
      delete localMetadata.notionSeries;
      const metadata = {
        ...localMetadata,
        source: 'notion:writing-ideas',
        dataSourceId: snapshot.dataSourceId,
        pageId: post.pageId,
        stage: rule.stage,
        statusOptionId: post.statusOptionId,
        themeIds: policy.pageToThemes[post.pageId] ?? [],
        ...(post.type === undefined ? {} : { type: post.type }),
        ...(post.blog === undefined ? {} : { blog: post.blog }),
        ...(post.series === undefined ? {} : { notionSeries: post.series }),
      };
      const desired: RoadmapItem = {
        ...(before ?? {
          id,
          kind: 'milestone',
          commitment: 'planned',
          confidence: 'medium',
          extensions: {},
        }),
        title: post.title,
        status: rule.roadmapStatus,
        horizon: rule.horizon,
        extensions: { ...before?.extensions, 'content/workflow': metadata },
      };
      if (status === 'published' && post.publishDate)
        desired.schedule = {
          precision: 'exact',
          date: post.publishDate.slice(0, 10),
          evidenceIds: [e.id],
        };
      update(post, desired);
      if (status === 'published')
        for (const alias of policy.publishedMatches.filter((a) => a.notionPageId === post.pageId)) {
          const target = roadmap.items.find((i) => i.id === alias.itemId);
          if (target) update(post, { ...target, status: 'completed' }, true);
        }
    }
    if (input.config.authority.deterministic === 'automatic')
      roadmap.extensions['content/notion-workflow'] = structuredClone({
        ...policy,
        nowSelection,
      });
    // Revision is one semantic generation, independent of the number of source rows.
    roadmap.revision = input.roadmap.revision;
    if (canonicalJson(roadmap) !== canonicalJson(input.roadmap)) roadmap.revision++;
    if (
      !validateRoadmap(roadmap).valid ||
      receipts.some((receipt) => !validateTransitionReceipt(receipt).valid)
    )
      throw new Error('Projected roadmap or receipts failed validation');
    return structuredClone({
      valid: true,
      roadmap,
      receipts,
      journal,
      diagnostics,
      nowSelection,
      nextOrder,
    });
  } catch {
    return {
      ...failure,
      diagnostics: [
        'Source projection rejected; review source identity, vocabulary and workflow configuration.',
      ],
    };
  }
}
