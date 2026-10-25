import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';
const source = {
  dataSourceId: '11111111-1111-4111-8111-111111111111',
  titlePropertyId: 'title',
  statusPropertyId: 'st%3A',
};
describe('Notion configuration', () => {
  it('loads bounded defaults without enabling the provider', () => {
    const result = loadConfig({ adapters: { notion: source } });
    expect(result.valid).toBe(true);
    expect(result.config?.adapters).toEqual({
      enabled: ['local', 'git'],
      notion: {
        ...source,
        requestTimeoutMs: 10000,
        collectionTimeoutMs: 60000,
        maxPages: 20,
        maxRetries: 2,
      },
    });
  });
  it('preserves explicit bounds and optional property IDs', () => {
    const notion = {
      ...source,
      requestTimeoutMs: 5000,
      collectionTimeoutMs: 10000,
      maxPages: 3,
      maxRetries: 0,
      publishDatePropertyId: 'date',
      typePropertyId: 'type',
      blogPropertyId: 'blog',
      seriesPropertyId: 'series',
    };
    expect(
      loadConfig({ adapters: { enabled: ['notion'], notion } }).config?.adapters.notion,
    ).toEqual(notion);
  });
  it('keeps legacy extension configuration valid before explicit migration', () => {
    expect(
      loadConfig({
        adapters: { enabled: ['notion'] },
        extensions: { 'content/notion': { statusProperty: 'Status' } },
      }).valid,
    ).toBe(true);
    expect(loadConfig({}).config?.adapters).toEqual({ enabled: ['local', 'git'] });
  });
  it.each([
    { token: 'secret' },
    { baseUrl: 'https://example.com' },
    { refreshCommand: 'command' },
    { tokenEnv: 'OTHER_TOKEN' },
    { requestTimeoutMs: 0 },
    { requestTimeoutMs: 30001 },
    { collectionTimeoutMs: 120001 },
    { collectionTimeoutMs: 0 },
    { maxPages: 101 },
    { maxPages: 0 },
    { maxPages: 1.5 },
    { maxRetries: -1 },
    { maxRetries: 4 },
    { dataSourceId: 'https://notion.so/source' },
    { titlePropertyId: '' },
    { statusPropertyId: '' },
  ])('rejects unsafe or unbounded settings: %j', (extra) => {
    const result = loadConfig({ adapters: { notion: { ...source, ...extra } } });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.diagnostics)).not.toContain('secret');
  });
  it('requires explicit source, title and status identity', () => {
    expect(loadConfig({ adapters: { notion: {} } }).valid).toBe(false);
  });
});
