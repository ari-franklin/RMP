import { formatRegistry } from './registry.js';
import type { FormatSelection, FormatSelectionInput, RoadmapFormat } from './types.js';

const safeFallback: RoadmapFormat = 'now-next-later';

function ganttMissingInputs(input: FormatSelectionInput): string[] {
  const missing: string[] = [];
  if (input.schedulePrecision !== 'exact') missing.push('exact schedule precision');
  if (!input.hasDatedScope) missing.push('dated release scope');
  if (input.dependencyCount === 0) missing.push('dependencies');
  if (input.commitment !== 'committed') missing.push('committed scope');
  if (input.uncertainty !== 'low') missing.push('low uncertainty');
  return missing;
}

function automaticFormat(input: FormatSelectionInput): RoadmapFormat {
  if (input.useCase === 'release' && ganttMissingInputs(input).length === 0) return 'gantt-release';
  if (input.hasExplicitAlternatives && input.decision === 'choose-strategy')
    return 'strategy-choice';
  if (input.hasPortfolioAllocations && input.decision === 'allocate-investment') {
    return 'portfolio-bets';
  }
  if (input.hasDiscoveryLineage && input.useCase === 'discovery') return 'opportunity-tree';
  if (input.hasMeasuredOutcomes && input.useCase === 'outcomes') return 'outcome-lanes';
  if (input.hasObservableMilestones && input.useCase === 'milestones') return 'milestones';
  if (input.hasPlanningWindows && input.horizon === 'annual') return 'quarterly-lanes';
  if (input.hasCrossTeamScope && input.audience === 'executive') return 'dashboard';
  return safeFallback;
}

export function selectFormat(input: FormatSelectionInput): FormatSelection {
  if (input.pinnedFormat !== undefined) {
    const missing = input.pinnedFormat === 'gantt-release' ? ganttMissingInputs(input) : [];
    if (missing.length === 0) {
      return {
        selected: input.pinnedFormat,
        rationale: `Pinned format honored. ${formatRegistry[input.pinnedFormat].rationale}`,
        missingInputs: [],
        fallback: safeFallback,
        pinned: true,
      };
    }
    return {
      selected: safeFallback,
      rationale:
        'Pinned format would violate integrity by implying unsupported schedule precision.',
      missingInputs: missing,
      fallback: safeFallback,
      pinned: false,
    };
  }

  const selected = automaticFormat(input);
  const missingInputs =
    input.useCase === 'release' && selected !== 'gantt-release' ? ganttMissingInputs(input) : [];
  return {
    selected,
    rationale: formatRegistry[selected].rationale,
    missingInputs,
    fallback: safeFallback,
    pinned: false,
  };
}
