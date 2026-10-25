import { describe, expect, it } from 'vitest';
import { projectNotionWorkflow } from '../../../src/content/project-notion.js';
import type { NotionWorkflowPolicy } from '../../../src/content/notion-policy.js';
import { defaultConfig } from '../../../src/config/index.js';
import { item } from '../core/helpers.js';
import { validateRoadmap } from '../../../src/schemas/index.js';

import { fixture, post, pid, iid, managed, now } from '../../helpers/notion-projection.js';

describe('projectNotionWorkflow', () => {
  it('maps all states, caps Now, orders overflow before curated Next and leaves input untouched', () => {
    const input = fixture(
      [
        post(1, 'drafting'),
        post(2, 'drafting'),
        post(3, 'drafting'),
        post(4, 'outlining'),
        post(5),
        post(6, 'published'),
      ],
      {
        nowSelection: [pid(2)],
        nextCuration: [{ id: pid(4), rank: 1, rationale: 'Editor choice' }],
      },
    );
    const original = structuredClone(input);
    const result = projectNotionWorkflow(input);
    expect(result.valid).toBe(true);
    expect(input).toEqual(original);
    expect(result.nowSelection).toEqual([pid(2), pid(1)]);
    expect(result.nextOrder).toEqual([pid(3), pid(4)]);
    expect(
      result.roadmap.items.map((i) => [
        i.status,
        i.horizon,
        i.extensions['content/workflow']?.stage,
      ]),
    ).toEqual([
      ['active', 'now', 'draft'],
      ['active', 'now', 'draft'],
      ['proposed', 'next', 'draft'],
      ['proposed', 'next', 'idea'],
      ['proposed', 'later', 'idea'],
      ['completed', 'later', 'publish'],
    ]);
    expect(result.journal).toHaveLength(6);
    expect(result.receipts).toEqual([]);
    expect(validateRoadmap(result.roadmap).valid).toBe(true);
  });
  it('replays unchanged snapshots without semantic changes even with a newer fetch time', () => {
    const input = fixture();
    const first = projectNotionWorkflow(input);
    const second = projectNotionWorkflow({
      ...input,
      roadmap: first.roadmap,
      journal: first.journal,
      receipts: first.receipts,
      snapshot: { ...input.snapshot, fetchedAt: '2026-10-20T13:00:00.000Z' },
      health: { ...input.health, lastSuccessfulAt: '2026-10-20T13:00:00.000Z' },
    });
    expect(second.roadmap).toEqual(first.roadmap);
    expect(second.journal).toEqual([]);
    expect(second.receipts).toEqual([]);
    expect(projectNotionWorkflow(input)).toEqual(first);
  });
  it('reprojects selection edits without new source observations and audits active-to-proposed', () => {
    const input = fixture([post(1, 'drafting'), post(2, 'drafting'), post(3, 'drafting')]);
    const first = projectNotionWorkflow(input);
    input.policy.nowSelection = [pid(2), pid(3)];
    first.roadmap.extensions['content/notion-workflow'] = structuredClone(
      input.policy,
    ) as unknown as Record<string, unknown>;
    const second = projectNotionWorkflow({
      ...input,
      roadmap: first.roadmap,
      journal: first.journal,
    });
    expect(second.roadmap.items.find((i) => i.id === iid(1))?.status).toBe('proposed');
    expect(second.receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: iid(1),
          previousStatus: 'active',
          newStatus: 'proposed',
        }),
      ]),
    );
    expect(second.roadmap.evidence).toHaveLength(3);
  });
  it('keeps selected drafts despite newer edits and fills ties by page identity', () => {
    const result = projectNotionWorkflow(
      fixture(
        [post(3, 'drafting', { lastEditedAt: now }), post(2, 'drafting'), post(1, 'drafting')],
        { nowSelection: [pid(2)] },
      ),
    );
    expect(result.nowSelection).toEqual([pid(2), pid(3)]);
  });
  it('preserves local fields, relationships and theme mappings on rename and publication jump', () => {
    const input = fixture([post(1, 'published', { title: 'Renamed', publishDate: '2026-10-19' })], {
      pageToItem: { [pid(1)]: iid(1) },
      pageToThemes: { [pid(1)]: ['del-theme'] },
    });
    input.roadmap.items = [
      managed(1, {
        description: 'Local notes',
        extensions: {
          'content/workflow': { source: 'notion:writing-ideas', localNote: 'keep' },
          'local/custom': { color: 'green' },
        },
      }),
      item({ id: 'del-theme' }),
      item({
        id: 'out-result',
        kind: 'outcome',
        signal: { metric: 'readers', target: 10, unit: 'people' },
        measurements: [],
      }),
    ];
    input.roadmap.relationships = [{ from: iid(1), to: 'del-theme', type: 'delivers' }];
    const result = projectNotionWorkflow(input);
    const updated = result.roadmap.items[0];
    expect(updated).toMatchObject({
      title: 'Renamed',
      status: 'completed',
      description: 'Local notes',
      extensions: { 'local/custom': { color: 'green' }, 'content/workflow': { localNote: 'keep' } },
      schedule: { date: '2026-10-19', precision: 'exact' },
    });
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts[0]).toMatchObject({
      previousStatus: 'proposed',
      newStatus: 'completed',
    });
    expect(result.roadmap.relationships).toEqual(input.roadmap.relationships);
    expect(result.roadmap.items.slice(1)).toEqual(input.roadmap.items.slice(1));
  });
  it.each(['completed', 'cancelled'] as const)(
    'recommends reopening %s without changing published fields',
    (status) => {
      const input = fixture([post(1, 'drafting')], { pageToItem: { [pid(1)]: iid(1) } });
      input.roadmap.items = [managed(1, { status })];
      const result = projectNotionWorkflow(input);
      expect(result.roadmap.items).toEqual(input.roadmap.items);
      expect(result.receipts).toEqual([]);
      expect(result.roadmap.recommendations).toHaveLength(1);
      const replay = projectNotionWorkflow({ ...input, roadmap: result.roadmap });
      expect(replay.roadmap).toEqual(result.roadmap);
    },
  );
  it('preserves missing and archived posts for review', () => {
    const input = fixture(
      [post(1, 'published', { archived: true }), post(3, 'idea', { inTrash: true })],
      { pageToItem: { [pid(1)]: iid(1), [pid(2)]: iid(2), [pid(3)]: iid(3) } },
    );
    input.roadmap.items = [managed(1), managed(2), managed(3)];
    const result = projectNotionWorkflow(input);
    expect(result.roadmap.items).toEqual(input.roadmap.items);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.receipts).toEqual([]);
  });
  it('rejects the entire projection for unknown vocabulary', () => {
    const input = fixture([post(1, 'published'), post(2, 'surprise')]);
    const result = projectNotionWorkflow(input);
    expect(result.valid).toBe(false);
    expect(result.roadmap).toEqual(input.roadmap);
    expect(result.journal).toEqual([]);
  });
  it('maps status by option identity rather than renamed display label', () => {
    expect(
      projectNotionWorkflow(fixture([post(1, 'published', { statusName: 'Shipped' })])).roadmap
        .items[0]?.status,
    ).toBe('completed');
  });
  it('creates unassigned posts without invented theme relationships', () => {
    const result = projectNotionWorkflow(fixture());
    expect(result.roadmap.relationships).toEqual([]);
    expect(result.roadmap.items[0]?.extensions['content/workflow']?.themeIds).toEqual([]);
  });
  it('completes only explicitly mapped publication aliases from a fresh published row', () => {
    const input = fixture([post(1, 'published')], {
      publishedMatches: [{ itemId: 'mil-alias', notionPageId: pid(1), notionTitle: 'Old name' }],
    });
    input.roadmap.items = [item({ id: 'mil-alias', kind: 'milestone', status: 'proposed' })];
    const result = projectNotionWorkflow(input);
    expect(result.roadmap.items.find((i) => i.id === 'mil-alias')?.status).toBe('completed');
    expect(result.receipts).toHaveLength(1);
    const unpublished = fixture([post(1)], { publishedMatches: input.policy.publishedMatches });
    unpublished.roadmap.items = input.roadmap.items;
    expect(
      projectNotionWorkflow(unpublished).roadmap.items.find((i) => i.id === 'mil-alias'),
    ).toEqual(input.roadmap.items[0]);
  });
  it('honors stricter approval policy for creation and changes', () => {
    const input = fixture([post(1, 'published'), post(2)]);
    input.roadmap.items = [managed(1)];
    input.policy.pageToItem[pid(1)] = iid(1);
    input.roadmap.extensions['content/notion-workflow'] = structuredClone(
      input.policy,
    ) as unknown as Record<string, unknown>;
    input.config.authority = { ...defaultConfig.authority, deterministic: 'approval' };
    const result = projectNotionWorkflow(input);
    expect(result.roadmap.items).toEqual(input.roadmap.items);
    expect(result.receipts).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.roadmap.recommendations).toHaveLength(1);
  });
  it.each(['stale', 'hash', 'source', 'policy', 'collision', 'ownership', 'theme'] as const)(
    'rejects %s boundary violations atomically',
    (kind) => {
      const input = fixture();
      if (kind === 'stale') Object.assign(input.health, { state: 'stale' });
      if (kind === 'hash') input.snapshot.contentHash = 'wrong';
      if (kind === 'source') input.snapshot.dataSourceId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      if (kind === 'policy') input.policy.nowLimit = 3 as 2;
      if (kind === 'collision') input.roadmap.items = [item({ id: iid(1), kind: 'milestone' })];
      if (kind === 'ownership') {
        input.policy.pageToItem[pid(1)] = 'del-cli';
        input.roadmap.items = [item()];
      }
      if (kind === 'theme') input.policy.pageToThemes[pid(1)] = ['del-missing'];
      if (kind !== 'policy')
        input.roadmap.extensions['content/notion-workflow'] = structuredClone(
          input.policy,
        ) as unknown as Record<string, unknown>;
      const result = projectNotionWorkflow(input);
      expect(result.valid).toBe(false);
      expect(result.roadmap).toEqual(input.roadmap);
    },
  );
  it('keeps append-only journal records distinct for repeated edits and retains legacy evidence', () => {
    const input = fixture();
    const first = projectNotionWorkflow(input);
    const secondInput = fixture([post(1, 'idea', { title: 'New title', lastEditedAt: now })]);
    const second = projectNotionWorkflow({
      ...secondInput,
      roadmap: first.roadmap,
      journal: first.journal,
    });
    const third = projectNotionWorkflow({
      ...input,
      roadmap: second.roadmap,
      journal: [...first.journal, ...second.journal],
    });
    expect(
      new Set([...first.journal, ...second.journal, ...third.journal].map((j) => j.id)).size,
    ).toBe(3);
    expect(third.roadmap.evidence).toHaveLength(2);
    expect(first.journal[0]?.after.title).toBe('Post 1');
  });
});

