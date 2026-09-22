import { formatLabel } from '../formats/index.js';
import type { Roadmap } from '../types/index.js';
import { buildRoadmapViewModel, type ProjectedItem } from './view-model.js';

function itemLine(item: ProjectedItem): string {
  const schedule = item.scheduleLabel === undefined ? '' : `; ${item.scheduleLabel}`;
  return `- **${item.title}** (${item.status}; ${item.confidence} confidence${schedule})`;
}

function section(title: string, items: ProjectedItem[], empty: string): string[] {
  return [`## ${title}`, '', ...(items.length === 0 ? [empty] : items.map(itemLine)), ''];
}

export function renderMarkdown(roadmap: Roadmap): string {
  const model = buildRoadmapViewModel(roadmap);
  const currentDelivery = model.views.delivery.items.filter(
    (item) => item.horizon !== 'later' || item.commitment !== 'exploratory',
  );
  const blockers = currentDelivery.filter((item) => item.status === 'blocked');
  const lines = [
    `# ${model.title}`,
    '',
    `Revision: ${String(model.revision)} | Schema: ${model.schemaVersion}`,
    `Selected format: ${formatLabel(model.format.selected)}`,
    `Rationale: ${model.format.rationale}`,
    '',
    ...section('Strategic anchor', model.views.outcome.items, 'No measurable outcome is defined.'),
    ...section('Current focus', currentDelivery, 'No current delivery work is defined.'),
    ...section('Outcomes', model.views.outcome.items, 'No outcomes are defined.'),
    ...section('Releases', model.views.release.items, 'No releases are defined.'),
    ...section('Blockers', blockers, 'No blockers are recorded.'),
    '## Recommendations',
    '',
    ...(roadmap.recommendations.length === 0
      ? ['No open recommendations.']
      : roadmap.recommendations
          .filter((entry) => entry.status === 'open')
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((entry) => `- ${entry.rationale} (${entry.confidence} confidence)`)),
    '',
    '## Evidence',
    '',
    ...(roadmap.evidence.length === 0
      ? ['No evidence is recorded.']
      : [...roadmap.evidence]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((entry) => `- ${entry.summary} (${entry.class}; ${entry.source})`)),
    '',
    '## Validation needs',
    '',
    ...(model.validationNeeds.length === 0
      ? ['No format-specific validation gaps.']
      : model.validationNeeds.map((need) => `- ${need}`)),
    '',
  ];
  return `${lines.join('\n')}\n`;
}
