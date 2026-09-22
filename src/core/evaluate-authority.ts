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
