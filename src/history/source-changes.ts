import type { RoadmapItem } from '../types/index.js';
import { contentId } from '../utils/ids.js';

/** Append-only source field audit. Status transitions also have normal receipts. */
export interface SourceChange {
  id: string;
  schemaVersion: 1;
  provider: 'notion';
  dataSourceId: string;
  pageId: string;
  itemId: string;
  evidenceId: string;
  policyVersion: 1;
  policyHash: string;
  timestamp: string;
  previousChangeId: string | null;
  before: RoadmapItem | null;
  after: RoadmapItem;
}
export function createSourceChange(input: Omit<SourceChange, 'id'>): SourceChange {
  const copy = structuredClone(input);
  return { id: contentId('sc', copy), ...copy };
}
