import { describe, expect, it } from 'vitest';

import { AdapterRegistry } from '../../../src/adapters/index.js';
import { FakeAdapter } from '../../helpers/fake-adapter.js';

describe('AdapterRegistry', () => {
  it('exposes provider capabilities and supports provider-neutral pagination', async () => {
    const registry = new AdapterRegistry([new FakeAdapter()]);

    expect(registry.identities()).toEqual([
      {
        provider: 'fake',
        version: '1.0.0',
        capabilities: ['pagination', 'workItems'],
      },
    ]);

    const first = await registry.collect({ repositoryRoot: '/repo' });
    const second = await registry.collect(
      { repositoryRoot: '/repo' },
      { fake: first.cursors.fake },
    );

    expect(first.evidence.map((event) => event.id)).toEqual(['fake-1']);
    expect(first.cursors.fake).toEqual({ value: 'page-2' });
    expect(second.evidence.map((event) => event.id)).toEqual(['fake-2']);
  });

  it('deduplicates immutable provenance and isolates adapter errors', async () => {
    const duplicate = new FakeAdapter();
    const broken = {
      identity: { provider: 'broken', version: '1.0.0', capabilities: [] },
      collect: () => Promise.reject(new Error('credentials unavailable')),
    };
    const registry = new AdapterRegistry([duplicate, duplicate, broken]);

    const result = await registry.collect({ repositoryRoot: '/repo' });

    expect(result.evidence).toHaveLength(1);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ provider: 'broken', code: 'adapter-error' }),
    );
  });
});
