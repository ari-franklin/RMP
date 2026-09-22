import { defaultConfig } from '../config/index.js';
import type {
  Evidence,
  Recommendation,
  RmpConfig,
  Roadmap,
  RoadmapItem,
  RoadmapStatus,
  TransitionReceipt,
} from '../types/index.js';
import { applyTransition } from './apply-transition.js';
import { createRecommendation } from './create-recommendation.js';
import { evaluateAuthority } from './evaluate-authority.js';
import { evidenceIntent, matchEvidence, type EvidenceMatch } from './match-evidence.js';

export interface ReconcileInput {
  roadmap: Roadmap;
  evidence: Evidence[];
  receipts?: TransitionReceipt[];
  config?: RmpConfig;
  now: string;
  actor?: string;
}

export interface ReconcileResult {
  roadmap: Roadmap;
  receipts: TransitionReceipt[];
  recommendations: Recommendation[];
  diagnostics: string[];
}

interface Candidate {
  evidence: Evidence;
  match: EvidenceMatch;
  itemId: string;
  proposedStatus: RoadmapStatus;
}

function groupBy<T, K>(values: readonly T[], keyFor: (value: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function withMeasurement(item: RoadmapItem, evidence: Evidence): RoadmapItem {
  const measurement = evidenceIntent(evidence).measurement;
  if (item.kind !== 'outcome' || !measurement) return item;
  return {
    ...item,
    measurements: [
      ...(item.measurements ?? []),
      {
        observedAt: evidence.observedAt,
        value: measurement.value,
        successful: measurement.successful,
        evidenceIds: [evidence.id],
      },
    ],
  };
}

function appendRecommendations(
  roadmap: Roadmap,
  recommendations: Recommendation[],
  evidence: Evidence[],
): Roadmap {
  if (recommendations.length === 0) return roadmap;
  const knownRecommendations = new Set(roadmap.recommendations.map((entry) => entry.id));
  const knownEvidence = new Set(roadmap.evidence.map((entry) => entry.id));
  return {
    ...roadmap,
    revision: roadmap.revision + 1,
    evidence: [...roadmap.evidence, ...evidence.filter((entry) => !knownEvidence.has(entry.id))],
    recommendations: [
      ...roadmap.recommendations,
      ...recommendations.filter((entry) => !knownRecommendations.has(entry.id)),
    ],
  };
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  const processedEvidence = new Set([
    ...input.roadmap.evidence.map((entry) => entry.id),
    ...(input.receipts ?? []).flatMap((receipt) => receipt.evidenceIds),
  ]);
  const freshEvidence = input.evidence.filter((entry) => !processedEvidence.has(entry.id));
  const diagnostics: string[] = [];
  const candidates: Candidate[] = [];

  for (const evidence of freshEvidence) {
    const match = matchEvidence(input.roadmap, evidence);
    const proposedStatus = evidenceIntent(evidence).proposedStatus;
    if (!proposedStatus || match.itemIds.length === 0) {
      diagnostics.push(`Evidence ${evidence.id} has no actionable roadmap match or status.`);
      continue;
    }
    for (const itemId of match.itemIds)
      candidates.push({ evidence, match, itemId, proposedStatus });
  }

  let roadmap = input.roadmap;
  const receipts: TransitionReceipt[] = [];
  const recommendations: Recommendation[] = [];
  const byItem = groupBy(candidates, (candidate) => candidate.itemId);

  for (const [itemId, itemCandidates] of byItem) {
    const item = roadmap.items.find((entry) => entry.id === itemId);
    if (!item) continue;
    const byStatus = groupBy(itemCandidates, (candidate) => candidate.proposedStatus);
    const statuses = [...byStatus.keys()].sort();

    if (statuses.length > 1) {
      const decisions = itemCandidates.map((candidate) => ({
        candidate,
        decision: evaluateAuthority({
          item: withMeasurement(item, candidate.evidence),
          evidence: candidate.evidence,
          proposedStatus: candidate.proposedStatus,
          matchKind: candidate.match.kind,
          config: input.config ?? defaultConfig,
        }),
      }));

      if (decisions.every(({ decision }) => decision.disposition !== 'automatic')) {
        for (const { candidate, decision } of decisions) {
          recommendations.push(
            createRecommendation({
              itemId,
              proposedStatus: candidate.proposedStatus,
              supportingEvidence: [candidate.evidence],
              confidence: candidate.evidence.class === 'strategic' ? 'medium' : 'low',
              rationale: decision.rationale,
              requiredApprover: decision.requiredApprover,
            }),
          );
        }
        continue;
      }

      const proposedStatus = statuses[0];
      if (!proposedStatus) continue;
      const supporting = byStatus.get(proposedStatus) ?? [];
      const conflicting = statuses.slice(1).flatMap((status) => byStatus.get(status) ?? []);
      recommendations.push(
        createRecommendation({
          itemId,
          proposedStatus,
          supportingEvidence: supporting.map((candidate) => candidate.evidence),
          conflictingEvidence: conflicting.map((candidate) => candidate.evidence),
          confidence: 'low',
          rationale: 'Conflicting evidence proposes different states for the same roadmap item.',
          requiredApprover: 'roadmap-owner',
        }),
      );
      continue;
    }

    const candidate = itemCandidates[0];
    if (!candidate || candidate.proposedStatus === item.status) continue;
    const evaluatedItem = withMeasurement(item, candidate.evidence);
    const decision = evaluateAuthority({
      item: evaluatedItem,
      evidence: candidate.evidence,
      proposedStatus: candidate.proposedStatus,
      matchKind: candidate.match.kind,
      config: input.config ?? defaultConfig,
    });

    if (decision.disposition === 'automatic') {
      const measuredRoadmap =
        evaluatedItem === item
          ? roadmap
          : {
              ...roadmap,
              items: roadmap.items.map((entry) => (entry.id === item.id ? evaluatedItem : entry)),
            };
      const transition = applyTransition({
        roadmap: measuredRoadmap,
        itemId,
        newStatus: candidate.proposedStatus,
        evidence: itemCandidates.map((entry) => entry.evidence),
        authorizingRule: decision.rule,
        actor: input.actor ?? candidate.evidence.source,
        timestamp: input.now,
        rationale: decision.rationale,
      });
      roadmap = transition.roadmap;
      receipts.push(transition.receipt);
    } else {
      recommendations.push(
        createRecommendation({
          itemId,
          proposedStatus: candidate.proposedStatus,
          supportingEvidence: itemCandidates.map((entry) => entry.evidence),
          confidence: candidate.evidence.class === 'strategic' ? 'medium' : 'low',
          rationale: decision.rationale,
          requiredApprover: decision.requiredApprover,
        }),
      );
    }
  }

  roadmap = appendRecommendations(roadmap, recommendations, freshEvidence);
  return { roadmap, receipts, recommendations, diagnostics };
}
