import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalEvidenceAdapter } from '../../../src/adapters/index.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rmp-local-adapter-'));
  await mkdir(join(root, 'plans'), { recursive: true });
  await mkdir(join(root, '.roadmap', 'releases'), { recursive: true });
  await mkdir(join(root, '.roadmap', 'measurements'), { recursive: true });
  return root;
}

describe('LocalEvidenceAdapter', () => {
  it('collects explicit plan completion markers, releases, and measurements', async () => {
    const root = await repository();
    await writeFile(
      join(root, 'plans', 'delivery.md'),
      '# Delivery\n\nRMP-Item: del-cli\nRMP-Status: completed\n',
    );
    await writeFile(
      join(root, '.roadmap', 'releases', 'v1.json'),
      JSON.stringify({
        id: 'release-v1',
        itemId: 'rel-v1',
        tag: 'v1.0.0',
        releasedAt: '2026-09-20T12:00:00.000Z',
      }),
    );
    await writeFile(
      join(root, '.roadmap', 'measurements', 'activation.json'),
      JSON.stringify({
        id: 'measurement-1',
        itemId: 'out-activation',
        metric: 'activation',
        value: 42,
        successful: true,
        observedAt: '2026-09-20T13:00:00.000Z',
      }),
    );

    const result = await new LocalEvidenceAdapter().collect({ repositoryRoot: root });

    expect(result.evidence.map((event) => [event.kind, event.class, event.itemRefs])).toEqual([
      ['planCompletion', 'deterministic', ['del-cli']],
      ['measurement', 'observedOutcome', ['out-activation']],
      ['release', 'deterministic', ['rel-v1']],
    ]);
  });

  it('reports ambiguous item references and malformed records without losing valid evidence', async () => {
    const root = await repository();
    await writeFile(
      join(root, '.roadmap', 'releases', 'ambiguous.json'),
      JSON.stringify({
        id: 'release-ambiguous',
        itemIds: ['rel-one', 'rel-two'],
        tag: 'v2.0.0',
        releasedAt: '2026-09-20T12:00:00.000Z',
      }),
    );
    await writeFile(join(root, '.roadmap', 'measurements', 'broken.json'), '{not-json');

    const result = await new LocalEvidenceAdapter().collect({ repositoryRoot: root });

    expect(result.evidence).toHaveLength(0);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code).sort()).toEqual([
      'ambiguous-item',
      'invalid-record',
    ]);
  });
});
