import { describe, expect, it, vi } from 'vitest';
import { createAdapters } from '../../../src/adapters/factory.js';
import { defaultConfig } from '../../../src/config/index.js';

it('honors enabled built-in adapters without auto-enabling a provider', () => {
  expect(createAdapters(defaultConfig).map((a) => a.identity.provider)).toEqual(['local', 'git']);
  expect(createAdapters({ ...defaultConfig, adapters: { enabled: [] } })).toEqual([]);
});
describe('Notion configuration requirement', () => {
  it.each([false, true])(
    'reports a missing source configuration safely with offline=%s',
    async (offline) => {
      const environment = vi.fn(() => {
        throw new Error('Do not read credentials');
      });
      const [adapter] = createAdapters(
        { ...defaultConfig, adapters: { enabled: ['notion'] } },
        { offline, environment },
      );
      if (!adapter) throw new Error('Missing adapter');
      const result = await adapter.collect({ repositoryRoot: '.' });
      expect(result.source).toMatchObject({
        ok: false,
        health: { state: offline ? 'offline' : 'uninitialized' },
      });
      expect(result.evidence).toEqual([]);
      expect(environment).not.toHaveBeenCalled();
    },
  );
});
