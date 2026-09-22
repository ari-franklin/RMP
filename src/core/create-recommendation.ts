import type { Confidence, Evidence, Recommendation, RoadmapStatus } from '../types/index.js';
import { contentId } from '../utils/ids.js';

export interface CreateRecommendationInput {
  itemId: string;
  proposedStatus: RoadmapStatus;
  supportingEvidence: Evidence[];
  conflictingEvidence?: Evidence[];
  confidence?: Confidence;
  rationale: string;
  requiredApprover: string;
}

export function createRecommendation(input: CreateRecommendationInput): Recommendation {
  const base = {
    itemId: input.itemId,
    proposedStatus: input.proposedStatus,
    supportingEvidenceIds: [...new Set(input.supportingEvidence.map((entry) => entry.id))].sort(),
    conflictingEvidenceIds: [
      ...new Set((input.conflictingEvidence ?? []).map((entry) => entry.id)),
    ].sort(),
    confidence: input.confidence ?? ('medium' as const),
    rationale: input.rationale,
    requiredApprover: input.requiredApprover,
    status: 'open' as const,
  };

  return { id: contentId('rec', base).slice(0, 68), ...base };
}
