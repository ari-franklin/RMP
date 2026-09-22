import type { EvidenceClass } from './domain.js';

export type AuthorityDisposition = 'automatic' | 'recommendation' | 'approval';

export interface RmpConfig {
  schemaVersion: '1.0.0';
  authority: Record<EvidenceClass, AuthorityDisposition>;
  views: {
    default: 'outcome' | 'delivery' | 'release' | 'dependency' | 'evidence';
  };
  adapters: {
    enabled: string[];
  };
  extensions: Record<string, Record<string, unknown>>;
}
