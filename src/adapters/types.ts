import type { EvidenceClass } from '../types/index.js';

export type AdapterCapability =
  | 'branches'
  | 'changedFiles'
  | 'commits'
  | 'measurements'
  | 'pagination'
  | 'releases'
  | 'workItems';

export interface AdapterIdentity {
  provider: string;
  version: string;
  capabilities: AdapterCapability[];
}

export interface AdapterCursor {
  value: string;
}

export interface AdapterCollectionContext {
  repositoryRoot: string;
}

export type EvidenceKind =
  | 'branch'
  | 'changedFiles'
  | 'commit'
  | 'measurement'
  | 'merge'
  | 'planCompletion'
  | 'release'
  | 'tag'
  | 'workItem';

export interface EvidenceProvenance {
  provider: string;
  eventId: string;
  sourceRef: string;
}

export interface NormalizedEvidence {
  id: string;
  kind: EvidenceKind;
  class: EvidenceClass;
  observedAt: string;
  summary: string;
  itemRefs: string[];
  provenance: EvidenceProvenance;
  data: Record<string, unknown>;
}

export interface AdapterDiagnostic {
  provider: string;
  code: 'adapter-error' | 'ambiguous-item' | 'invalid-record' | 'not-a-repository';
  message: string;
  sourceRef?: string;
}

export interface AdapterCollection {
  evidence: NormalizedEvidence[];
  diagnostics: AdapterDiagnostic[];
  cursor?: AdapterCursor;
}

export interface Adapter {
  readonly identity: AdapterIdentity;
  collect(context: AdapterCollectionContext, cursor?: AdapterCursor): Promise<AdapterCollection>;
}

export interface RegistryCollection {
  evidence: NormalizedEvidence[];
  diagnostics: AdapterDiagnostic[];
  cursors: Record<string, AdapterCursor | undefined>;
}
