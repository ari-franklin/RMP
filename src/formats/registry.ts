import type { FormatDefinition, RoadmapFormat } from './types.js';

export const formatRegistry: Readonly<Record<RoadmapFormat, FormatDefinition>> = {
  'outcome-lanes': {
    id: 'outcome-lanes',
    label: 'Outcome lanes',
    rationale: 'Measured outcomes are the primary organizing frame.',
  },
  'now-next-later': {
    id: 'now-next-later',
    label: 'Now / Next / Later',
    rationale: 'Horizon clarity is useful without unsupported date precision.',
  },
  'strategy-choice': {
    id: 'strategy-choice',
    label: 'Strategy choice matrix',
    rationale: 'Explicit alternatives need a visible decision frame.',
  },
  milestones: {
    id: 'milestones',
    label: 'Milestones and markers',
    rationale: 'Observable markers communicate meaningful progress.',
  },
  'opportunity-tree': {
    id: 'opportunity-tree',
    label: 'Opportunity / solution tree',
    rationale: 'Discovery lineage connects opportunities to candidate solutions.',
  },
  'portfolio-bets': {
    id: 'portfolio-bets',
    label: 'Portfolio bets grid',
    rationale: 'Investment allocations need comparison across bets.',
  },
  'quarterly-lanes': {
    id: 'quarterly-lanes',
    label: 'Quarterly lanes',
    rationale: 'Supported planning windows justify time-boxed lanes.',
  },
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard summary',
    rationale: 'Cross-team visibility benefits from a compact summary.',
  },
  'gantt-release': {
    id: 'gantt-release',
    label: 'Gantt-like release view',
    rationale: 'Dated scope and dependencies support a precise release sequence.',
  },
};

export function formatLabel(format: RoadmapFormat): string {
  return formatRegistry[format].label;
}
