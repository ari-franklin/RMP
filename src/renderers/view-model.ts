import { selectFormat, type FormatSelection } from '../formats/index.js';
import type {
  Evidence,
  Recommendation,
  Relationship,
  Roadmap,
  RoadmapItem,
} from '../types/index.js';

export interface ProjectedItem extends RoadmapItem {
  scheduleLabel?: string;
}

export interface RoadmapProjection {
  revision: number;
  items: ProjectedItem[];
  relationships: Relationship[];
  evidence: Evidence[];
  recommendations: Recommendation[];
}

export interface RoadmapViewModel {
  title: string;
  schemaVersion: string;
  revision: number;
  format: FormatSelection;
  views: {
    outcome: RoadmapProjection;
    delivery: RoadmapProjection;
    release: RoadmapProjection;
    dependency: RoadmapProjection;
    history: RoadmapProjection;
  };
  validationNeeds: string[];
}

const horizonOrder = { now: 0, next: 1, later: 2 } as const;

function stableItems(items: RoadmapItem[]): RoadmapItem[] {
  return [...items].sort(
    (left, right) =>
      horizonOrder[left.horizon] - horizonOrder[right.horizon] || left.id.localeCompare(right.id),
  );
}

function scheduleLabel(item: RoadmapItem): string | undefined {
  if (item.schedule === undefined || item.schedule.precision === 'none') return undefined;
  if (
    item.schedule.precision === 'exact' &&
    item.commitment === 'committed' &&
    item.schedule.evidenceIds.length > 0
  ) {
    return `Committed: ${item.schedule.date ?? 'date unavailable'}`;
  }
  if (item.schedule.precision === 'window') {
    return `Forecast: ${item.schedule.earliest ?? '?'} to ${item.schedule.latest ?? '?'}`;
  }
  return `Forecast: ${item.schedule.date ?? 'date unavailable'}`;
}

function projection(roadmap: Roadmap, items: RoadmapItem[]): RoadmapProjection {
  return {
    revision: roadmap.revision,
    items: stableItems(items).map((entry) => {
      const label = scheduleLabel(entry);
      return label === undefined ? { ...entry } : { ...entry, scheduleLabel: label };
    }),
    relationships: [...roadmap.relationships].sort((a, b) =>
      `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`),
    ),
    evidence: [...roadmap.evidence].sort((a, b) => a.id.localeCompare(b.id)),
    recommendations: [...roadmap.recommendations].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function buildRoadmapViewModel(roadmap: Roadmap): RoadmapViewModel {
  const releases = roadmap.items.filter((entry) => entry.kind === 'release');
  const format = selectFormat({
    audience: 'team',
    horizon: 'near-term',
    decision: 'sequence-work',
    useCase: releases.length > 0 ? 'release' : 'delivery',
    evidenceStrength: roadmap.evidence.length > 0 ? 'medium' : 'low',
    commitment: releases.some((entry) => entry.commitment === 'committed')
      ? 'committed'
      : 'planned',
    uncertainty: releases.every((entry) => entry.confidence === 'high') ? 'low' : 'medium',
    dependencyCount: roadmap.relationships.filter((entry) => entry.type === 'dependsOn').length,
    schedulePrecision: releases.some((entry) => entry.schedule?.precision === 'exact')
      ? 'exact'
      : 'none',
    hasMeasuredOutcomes: roadmap.items.some(
      (entry) => entry.kind === 'outcome' && entry.signal !== undefined,
    ),
    hasExplicitAlternatives: false,
    hasObservableMilestones: roadmap.items.some((entry) => entry.kind === 'milestone'),
    hasDiscoveryLineage: false,
    hasPortfolioAllocations: false,
    hasPlanningWindows: releases.some((entry) => entry.schedule?.precision === 'window'),
    hasCrossTeamScope: false,
    hasDatedScope: releases.some((entry) => entry.schedule?.precision === 'exact'),
  });
  const outcomes = roadmap.items.filter((entry) => entry.kind === 'outcome');
  const delivery = roadmap.items.filter(
    (entry) => entry.kind === 'deliverable' || entry.kind === 'milestone',
  );
  const all = projection(roadmap, roadmap.items);
  return {
    title: roadmap.title,
    schemaVersion: roadmap.schemaVersion,
    revision: roadmap.revision,
    format,
    views: {
      outcome: projection(roadmap, outcomes),
      delivery: projection(roadmap, delivery),
      release: projection(roadmap, releases),
      dependency: { ...all, items: [] },
      history: { ...all, items: [], relationships: [] },
    },
    validationNeeds: format.missingInputs,
  };
}
