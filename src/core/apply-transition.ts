import type { Evidence, Roadmap, RoadmapStatus, TransitionReceipt } from '../types/index.js';
import { contentId } from '../utils/ids.js';

export interface ApplyTransitionInput {
  roadmap: Roadmap;
  itemId: string;
  newStatus: RoadmapStatus;
  evidence: Evidence[];
  authorizingRule: string;
  actor: string;
  timestamp: string;
  disposition?: TransitionReceipt['disposition'];
  rationale?: string;
  supersedes?: string;
}

const forwardTransitions: Record<RoadmapStatus, ReadonlySet<RoadmapStatus>> = {
  proposed: new Set(['active', 'cancelled']),
  active: new Set(['blocked', 'completed', 'cancelled']),
  blocked: new Set(['active', 'completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

export function applyTransition(input: ApplyTransitionInput): {
  roadmap: Roadmap;
  receipt: TransitionReceipt;
} {
  const item = input.roadmap.items.find((candidate) => candidate.id === input.itemId);
  if (!item) throw new Error(`Roadmap item not found: ${input.itemId}`);
  if (input.evidence.length === 0) throw new Error('A transition requires evidence');

  const isReversal = input.supersedes !== undefined;
  const isObservedReleaseCompletion =
    item.kind === 'release' &&
    item.status === 'proposed' &&
    input.newStatus === 'completed' &&
    input.evidence.every((entry) => entry.class === 'deterministic');
  if (
    !forwardTransitions[item.status].has(input.newStatus) &&
    !isReversal &&
    !isObservedReleaseCompletion
  ) {
    throw new Error(`Illegal transition from ${item.status} to ${input.newStatus}`);
  }
  if (isReversal && input.disposition !== 'approved') {
    throw new Error('A reversal must be explicitly approved');
  }

  const evidenceIds = [...new Set(input.evidence.map((entry) => entry.id))].sort();
  const receiptBase = {
    schemaVersion: '1.0.0' as const,
    itemId: item.id,
    previousStatus: item.status,
    newStatus: input.newStatus,
    timestamp: input.timestamp,
    evidenceIds,
    evidenceClass: input.evidence[0]?.class ?? 'inferred',
    authorizingRule: input.authorizingRule,
    actor: input.actor,
    disposition: input.disposition ?? ('automatic' as const),
    ...(input.rationale !== undefined ? { rationale: input.rationale } : {}),
    ...(input.supersedes !== undefined ? { supersedes: input.supersedes } : {}),
    extensions: {},
  };
  const receipt: TransitionReceipt = {
    id: contentId('tr', receiptBase).slice(0, 67),
    ...receiptBase,
  };
  const knownEvidence = new Set(input.roadmap.evidence.map((entry) => entry.id));

  return {
    roadmap: {
      ...input.roadmap,
      revision: input.roadmap.revision + 1,
      items: input.roadmap.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, status: input.newStatus } : candidate,
      ),
      evidence: [
        ...input.roadmap.evidence,
        ...input.evidence.filter((entry) => !knownEvidence.has(entry.id)),
      ],
    },
    receipt,
  };
}
