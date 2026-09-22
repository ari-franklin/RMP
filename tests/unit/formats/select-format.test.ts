import { describe, expect, it } from 'vitest';

import { selectFormat, type FormatSelectionInput } from '../../../src/formats/index.js';

const baseInput: FormatSelectionInput = {
  audience: 'team',
  horizon: 'near-term',
  decision: 'sequence-work',
  useCase: 'delivery',
  evidenceStrength: 'medium',
  commitment: 'planned',
  uncertainty: 'medium',
  dependencyCount: 0,
  schedulePrecision: 'none',
  hasMeasuredOutcomes: false,
  hasExplicitAlternatives: false,
  hasObservableMilestones: false,
  hasDiscoveryLineage: false,
  hasPortfolioAllocations: false,
  hasPlanningWindows: false,
  hasCrossTeamScope: false,
  hasDatedScope: false,
};

describe('selectFormat', () => {
  it.each([
    ['outcome-lanes', { useCase: 'outcomes', hasMeasuredOutcomes: true }],
    ['now-next-later', { decision: 'sequence-work', useCase: 'delivery' }],
    ['strategy-choice', { decision: 'choose-strategy', hasExplicitAlternatives: true }],
    ['milestones', { useCase: 'milestones', hasObservableMilestones: true }],
    ['opportunity-tree', { useCase: 'discovery', hasDiscoveryLineage: true }],
    ['portfolio-bets', { decision: 'allocate-investment', hasPortfolioAllocations: true }],
    ['quarterly-lanes', { horizon: 'annual', hasPlanningWindows: true }],
    ['dashboard', { audience: 'executive', hasCrossTeamScope: true }],
    [
      'gantt-release',
      {
        useCase: 'release',
        commitment: 'committed',
        uncertainty: 'low',
        dependencyCount: 2,
        schedulePrecision: 'exact',
        hasDatedScope: true,
      },
    ],
  ] as const)('selects %s when its required inputs are supported', (format, overrides) => {
    const result = selectFormat({ ...baseInput, ...overrides });

    expect(result.selected).toBe(format);
    expect(result.rationale).not.toHaveLength(0);
    expect(result.missingInputs).toEqual([]);
  });

  it('reports missing inputs and falls back without inventing schedule precision', () => {
    const result = selectFormat({ ...baseInput, useCase: 'release' });

    expect(result.selected).toBe('now-next-later');
    expect(result.fallback).toBe('now-next-later');
    expect(result.missingInputs).toEqual(
      expect.arrayContaining(['exact schedule precision', 'dated release scope', 'dependencies']),
    );
  });

  it('honors a pinned format when its integrity requirements are met', () => {
    const result = selectFormat({ ...baseInput, pinnedFormat: 'milestones' });

    expect(result.selected).toBe('milestones');
    expect(result.pinned).toBe(true);
  });

  it('rejects an unsafe pinned Gantt view and explains the fallback', () => {
    const result = selectFormat({ ...baseInput, pinnedFormat: 'gantt-release' });

    expect(result.selected).toBe('now-next-later');
    expect(result.pinned).toBe(false);
    expect(result.missingInputs).toContain('exact schedule precision');
    expect(result.rationale).toContain('integrity');
  });
});
