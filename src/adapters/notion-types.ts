import type { NormalizedEvidence } from './types.js';

export interface NotionPost {
  pageId: string;
  lastEditedAt: string;
  title: string;
  statusOptionId: string;
  statusName: string;
  dataSourceId: string;
  publishDate?: string;
  type?: string[];
  blog?: string;
  series?: string[];
  archived: boolean;
  inTrash: boolean;
}

export interface NotionSnapshot {
  schemaVersion: 1;
  provider: 'notion';
  dataSourceId: string;
  fetchedAt: string;
  contentHash: string;
  posts: NotionPost[];
}

export interface SourceHealth {
  provider: 'notion';
  state: 'fresh' | 'stale' | 'offline' | 'uninitialized';
  lastAttemptAt?: string;
  lastSuccessfulAt?: string;
  errorCode?: 'auth' | 'access' | 'schema' | 'timeout' | 'limit' | 'transport' | 'incomplete';
}

export interface CompleteSourceCollection {
  snapshot: NotionSnapshot;
  evidence: NormalizedEvidence[];
}
