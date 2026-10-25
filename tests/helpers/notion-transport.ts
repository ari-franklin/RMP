import { vi } from 'vitest';
import type { NotionTransport } from '../../src/adapters/notion-client.js';
export const sourceId = '11111111-1111-4111-8111-111111111111';
export const pageId = '22222222-2222-4222-8222-222222222222';
export const config = {
  dataSourceId: sourceId,
  titlePropertyId: 'title',
  statusPropertyId: 'status',
  requestTimeoutMs: 10000,
  collectionTimeoutMs: 60000,
  maxPages: 20,
  maxRetries: 2,
};
export const token = 'test-secret-sentinel';
export const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
export function transport(responses: Array<Response | Error | (() => Promise<Response>)>) {
  let time = Date.parse('2026-10-20T12:00:00Z');
  const starts: number[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    starts.push(time);
    const response = responses.shift();
    if (response instanceof Error) return Promise.reject(response);
    if (typeof response === 'function') return response();
    return Promise.resolve(response ?? new Response('', { status: 500 }));
  });
  const sleep = vi.fn((ms: number) => {
    time += ms;
    return Promise.resolve();
  });
  return { fetch, sleep, now: () => time, starts } satisfies NotionTransport & { starts: number[] };
}
export function schema() {
  return {
    object: 'data_source',
    id: sourceId,
    properties: {
      RenamedTitle: { id: 'title', type: 'title' },
      RenamedStatus: {
        id: 'status',
        type: 'status',
        status: {
          options: [
            { id: 'draft', name: 'drafting' },
            { id: 'done', name: 'published' },
          ],
        },
      },
    },
  };
}
export function page() {
  return {
    object: 'page',
    id: pageId,
    last_edited_time: '2026-10-19T10:00:00.000Z',
    archived: false,
    in_trash: false,
    parent: { type: 'data_source_id', data_source_id: sourceId },
    url: 'https://attacker.invalid/do-not-fetch',
    properties: {
      RenamedTitle: { id: 'title', type: 'title', title: [{ plain_text: 'A post' }] },
      RenamedStatus: { id: 'status', type: 'status', status: { id: 'draft', name: 'drafting' } },
    },
  };
}
export function batch(results: unknown[], cursor: string | null = null) {
  return { object: 'list', results, has_more: cursor !== null, next_cursor: cursor };
}
