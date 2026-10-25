import { afterEach, expect, it, vi } from 'vitest';
import { NotionClient } from '../../../src/adapters/notion-client.js';
import { config, json, token, transport } from '../../helpers/notion-transport.js';
afterEach(() => vi.useRealTimers());
it('uses only fixed read endpoints and keeps opaque cursors in the query body', async () => {
  const t = transport([json({ schema: true }), json({ results: [] })]);
  const c = new NotionClient(config, token, t);
  expect(await c.schema()).toEqual({ schema: true });
  await c.query('opaque?next=/secret');
  expect(t.fetch.mock.calls.map((c) => c[0])).toEqual([
    `https://api.notion.com/v1/data_sources/${config.dataSourceId}`,
    `https://api.notion.com/v1/data_sources/${config.dataSourceId}/query`,
  ]);
  expect(t.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2026-03-11' },
  });
  expect(t.fetch.mock.calls[1]?.[1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ page_size: 100, start_cursor: 'opaque?next=/secret' }),
  });
  expect((t.starts[1] ?? 0) - (t.starts[0] ?? 0)).toBeGreaterThanOrEqual(400);
});
it.each([400, 401, 403, 404, 406, 409, 301, 302, 303, 307, 308, 418])(
  'does not retry HTTP %i or disclose its body',
  async (status) => {
    const t = transport([new Response(token, { status })]);
    const c = new NotionClient(config, token, t);
    const error = await c.schema().catch((e: unknown) => e);
    expect(String(error)).not.toContain(token);
    expect(t.fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([500, 502, 503, 504, 529])(
  'retries transient HTTP %i within its budget',
  async (status) => {
    const t = transport([new Response('', { status }), json({ ok: true })]);
    expect(await new NotionClient(config, token, t).schema()).toEqual({ ok: true });
    expect(t.sleep).toHaveBeenCalledWith(1000);
  },
);
it('honors Retry-After without retrying early', async () => {
  const t = transport([
    new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
    json({ ok: true }),
  ]);
  await new NotionClient(config, token, t).schema();
  expect((t.starts[1] ?? 0) - (t.starts[0] ?? 0)).toBe(2000);
});
it('stops if Retry-After cannot fit or is malformed', async () => {
  for (const delay of ['1000', 'invalid']) {
    const t = transport([new Response('', { status: 429, headers: { 'Retry-After': delay } })]);
    await expect(new NotionClient(config, token, t).schema()).rejects.toMatchObject({
      code: 'limit',
    });
    expect(t.fetch).toHaveBeenCalledTimes(1);
  }
});
it('bounds transport retries and sanitizes exceptions', async () => {
  const t = transport([new Error(token), new Error(token), new Error(token)]);
  await expect(new NotionClient(config, token, t).schema()).rejects.toMatchObject({
    code: 'transport',
    message: 'Notion collection failed: transport',
  });
  expect(t.fetch).toHaveBeenCalledTimes(3);
});
it('rejects oversized and malformed successful bodies', async () => {
  for (const body of ['{', 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    const t = transport([new Response(body)]);
    await expect(new NotionClient(config, token, t).schema()).rejects.toBeDefined();
    expect(t.fetch).toHaveBeenCalledTimes(1);
  }
});
it('aborts a hung header or body read at the request deadline', async () => {
  vi.useFakeTimers();
  for (const response of [
    () => new Promise<Response>(() => {}),
    () => Promise.resolve(new Response(new ReadableStream({ start() {} }))),
  ]) {
    const t = transport([response]);
    const pending = new NotionClient({ ...config, requestTimeoutMs: 50 }, token, t).schema();
    const outcome = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(51);
    expect(await outcome).toMatchObject({ code: 'timeout' });
    expect(t.fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  }
});
it('rejects untrusted configuration before any request', () => {
  const t = transport([]);
  expect(() => new NotionClient({ ...config, dataSourceId: '../../users' }, token, t)).toThrow();
  expect(t.fetch).not.toHaveBeenCalled();
});

it('enforces the cumulative collection byte budget across individually valid responses', async () => {
  const body = { padding: 'x'.repeat(1900000) };
  const t = transport(Array.from({ length: 12 }, () => json(body)));
  const client = new NotionClient(config, token, t);
  for (let index = 0; index < 11; index++) await client.schema();
  await expect(client.schema()).rejects.toMatchObject({ code: 'limit' });
});
it('includes rate spacing in the total collection deadline', async () => {
  const t = transport([json({ ok: true }), json({ ok: true })]);
  const client = new NotionClient({ ...config, collectionTimeoutMs: 300 }, token, t);
  await client.schema();
  await expect(client.query()).rejects.toMatchObject({ code: 'limit' });
  expect(t.fetch).toHaveBeenCalledTimes(1);
});
it('fails closed on missing bodies, echoed credentials and exhausted HTTP retries', async () => {
  for (const response of [new Response(null), json({ echo: token })]) {
    await expect(
      new NotionClient(config, token, transport([response])).schema(),
    ).rejects.toMatchObject({ code: 'schema' });
  }
  const t = transport([new Response('', { status: 503 })]);
  await expect(
    new NotionClient({ ...config, maxRetries: 0 }, token, t).schema(),
  ).rejects.toMatchObject({ code: 'limit' });
});

it('uses the default clock and timer to enforce spacing with the native fetch interface', async () => {
  vi.useFakeTimers();
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(json({ ok: true }))
    .mockResolvedValueOnce(json({ ok: true }));
  try {
    const client = new NotionClient(config, token);
    await client.schema();
    const pending = client.query();
    await vi.advanceTimersByTimeAsync(399);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    fetch.mockRestore();
  }
});
it.each(['', 'bad\nheader'])('rejects missing or invalid tokens before fetch', (value) => {
  const t = transport([]);
  expect(() => new NotionClient(config, value, t)).toThrow('auth');
  expect(t.fetch).not.toHaveBeenCalled();
});
