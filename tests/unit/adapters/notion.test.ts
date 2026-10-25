import { expect, it, vi } from 'vitest';
import { collectNotionSource } from '../../../src/adapters/notion.js';
import {
  batch,
  config,
  json,
  page,
  pageId,
  schema,
  token,
  transport,
} from '../../helpers/notion-transport.js';
const run = (
  responses: Response[],
  overrides: Partial<Parameters<typeof collectNotionSource>[0]> = {},
) =>
  collectNotionSource({
    config,
    enabled: true,
    environment: () => token,
    transport: transport(responses),
    ...overrides,
  });
it('collects sorted complete pages and stable immutable evidence, ignoring external URLs', async () => {
  const second = {
    ...page(),
    id: '33333333-3333-4333-8333-333333333333',
    archived: true,
    in_trash: true,
  };
  const t = transport([json(schema()), json(batch([second], 'opaque')), json(batch([page()]))]);
  const result = await run([], { transport: t, statusOptionIds: ['draft', 'done'] });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.collection.snapshot.posts.map((p) => p.pageId)).toEqual([
    pageId.replaceAll('-', ''),
    second.id.replaceAll('-', ''),
  ]);
  expect(result.collection.snapshot.posts[1]).toMatchObject({ archived: true, inTrash: true });
  expect(result.collection.evidence).toHaveLength(2);
  expect(result.collection.evidence[0]).toMatchObject({
    itemRefs: [],
    observedAt: '2026-10-19T10:00:00.000Z',
  });
  expect(JSON.stringify(result)).not.toContain('attacker');
  expect(JSON.stringify(result)).not.toContain(token);
  expect(t.fetch).toHaveBeenCalledTimes(3);
  const repeat = await run([json(schema()), json(batch([page(), second]))]);
  expect(repeat.ok).toBe(true);
  if (repeat.ok)
    expect(repeat.collection).toMatchObject({
      snapshot: { contentHash: result.collection.snapshot.contentHash },
      evidence: result.collection.evidence,
    });
});
it.each([{ enabled: false }, { offline: true }])(
  'avoids credentials and network when disabled/offline: %j',
  async (flags) => {
    const env = vi.fn(() => token);
    const t = transport([]);
    const result = await run([], { ...flags, environment: env, transport: t });
    expect(result.ok).toBe(false);
    expect(env).not.toHaveBeenCalled();
    expect(t.fetch).not.toHaveBeenCalled();
  },
);
it('uses fixed credential precedence and never emits a transport exception', async () => {
  const env = vi.fn((name: string) => (name === 'NOTION_TOKEN' ? token : undefined));
  const t = transport([new Error(token), new Error(token), new Error(token)]);
  const result = await run([], { environment: env, transport: t });
  expect(env.mock.calls.flat()).toEqual(['RMP_NOTION_TOKEN', 'NOTION_TOKEN']);
  expect(JSON.stringify(result)).not.toContain(token);
  expect(result).not.toHaveProperty('collection');
  expect(result.health.errorCode).toBe('transport');
});
it('fails safely when credentials are missing', async () => {
  const t = transport([]);
  const result = await run([], { environment: () => undefined, transport: t });
  expect(result.health.errorCode).toBe('auth');
  expect(t.fetch).not.toHaveBeenCalled();
});
it.each([
  'incomplete',
  'missing-cursor',
  'cursor-cycle',
  'wrong-parent',
  'wrong-type',
  'null-status',
  'unknown-option',
  'bad-date',
  'long-title',
  'duplicate-conflict',
  'schema-type',
  'schema-missing',
  'schema-option',
  'wrong-source',
  'invalid-id',
])('rejects the entire collection: %s', async (scenario) => {
  const s = schema();
  const p = page();
  let responses: Response[] = [];
  if (scenario === 'wrong-parent') p.parent.data_source_id = '44444444-4444-4444-8444-444444444444';
  if (scenario === 'wrong-type') p.properties.RenamedTitle.type = 'rich_text';
  if (scenario === 'null-status') Object.assign(p.properties.RenamedStatus, { status: null });
  if (scenario === 'unknown-option') p.properties.RenamedStatus.status.id = 'unknown';
  if (scenario === 'bad-date') p.last_edited_time = 'yesterday';
  if (scenario === 'long-title')
    p.properties.RenamedTitle.title = [{ plain_text: 'x'.repeat(501) }];
  if (scenario === 'invalid-id') p.id = 'https://attacker.invalid';
  if (scenario === 'schema-type') s.properties.RenamedStatus.type = 'rich_text';
  if (scenario === 'schema-missing') s.properties.RenamedStatus.id = 'missing';
  if (scenario === 'schema-option') s.properties.RenamedStatus.status.options.pop();
  if (scenario === 'wrong-source') s.id = '44444444-4444-4444-8444-444444444444';
  const b = batch([p]);
  if (scenario === 'incomplete') Object.assign(b, { request_status: { type: 'incomplete' } });
  if (scenario === 'missing-cursor') b.has_more = true;
  responses = [json(s), json(b)];
  if (scenario === 'cursor-cycle')
    responses = [json(s), json(batch([p], 'repeat')), json(batch([], 'repeat'))];
  if (scenario === 'duplicate-conflict')
    responses = [
      json(s),
      json(batch([p], 'next')),
      json(batch([{ ...p, last_edited_time: '2026-10-20T10:00:00Z' }])),
    ];
  const result = await run(responses, { statusOptionIds: ['draft', 'done'] });
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('collection');
});
it('discards prior pages after a late failure and respects page caps', async () => {
  for (const responses of [
    [json(schema()), json(batch([page()], 'next')), new Response(token, { status: 403 })],
    [json(schema()), json(batch([page()], 'next'))],
  ]) {
    const result = await run(responses, {
      config: { ...config, maxPages: responses.length === 2 ? 1 : 20 },
    });
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('collection');
  }
});
it('accepts unchanged duplicates and renamed status labels by stable identity', async () => {
  const p = page();
  const s = schema();
  s.properties.RenamedStatus.status.options[0] = { id: 'draft', name: 'Writing' };
  p.properties.RenamedStatus.status.name = 'Writing';
  const result = await run([json(s), json(batch([p, p]))]);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.collection.snapshot.posts).toHaveLength(1);
});
it('normalizes only configured optional metadata', async () => {
  const s = schema();
  Object.assign(s.properties, {
    Date: { id: 'date', type: 'date' },
    Type: { id: 'type', type: 'multi_select' },
    Blog: { id: 'blog', type: 'select' },
    Series: { id: 'series', type: 'multi_select' },
  });
  const p = page();
  Object.assign(p.properties, {
    Date: { id: 'date', type: 'date', date: { start: '2026-10-20', end: null } },
    Type: { id: 'type', type: 'multi_select', multi_select: [{ name: 'Article' }] },
    Blog: { id: 'blog', type: 'select', select: { name: 'Blog' } },
    Series: { id: 'series', type: 'multi_select', multi_select: [] },
  });
  const result = await run([json(s), json(batch([p]))], {
    config: {
      ...config,
      publishDatePropertyId: 'date',
      typePropertyId: 'type',
      blogPropertyId: 'blog',
      seriesPropertyId: 'series',
    },
  });
  expect(result.ok).toBe(true);
  if (result.ok)
    expect(result.collection.snapshot.posts[0]).toMatchObject({
      publishDate: '2026-10-20',
      type: ['Article'],
      blog: 'Blog',
      series: [],
    });
});

it('does not persist credentials echoed using JSON unicode escapes', async () => {
  const p = page();
  p.properties.RenamedTitle.title = [{ plain_text: token }];
  const escaped = JSON.stringify(batch([p])).replace(
    token,
    token.replace(/./g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')),
  );
  const result = await run([json(schema()), new Response(escaped)]);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain(token);
});
it('rejects impossible calendar dates in publication metadata', async () => {
  const s = schema();
  Object.assign(s.properties, { Date: { id: 'date', type: 'date' } });
  const p = page();
  Object.assign(p.properties, {
    Date: { id: 'date', type: 'date', date: { start: '2026-02-31' } },
  });
  expect(
    (
      await run([json(s), json(batch([p]))], {
        config: { ...config, publishDatePropertyId: 'date' },
      })
    ).ok,
  ).toBe(false);
});
