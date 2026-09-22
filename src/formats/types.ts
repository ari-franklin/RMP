export type RoadmapFormat =
  | 'outcome-lanes'
  | 'now-next-later'
  | 'strategy-choice'
  | 'milestones'
  | 'opportunity-tree'
  | 'portfolio-bets'
  | 'quarterly-lanes'
  | 'dashboard'
  | 'gantt-release';

export interface FormatSelectionInput {
  audience: 'team' | 'leadership' | 'executive';
  horizon: 'near-term' | 'annual' | 'multi-year';
  decision: 'measure-outcomes' | 'sequence-work' | 'choose-strategy' | 'allocate-investment';
  useCase: 'outcomes' | 'delivery' | 'release' | 'milestones' | 'discovery' | 'portfolio';
  evidenceStrength: 'low' | 'medium' | 'high';
  commitment: 'exploratory' | 'planned' | 'committed';
  uncertainty: 'low' | 'medium' | 'high';
  dependencyCount: number;
  schedulePrecision: 'none' | 'window' | 'exact';
  hasMeasuredOutcomes: boolean;
  hasExplicitAlternatives: boolean;
  hasObservableMilestones: boolean;
  hasDiscoveryLineage: boolean;
  hasPortfolioAllocations: boolean;
  hasPlanningWindows: boolean;
  hasCrossTeamScope: boolean;
  hasDatedScope: boolean;
  pinnedFormat?: RoadmapFormat;
}

export interface FormatSelection {
  selected: RoadmapFormat;
  rationale: string;
  missingInputs: string[];
  fallback: RoadmapFormat;
  pinned: boolean;
}

export interface FormatDefinition {
  id: RoadmapFormat;
  label: string;
  rationale: string;
}
