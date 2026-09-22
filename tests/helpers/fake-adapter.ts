import type {
  Adapter,
  AdapterCollection,
  AdapterCollectionContext,
  AdapterCursor,
  AdapterIdentity,
} from '../../src/adapters/index.js';

export class FakeAdapter implements Adapter {
  readonly identity: AdapterIdentity = {
    provider: 'fake',
    version: '1.0.0',
    capabilities: ['pagination', 'workItems'],
  };

  collect(_context: AdapterCollectionContext, cursor?: AdapterCursor): Promise<AdapterCollection> {
    const page = cursor?.value === 'page-2' ? 2 : 1;

    const nextCursor = page === 1 ? { cursor: { value: 'page-2' } } : {};
    return Promise.resolve({
      evidence: [
        {
          id: `fake-${String(page)}`,
          kind: 'workItem',
          class: 'inferred',
          observedAt: `2026-09-2${String(page)}T00:00:00.000Z`,
          summary: `Fake page ${String(page)}`,
          itemRefs: [],
          provenance: {
            provider: 'fake',
            eventId: `event-${String(page)}`,
            sourceRef: `fake://events/${String(page)}`,
          },
          data: {},
        },
      ],
      diagnostics: [],
      ...nextCursor,
    });
  }
}