describe('projection continuity and core boundaries', () => {
  it('persists filled selections so a newly edited overflow draft cannot displace them', () => {
    const input = fixture([post(1, 'drafting'), post(2, 'drafting'), post(3, 'drafting')]);
    const first = projectNotionWorkflow(input);
    const persisted = first.roadmap.extensions[
      'content/notion-workflow'
    ] as unknown as NotionWorkflowPolicy;
    expect(persisted.nowSelection).toEqual([pid(1), pid(2)]);
    const next = fixture(
      [post(1, 'drafting'), post(2, 'drafting'), post(3, 'drafting', { lastEditedAt: now })],
      persisted,
    );
    const second = projectNotionWorkflow({
      ...next,
      roadmap: first.roadmap,
      journal: first.journal,
    });
    expect(second.nowSelection).toEqual([pid(1), pid(2)]);
  });
  it('reserves the Now slot of a missing or archived selected post pending review', () => {
    const input = fixture([post(1, 'drafting'), post(2, 'drafting'), post(3, 'drafting')]);
    const first = projectNotionWorkflow(input);
    const policy = first.roadmap.extensions[
      'content/notion-workflow'
    ] as unknown as NotionWorkflowPolicy;
    const next = fixture([post(2, 'drafting'), post(3, 'drafting')], policy);
    const result = projectNotionWorkflow({ ...next, roadmap: first.roadmap });
    expect(result.roadmap.items.filter((i) => i.horizon === 'now')).toHaveLength(2);
    expect(result.diagnostics.some((d) => d.includes(pid(1)))).toBe(true);
  });
  it('clears removed provider metadata but preserves local metadata and date without new publication date', () => {
    const input = fixture([
      post(1, 'published', {
        type: ['Essay'],
        blog: 'Main',
        series: ['Writing'],
        publishDate: '2026-10-19',
      }),
    ]);
    const first = projectNotionWorkflow(input);
    const next = fixture([post(1, 'published')]);
    const result = projectNotionWorkflow({ ...next, roadmap: first.roadmap });
    expect(result.roadmap.items[0]?.extensions['content/workflow']?.type).toBeUndefined();
    expect(result.roadmap.items[0]?.extensions['content/workflow']?.blog).toBeUndefined();
    expect(result.roadmap.items[0]?.extensions['content/workflow']?.notionSeries).toBeUndefined();
    expect(result.roadmap.items[0]?.schedule).toEqual(first.roadmap.items[0]?.schedule);
  });
});

