import type {
  Adapter,
  AdapterCollectionContext,
  AdapterCursor,
  AdapterDiagnostic,
  AdapterIdentity,
  NormalizedEvidence,
  RegistryCollection,
} from './types.js';

function provenanceKey(event: NormalizedEvidence): string {
  return `${event.provenance.provider}:${event.provenance.eventId}`;
}

export function deduplicateEvidence(events: NormalizedEvidence[]): NormalizedEvidence[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = provenanceKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class AdapterRegistry {
  constructor(private readonly adapters: Adapter[]) {}

  identities(): AdapterIdentity[] {
    return this.adapters.map((adapter) => adapter.identity);
  }

  async collect(
    context: AdapterCollectionContext,
    cursors: Record<string, AdapterCursor | undefined> = {},
  ): Promise<RegistryCollection> {
    const evidence: NormalizedEvidence[] = [];
    const diagnostics: AdapterDiagnostic[] = [];
    const nextCursors: Record<string, AdapterCursor | undefined> = {};

    for (const adapter of this.adapters) {
      try {
        const result = await adapter.collect(context, cursors[adapter.identity.provider]);
        evidence.push(...result.evidence);
        diagnostics.push(...result.diagnostics);
        nextCursors[adapter.identity.provider] = result.cursor;
      } catch (error) {
        diagnostics.push({
          provider: adapter.identity.provider,
          code: 'adapter-error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { evidence: deduplicateEvidence(evidence), diagnostics, cursors: nextCursors };
  }
}
