import { selectNotionNow, hasSupportedNotionMapping } from '../content/notion-policy.js';
import { contentId } from '../utils/ids.js';
import type { RmpConfig, RoadmapItem, RoadmapStatus, Evidence } from '../types/index.js';
import type { MatchKind } from './match-evidence.js';

export interface AuthorityDecision {
  disposition: 'automatic' | 'recommendation';
  rule: string;
  rationale: string;
  requiredApprover: string;
}

export interface AuthorityInput {
  item: RoadmapItem;
  evidence: Evidence;
  proposedStatus: RoadmapStatus;
  matchKind: MatchKind;
  config: RmpConfig;
}

function hasSuccessfulOutcomeMeasurement(item: RoadmapItem, evidenceId: string): boolean {
  return (
    item.kind === 'outcome' &&
    (item.measurements ?? []).some(
      (measurement) => measurement.successful && measurement.evidenceIds.includes(evidenceId),
    )
  );
}

export function evaluateAuthority(input: AuthorityInput): AuthorityDecision {
  const { item, evidence, proposedStatus, matchKind, config } = input;
  const policy = config.authority[evidence.class];
  const rulePrefix = `repository-policy:${evidence.class}`;

  if (matchKind === 'ambiguous' || matchKind === 'fuzzy' || matchKind === 'unmatched') {
    return {
      disposition: 'recommendation',
      rule: `${rulePrefix}:match-${matchKind}`,
      rationale: `${matchKind} evidence matching requires review.`,
      requiredApprover: 'roadmap-owner',
    };
  }

  if (
    item.kind === 'outcome' &&
    proposedStatus === 'completed' &&
    (evidence.class !== 'observedOutcome' || !hasSuccessfulOutcomeMeasurement(item, evidence.id))
  ) {
    return {
      disposition: 'recommendation',
      rule: `${rulePrefix}:outcome-measurement-required`,
      rationale:
        'Outcome completion requires a successful observed measurement tied to this evidence.',
      requiredApprover: 'outcome-owner',
    };
  }

  if (evidence.class === 'strategic') {
    return {
      disposition: 'recommendation',
      rule: `${rulePrefix}:strategic-review`,
      rationale: 'Strategic changes remain reviewable recommendations.',
      requiredApprover: 'roadmap-owner',
    };
  }

  if (policy !== 'automatic') {
    return {
      disposition: 'recommendation',
      rule: `${rulePrefix}:${policy}`,
      rationale: `Repository policy requires ${policy} for ${evidence.class} evidence.`,
      requiredApprover: 'roadmap-owner',
    };
  }

  return {
    disposition: 'automatic',
    rule: `${rulePrefix}:automatic`,
    rationale: `${evidence.class} evidence is authorized for automatic transition.`,
    requiredApprover: '',
  };
}

export interface NotionMirrorContext {
  policy: import('../content/notion-policy.js').NotionWorkflowPolicy;
  snapshot: import('../adapters/notion-types.js').NotionSnapshot;
  health: import('../adapters/notion-types.js').SourceHealth;
  pageId: string;
}

/** Narrow source-mirror authority; never applies to generic reconciliation. */
export function evaluateNotionMirrorAuthority(
  input: AuthorityInput & { sourceMirror: NotionMirrorContext },
): AuthorityDecision {
  const base = evaluateAuthority(input);
  const { policy, snapshot, health, pageId } = input.sourceMirror;
  const post = snapshot.posts.find((p) => p.pageId === pageId);
  const ownId = `mil-notion-${pageId}`;
  const owned =
    input.item.id === ownId &&
    (policy.pageToItem[pageId] === undefined || policy.pageToItem[pageId] === ownId) &&
    input.item.extensions['content/workflow']?.source === 'notion:writing-ideas' &&
    (input.item.extensions['content/workflow'].dataSourceId === undefined ||
      input.item.extensions['content/workflow'].dataSourceId === snapshot.dataSourceId) &&
    (input.item.extensions['content/workflow'].pageId === undefined ||
      input.item.extensions['content/workflow'].pageId === pageId);
  const alias = policy.publishedMatches.some(
    (a) => a.notionPageId === pageId && a.itemId === input.item.id,
  );
  const status = post && policy.statusOptions[post.statusOptionId];
  const expected =
    status === 'drafting' && !selectNotionNow(policy, snapshot.posts).includes(pageId)
      ? policy.draftingOverflow
      : status
        ? policy.statusMapping[status]
        : undefined;
  const provider: unknown = snapshot.provider;
  const valid =
    input.matchKind === 'explicit' &&
    input.item.kind === 'milestone' &&
    input.evidence.class === 'deterministic' &&
    input.config.adapters.enabled.includes('notion') &&
    input.config.adapters.notion?.dataSourceId === snapshot.dataSourceId &&
    hasSupportedNotionMapping(policy) &&
    policy.dataSourceId === snapshot.dataSourceId &&
    provider === 'notion' &&
    health.state === 'fresh' &&
    health.lastSuccessfulAt === snapshot.fetchedAt &&
    snapshot.contentHash === contentId('notion', snapshot.posts) &&
    post &&
    !post.archived &&
    !post.inTrash &&
    post.dataSourceId === snapshot.dataSourceId &&
    input.evidence.id === `ev-${contentId('notion', post)}` &&
    input.evidence.source === 'notion' &&
    input.evidence.sourceRef === `https://www.notion.so/${pageId}` &&
    input.evidence.observedAt === post.lastEditedAt &&
    (owned || (alias && status === 'published' && input.proposedStatus === 'completed')) &&
    expected?.roadmapStatus === input.proposedStatus &&
    (input.item.status === input.proposedStatus ||
      !['completed', 'cancelled'].includes(input.item.status));
  if (!valid)
    return {
      disposition: 'recommendation',
      rule: 'notion:source-mirror:review',
      rationale: 'Source ownership, freshness or terminal-state protection requires review.',
      requiredApprover: 'roadmap-owner',
    };
  if (base.disposition !== 'automatic') return base;
  return {
    disposition: 'automatic',
    rule: 'notion:source-mirror:v1',
    rationale: 'Fresh source observation mirrors the registered editorial workflow.',
    requiredApprover: '',
  };
}
