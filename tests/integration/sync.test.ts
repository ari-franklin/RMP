import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Adapter, Roadmap } from '../../src/index.js';
import { runSync } from '../../src/core/run-sync.js';

const starter: Roadmap = {
  schemaVersion: '1.0.0',
  revision: 0,
  title: 'Integration roadmap',
  items: [
    {
      id: 'del-cli',
      kind: 'deliverable',
      title: 'CLI',
      status: 'active',
      horizon: 'now',
      commitment: 'committed',
      confidence: 'high',
      extensions: {},
    },
  ],
  relationships: [],
  evidence: [],
  recommendations: [],
  extensions: {},
};

async function fixture(roadmap: unknown = starter): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rmp-sync-'));
  await mkdir(join(root, '.roadmap'), { recursive: true });
  await writeFile(join(root, '.roadmap', 'roadmap.json'), `${JSON.stringify(roadmap)}\n`);
  await writeFile(join(root, '.roadmap', 'config.json'), '{}\n');
  await writeFile(join(root, '.roadmap', 'history.jsonl'), '');
  return root;
}

function completionAdapter(): Adapter {
  return {
    identity: { provider: 'fixture', version: '1.0.0', capabilities: ['workItems'] },
    collect: () =>
      Promise.resolve({
        evidence: [
          {
            id: 'ev-complete',
            kind: 'planCompletion',
            class: 'deterministic',
            observedAt: '2026-09-21T12:00:00.000Z',
            summary: 'Plan completed',
            itemRefs: ['del-cli'],
            provenance: {
              provider: 'fixture',
              eventId: 'complete-1',
              sourceRef: 'fixture://complete-1',
            },
            data: {},
          },
        ],
        diagnostics: [],
      }),
  };
}

describe('runSync', () => {
  it('returns collected evidence without writing in collect-only mode', async () => {
    const root = await fixture();
    const before = await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8');

    const result = await runSync({ root, mode: 'collect', adapters: [completionAdapter()] });

    expect(result.evidence).toHaveLength(1);
    expect(result.changedPaths).toEqual([]);
    expect(await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8')).toBe(before);
  });

  it('returns exact proposed changes without writing during dry run', async () => {
    const root = await fixture();

    const result = await runSync({
      root,
      mode: 'sync',
      dryRun: true,
      adapters: [completionAdapter()],
      now: '2026-09-21T12:00:00.000Z',
    });

    expect(result.changedPaths).toEqual([
      '.roadmap/history.jsonl',
      '.roadmap/roadmap.html',
      '.roadmap/roadmap.json',
      'ROADMAP.md',
    ]);
    expect(result.roadmap.revision).toBe(1);
    expect(
      JSON.parse(await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8')),
    ).toMatchObject({
      revision: 0,
    });
  });

  it('commits an automatic transition, receipt, and synchronized views', async () => {
    const root = await fixture();

    const result = await runSync({
      root,
      mode: 'sync',
      adapters: [completionAdapter()],
      now: '2026-09-21T12:00:00.000Z',
    });

    expect(result.receipts).toHaveLength(1);
    expect(result.roadmap.items[0]?.status).toBe('completed');
    expect(await readFile(join(root, 'ROADMAP.md'), 'utf8')).toContain('Revision: 1');
    expect(await readFile(join(root, '.roadmap', 'roadmap.html'), 'utf8')).toContain(
      'data-revision="1"',
    );
    expect(await readFile(join(root, '.roadmap', 'history.jsonl'), 'utf8')).toContain(
      '"newStatus":"completed"',
    );
  });

  it('does not collect evidence in render-only mode', async () => {
    const root = await fixture();
    const collect = vi.fn(() => Promise.reject(new Error('must not collect')));

    const result = await runSync({
      root,
      mode: 'render',
      adapters: [
        {
          identity: { provider: 'unused', version: '1.0.0', capabilities: [] },
          collect,
        },
      ],
    });

    expect(collect).not.toHaveBeenCalled();
    expect(result.changedPaths).toEqual(['.roadmap/roadmap.html', 'ROADMAP.md']);
  });

  it('is a no-op when synchronized state and views are unchanged', async () => {
    const root = await fixture();
    await runSync({ root, mode: 'sync', adapters: [] });

    const result = await runSync({ root, mode: 'sync', adapters: [] });

    expect(result.changedPaths).toEqual([]);
  });

  it('rejects invalid state without changing prior artifacts', async () => {
    const root = await fixture({ ...starter, schemaVersion: '2.0.0' });
    const before = await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8');

    await expect(runSync({ root, mode: 'sync' })).rejects.toThrow(/invalid roadmap/i);
    expect(await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8')).toBe(before);
  });

  it('rejects a repository with missing roadmap state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-sync-'));

    await expect(runSync({ root, mode: 'sync' })).rejects.toThrow(/missing.*roadmap\.json/i);
  });

  it('rejects malformed configuration', async () => {
    const root = await fixture();
    await writeFile(join(root, '.roadmap', 'config.json'), '{');

    await expect(runSync({ root, mode: 'sync' })).rejects.toThrow(/invalid config json/i);
  });

  it.each([
    ['markdown', ['ROADMAP.md']],
    ['html', ['.roadmap/roadmap.html']],
  ] as const)('renders only the selected %s format', async (format, expectedPaths) => {
    const root = await fixture();

    const result = await runSync({ root, mode: 'render', format });

    expect(result.changedPaths).toEqual(expectedPaths);
  });

  it('preserves every artifact when rendering fails', async () => {
    const root = await fixture();
    await writeFile(join(root, 'ROADMAP.md'), 'old markdown');
    await writeFile(join(root, '.roadmap', 'roadmap.html'), 'old html');

    await expect(
      runSync({
        root,
        mode: 'sync',
        adapters: [completionAdapter()],
        renderHtml: () => {
          throw new Error('renderer failed');
        },
      }),
    ).rejects.toThrow('renderer failed');
    expect(await readFile(join(root, 'ROADMAP.md'), 'utf8')).toBe('old markdown');
    expect(await readFile(join(root, '.roadmap', 'roadmap.html'), 'utf8')).toBe('old html');
    expect(
      JSON.parse(await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8')),
    ).toMatchObject({
      revision: 0,
    });
  });
});
