import type { Evidence, Roadmap, RoadmapItem, RoadmapStatus } from '../types/index.js';

export type MatchKind = 'explicit' | 'source-link' | 'ambiguous' | 'fuzzy' | 'unmatched';

export interface EvidenceIntent {
  itemId?: string;
  sourceLinks: string[];
  title?: string;
  proposedStatus?: RoadmapStatus;
  measurement?: {
    value: number;
    successful: boolean;
  };
}

export interface EvidenceMatch {
  evidenceId: string;
  kind: MatchKind;
  itemIds: string[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function evidenceIntent(evidence: Evidence): EvidenceIntent {
  const extension = record(evidence.extensions['rmp.dev/transition']) ?? {};
  const measurement = record(extension.measurement);
  const proposedStatus = extension.proposedStatus;

  return {
    ...(typeof extension.itemId === 'string' ? { itemId: extension.itemId } : {}),
    sourceLinks: strings(extension.sourceLinks),
    ...(typeof extension.title === 'string' ? { title: extension.title } : {}),
    ...(isRoadmapStatus(proposedStatus) ? { proposedStatus } : {}),
    ...(typeof measurement?.value === 'number' && typeof measurement.successful === 'boolean'
      ? { measurement: { value: measurement.value, successful: measurement.successful } }
      : {}),
  };
}

function isRoadmapStatus(value: unknown): value is RoadmapStatus {
  return ['proposed', 'active', 'blocked', 'completed', 'cancelled'].includes(String(value));
}

function itemSourceLinks(item: RoadmapItem): string[] {
  return strings(record(item.extensions['rmp.dev/source'])?.links);
}

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function similarity(left: string, right: string): number {
  const leftWords = words(left);
  const rightWords = words(right);
  const union = new Set([...leftWords, ...rightWords]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const word of leftWords) if (rightWords.has(word)) intersection += 1;
  return intersection / union.size;
}

export function matchEvidence(roadmap: Roadmap, evidence: Evidence): EvidenceMatch {
  const intent = evidenceIntent(evidence);
  if (intent.itemId && roadmap.items.some((item) => item.id === intent.itemId)) {
    return { evidenceId: evidence.id, kind: 'explicit', itemIds: [intent.itemId] };
  }

  const linked = roadmap.items
    .filter((item) => itemSourceLinks(item).some((link) => intent.sourceLinks.includes(link)))
    .map((item) => item.id)
    .sort();
  if (linked.length === 1) return { evidenceId: evidence.id, kind: 'source-link', itemIds: linked };
  if (linked.length > 1) return { evidenceId: evidence.id, kind: 'ambiguous', itemIds: linked };

  if (intent.title) {
    const fuzzy = roadmap.items
      .map((item) => ({ id: item.id, score: similarity(item.title, intent.title ?? '') }))
      .filter((candidate) => candidate.score >= 0.5)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    if (fuzzy.length > 0) {
      const bestScore = fuzzy[0]?.score;
      return {
        evidenceId: evidence.id,
        kind:
          fuzzy.filter((candidate) => candidate.score === bestScore).length > 1
            ? 'ambiguous'
            : 'fuzzy',
        itemIds: fuzzy
          .filter((candidate) => candidate.score === bestScore)
          .map((candidate) => candidate.id),
      };
    }
  }

  return { evidenceId: evidence.id, kind: 'unmatched', itemIds: [] };
}
