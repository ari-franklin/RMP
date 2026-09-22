export const schemaVersion = '1.0.0' as const;

export type SchemaVersion = typeof schemaVersion;
export type RoadmapItemKind = 'outcome' | 'deliverable' | 'milestone' | 'release';
export type RoadmapStatus = 'proposed' | 'active' | 'blocked' | 'completed' | 'cancelled';
export type Horizon = 'now' | 'next' | 'later';
export type Commitment = 'exploratory' | 'planned' | 'committed';
export type Confidence = 'low' | 'medium' | 'high';
export type EvidenceClass =
  'deterministic' | 'corroborated' | 'observedOutcome' | 'inferred' | 'strategic';

export interface MetricSignal {
  metric: string;
  target: number;
  unit: string;
}

export interface Measurement {
  observedAt: string;
  value: number;
  successful: boolean;
  evidenceIds: string[];
}

export interface Schedule {
  precision: 'none' | 'window' | 'exact';
  earliest?: string;
  latest?: string;
  date?: string;
  evidenceIds: string[];
}

export interface RoadmapItem {
  id: string;
  kind: RoadmapItemKind;
  title: string;
  description?: string;
  status: RoadmapStatus;
  horizon: Horizon;
  commitment: Commitment;
  confidence: Confidence;
  signal?: MetricSignal;
  measurements?: Measurement[];
  schedule?: Schedule;
  extensions: Record<string, Record<string, unknown>>;
}

export interface Relationship {
  from: string;
  to: string;
  type: 'supports' | 'delivers' | 'gates' | 'dependsOn' | 'blocks';
  expectedImpact?: string;
}

export interface Evidence {
  id: string;
  class: EvidenceClass;
  source: string;
  sourceRef: string;
  observedAt: string;
  summary: string;
  extensions: Record<string, Record<string, unknown>>;
}

export interface Recommendation {
  id: string;
  itemId: string;
  proposedStatus: RoadmapStatus;
  supportingEvidenceIds: string[];
  conflictingEvidenceIds: string[];
  confidence: Confidence;
  rationale: string;
  requiredApprover: string;
  status: 'open' | 'accepted' | 'rejected' | 'superseded';
}

export interface Roadmap {
  schemaVersion: SchemaVersion;
  revision: number;
  title: string;
  items: RoadmapItem[];
  relationships: Relationship[];
  evidence: Evidence[];
  recommendations: Recommendation[];
  extensions: Record<string, Record<string, unknown>>;
}

export interface TransitionReceipt {
  id: string;
  schemaVersion: SchemaVersion;
  itemId: string;
  previousStatus: RoadmapStatus;
  newStatus: RoadmapStatus;
  timestamp: string;
  evidenceIds: string[];
  evidenceClass: EvidenceClass;
  authorizingRule: string;
  actor: string;
  disposition: 'automatic' | 'approved';
  rationale?: string;
  supersedes?: string;
  extensions: Record<string, Record<string, unknown>>;
}
