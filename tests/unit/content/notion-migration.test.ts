import { describe, expect, it, vi } from 'vitest';
import {
  previewNotionMigration,
  type NotionMigrationInput,
} from '../../../src/content/notion-policy.js';

const sourceId = '11111111-1111-4111-8111-111111111111';
const a = '22222222222242228222222222222222';
const b = '33333333333343338333333333333333';
function fixture(): NotionMigrationInput {
  return {
    config: {
      views: { default: 'delivery' },
      extensions: {
        'content/notion': { statusProperty: 'Status' },
        'custom/view': { layout: 'compact' },
      },
    },
    dataSourceSchema: {
      id: sourceId,
      properties: {
        Name: { id: 'title', name: 'Name', type: 'title' },
        Status: {
          id: 'status-id',
          name: 'Status',
          type: 'status',
          status: {
            options: ['drafting', 'outlining', 'idea', 'published'].map((name) => ({
              id: `option-${name}`,
              name,
            })),
          },
        },
      },
    },
    legacySource: {
      dataSourceUrl: `collection://${sourceId}`,
      nowLimit: 2,
      nowSelection: [a],
      nextCuration: [{ id: b, rank: 1, rationale: 'Keep priority' }],
      laterClusters: [{ name: 'Ideas', ids: [b] }],
      publishedMatches: [{ itemId: 'mil-local', notionPageId: b, notionTitle: 'Alias' }],
      snapshot: [
        { id: a, name: 'Draft', status: 'drafting' },
        { id: b, name: 'Idea', status: 'idea', completedAs: 'Successor', completedAsPageId: a },
      ],
      customMetadata: { keep: true },
    },
    roadmap: {
      schemaVersion: '1.0.0',
      revision: 7,
      title: 'Synthetic',
      items: [
        {
          id: `mil-notion-${a}`,
          kind: 'milestone',
          title: 'Draft',
          status: 'active',
          horizon: 'now',
          commitment: 'planned',
          confidence: 'medium',
          extensions: {
            'content/workflow': { source: 'notion:writing-ideas', series: 'del-theme' },
            'custom/view': { color: 'green' },
          },
        },
        {
          id: 'del-theme',
          kind: 'deliverable',
          title: 'Theme',
          status: 'active',
          horizon: 'now',
          commitment: 'planned',
          confidence: 'medium',
          extensions: {},
        },
        {
          id: 'mil-local',
          kind: 'milestone',
          title: 'Local',
          status: 'proposed',
          horizon: 'next',
          commitment: 'planned',
          confidence: 'medium',
          extensions: {},
        },
      ],
      relationships: [{ from: `mil-notion-${a}`, to: 'del-theme', type: 'delivers' }],
      evidence: [],
      recommendations: [],
      extensions: { 'custom/view': { enabled: true } },
    },
  };
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Required test fixture value is missing');
  return value;
}
function legacy(input: NotionMigrationInput) {
  return input.legacySource as Record<string, unknown>;
}
function schema(input: NotionMigrationInput) {
  return input.dataSourceSchema as {
    id: string;
    properties: Record<string, Record<string, unknown>>;
  };
}
describe('Notion migration preview', () => {
  it('preserves identity, curation, aliases and theme links without changing inputs', () => {
    const input = fixture();
    const before = structuredClone(input);
    const result = previewNotionMigration(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.provider).toMatchObject({
      dataSourceId: sourceId,
      titlePropertyId: 'title',
      statusPropertyId: 'status-id',
    });
    expect(result.policy).toMatchObject({
      nowLimit: 2,
      nowSelection: [a],
      nextCuration: legacy(input).nextCuration,
      laterClusters: legacy(input).laterClusters,
      publishedMatches: legacy(input).publishedMatches,
      completedAliases: [{ pageId: b, completedAs: 'Successor', completedAsPageId: a }],
      pageToItem: { [a]: `mil-notion-${a}`, [b]: `mil-notion-${b}` },
      pageToThemes: { [a]: ['del-theme'], [b]: [] },
      statusOptions: { 'option-drafting': 'drafting', 'option-published': 'published' },
    });
    expect(result.config.views.default).toBe('delivery');
    expect(result.config.extensions['custom/view']).toEqual({ layout: 'compact' });
    expect(result.config.adapters.enabled).toEqual(['local', 'git']);
    expect(result.preservedRoadmap).toEqual(input.roadmap);
    expect(result.preservedSource).toEqual(input.legacySource);
    result.policy.nowSelection.push(b);
    required(result.preservedRoadmap.items[0]).title = 'Changed preview';
    expect(input).toEqual(before);
  });
  it('binds select statuses and explicit renamed property names', () => {
    const input = fixture();
    const status = required(schema(input).properties.Status);
    status.type = 'select';
    status.select = status.status;
    delete status.status;
    status.name = 'Editorial state';
    input.propertyNames = { status: 'Editorial state', publishDate: 'Published on' };
    schema(input).properties.Date = { id: 'date-id', name: 'Published on', type: 'date' };
    const result = previewNotionMigration(input);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.provider.publishDatePropertyId).toBe('date-id');
  });
  it.each([
    'missing-title',
    'duplicate-title',
    'wrong-status-type',
    'missing-option',
    'unknown-option',
    'duplicate-option',
    'duplicate-property-id',
    'wrong-source',
    'invalid-source-id',
    'missing-optional',
  ])('blocks unsafe schema binding: %s', (scenario) => {
    const input = fixture();
    const s = schema(input);
    if (scenario === 'missing-title') delete s.properties.Name;
    if (scenario === 'duplicate-title')
      s.properties.Other = { id: 'other', name: 'Name', type: 'title' };
    if (scenario === 'wrong-status-type') required(s.properties.Status).type = 'rich_text';
    if (scenario === 'duplicate-property-id')
      s.properties.Other = { id: 'title', name: 'Other', type: 'date' };
    if (scenario === 'wrong-source') s.id = '44444444-4444-4444-8444-444444444444';
    if (scenario === 'invalid-source-id') s.id = 'secret-invalid-source';
    if (scenario === 'missing-optional') input.propertyNames = { type: 'Absent' };
    const options = (
      required(s.properties.Status).status as { options: Array<{ id: string; name: string }> }
    ).options;
    if (scenario === 'missing-option') options.pop();
    if (scenario === 'unknown-option') options.push({ id: 'unknown', name: 'review' });
    if (scenario === 'duplicate-option') options.push({ id: 'duplicate', name: 'drafting' });
    expect(previewNotionMigration(input).valid).toBe(false);
  });
  it.each([
    'duplicate-page',
    'invalid-page',
    'unknown-selection',
    'too-many-selected',
    'wrong-limit',
    'unknown-status',
    'bad-curation',
    'bad-alias',
    'identity-collision',
  ])('rejects ambiguous legacy mapping: %s', (scenario) => {
    const input = fixture();
    const l = legacy(input);
    const posts = l.snapshot as Array<Record<string, unknown>>;
    if (scenario === 'duplicate-page') posts.push({ ...posts[0] });
    if (scenario === 'invalid-page') required(posts[0]).id = 'secret-invalid-id';
    if (scenario === 'unknown-selection') l.nowSelection = ['44444444444444448444444444444444'];
    if (scenario === 'too-many-selected') l.nowSelection = [a, b, a];
    if (scenario === 'wrong-limit') l.nowLimit = 3;
    if (scenario === 'unknown-status') required(posts[0]).status = 'review';
    if (scenario === 'bad-curation') l.nextCuration = [{ id: b, rank: 0, rationale: 'Bad rank' }];
    if (scenario === 'bad-alias')
      l.publishedMatches = [{ itemId: 'mil-missing', notionPageId: b, notionTitle: 'Alias' }];
    if (scenario === 'identity-collision') required(input.roadmap.items[0]).extensions = {};
    expect(previewNotionMigration(input).valid).toBe(false);
  });
  it('never calls the network or exposes raw invalid values in diagnostics', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'));
    try {
      const input = fixture();
      input.config = { adapters: { notion: { token: 'secret-sentinel' } } };
      const result = previewNotionMigration(input);
      expect(result.valid).toBe(false);
      expect(JSON.stringify(result)).not.toContain('secret-sentinel');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});

it('previews the approved workflow rules without applying status changes', () => {
  const input = fixture();
  const result = previewNotionMigration(input);
  expect(result.valid).toBe(true);
  if (!result.valid) return;
  expect(result.policy).toHaveProperty('statusMapping', {
    drafting: { horizon: 'now', roadmapStatus: 'active', stage: 'draft' },
    outlining: { horizon: 'next', roadmapStatus: 'proposed', stage: 'idea' },
    idea: { horizon: 'later', roadmapStatus: 'proposed', stage: 'idea' },
    published: { horizon: 'later', roadmapStatus: 'completed', stage: 'publish' },
  });
  expect(result.policy).toHaveProperty('draftingOverflow', {
    horizon: 'next',
    roadmapStatus: 'proposed',
    stage: 'draft',
  });
  expect(result.preservedRoadmap.revision).toBe(7);
});
it.each(['changed-mapping', 'duplicate-curation', 'duplicate-cluster', 'selected-nondraft'])(
  'blocks a policy that would silently change curation: %s',
  (scenario) => {
    const input = fixture();
    const l = legacy(input);
    if (scenario === 'changed-mapping') l.statusMapping = { drafting: { horizon: 'later' } };
    if (scenario === 'duplicate-curation')
      l.nextCuration = [
        { id: b, rank: 1, rationale: 'A' },
        { id: b, rank: 2, rationale: 'B' },
      ];
    if (scenario === 'duplicate-cluster')
      l.laterClusters = [
        { name: 'A', ids: [b] },
        { name: 'B', ids: [b] },
      ];
    if (scenario === 'selected-nondraft') l.nowSelection = [b];
    expect(previewNotionMigration(input).valid).toBe(false);
  },
);