describe('projection preservation details', () => {
  it('assigns a new post only to explicitly configured themes and retains alias curation', () => {
    const input = fixture([post(1)], {
      pageToThemes: { [pid(1)]: ['del-theme'] },
      completedAliases: [{ pageId: pid(1), completedAs: 'Earlier essay' }],
    });
    input.roadmap.items = [item({ id: 'del-theme' })];
    const result = projectNotionWorkflow(input);
    expect(result.valid).toBe(true);
    expect(result.roadmap.relationships).toEqual([
      { from: iid(1), to: 'del-theme', type: 'delivers' },
    ]);
    expect(result.roadmap.extensions['content/notion-workflow']?.completedAliases).toEqual(
      input.policy.completedAliases,
    );
    expect(result.roadmap.items.find((i) => i.id === iid(1))?.status).toBe('proposed');
  });
  it('returns detached observations and metadata that cannot mutate the supplied snapshot', () => {
    const input = fixture([post(1, 'idea', { type: ['Essay'] })]);
    const original = structuredClone(input);
    const result = projectNotionWorkflow(input);
    const types = result.roadmap.items[0]?.extensions['content/workflow']?.type as string[];
    types.push('Changed');
    expect(input).toEqual(original);
  });
  it('reports schema-compatible ownership conflicts without touching unrelated source data', () => {
    const input = fixture([post(1, 'published')], { pageToItem: { [pid(1)]: iid(1) } });
    input.roadmap.items = [
      managed(1, {
        extensions: {
          'content/workflow': { source: 'notion:writing-ideas', dataSourceId: 'another-source' },
        },
      }),
    ];
    const result = projectNotionWorkflow(input);
    expect(result.roadmap.items).toEqual(input.roadmap.items);
    expect(result.receipts).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('audit chronology', () => {
  it('rejects a generation earlier than its accepted source journal', () => {
    const input = fixture();
    const first = projectNotionWorkflow(input);
    const next = fixture([post(1, 'published')]);
    const result = projectNotionWorkflow({
      ...next,
      roadmap: first.roadmap,
      journal: first.journal,
      now: '2026-10-19T12:00:00.000Z',
    });
    expect(result.valid).toBe(false);
    expect(result.roadmap).toEqual(first.roadmap);
    expect(result.receipts).toEqual([]);
  });
  it('rejects invalid audit timestamps even for creation without a transition receipt', () => {
    const input = fixture();
    const result = projectNotionWorkflow({ ...input, now: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.journal).toEqual([]);
  });
});
