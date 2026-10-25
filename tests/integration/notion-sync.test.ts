import { saveRoadmapChanges } from '../../src/server/local.js';
import { mkdir, mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runSync } from '../../src/core/run-sync.js';
import { fixture as projection } from '../helpers/notion-projection.js';
import {
  batch,
  config,
  json,
  page,
  schema,
  sourceId,
  token,
  transport,
} from '../helpers/notion-transport.js';
import { executeCli } from '../../src/commands/execute.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rmp-notion-sync-'));
  await mkdir(join(root, '.roadmap'));
  const p = projection().policy;
  p.dataSourceId = sourceId;
  p.statusOptions = { draft: 'drafting', done: 'published' };
  const roadmap = { ...projection().roadmap, extensions: { 'content/notion-workflow': p } };
  await writeFile(join(root, '.roadmap/roadmap.json'), JSON.stringify(roadmap));
  await writeFile(
    join(root, '.roadmap/config.json'),
    JSON.stringify({ ...projection().config, adapters: { enabled: ['notion'], notion: config } }),
  );
  await writeFile(join(root, '.roadmap/history.jsonl'), '');
  return root;
}
const online = () => ({
  environment: () => token,
  transport: transport([json(schema()), json(batch([page()]))]),
});
async function files(root: string) {
  const all: Record<string, string> = {};
  async function walk(dir: string) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = posix.join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else all[path] = await readFile(join(root, path), 'utf8');
    }
  }
  await walk('');
  return all;
}

describe('Notion sync orchestration', () => {
  it('commits complete source, roadmap, audit and views together; repeats without semantic changes', async () => {
    const root = await fixture();
    const first = await runSync({ root, mode: 'sync', notion: online() });
    expect(first.sourceHealth?.state).toBe('fresh');
    expect(first.roadmap.items).toHaveLength(1);
    expect(first.degraded).toBe(false);
    const saved = await files(root);
    expect(saved['.roadmap/sources/notion-posts.json']).toContain('A post');
    expect(saved['.roadmap/source-changes.jsonl']).toContain('policyHash');
    const second = await runSync({ root, mode: 'sync', notion: online() });
    expect(second.roadmap).toEqual(first.roadmap);
    expect(second.receipts).toEqual([]);
    expect(await files(root)).toEqual(saved);
  });
  it.each(['collect', 'dry-run'] as const)('%s has zero persistent writes', async (mode) => {
    const root = await fixture();
    const before = await files(root);
    const result = await runSync({
      root,
      mode: mode === 'collect' ? 'collect' : 'sync',
      dryRun: mode === 'dry-run',
      notion: online(),
    });
    expect(result.sourceHealth?.state).toBe('fresh');
    expect(await files(root)).toEqual(before);
  });
  it.each(['offline', 'render', 'disabled'] as const)(
    '%s never reads credentials or invokes transport',
    async (mode) => {
      const root = await fixture();
      if (mode === 'disabled') await writeFile(join(root, '.roadmap/config.json'), '{}');
      const environment = vi.fn(() => {
        throw new Error('SECRET must not read');
      });
      const fetch = vi.fn(() => {
        throw new Error('must not fetch');
      });
      const result = await runSync({
        root,
        mode: mode === 'render' ? 'render' : 'sync',
        offline: mode === 'offline',
        notion: { environment, transport: { fetch } },
      });
      expect(environment).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(result.degraded).toBe(false);
    },
  );
  it('retains last good data on a late page failure and shows stale status in CLI and HTML', async () => {
    const root = await fixture();
    await runSync({ root, mode: 'sync', notion: online() });
    const before = await files(root);
    const result = await runSync({
      root,
      mode: 'sync',
      notion: {
        environment: () => token,
        transport: transport([
          json(schema()),
          json(batch([page()], 'next')),
          new Response('', { status: 403 }),
        ]),
      },
    });
    expect(result.degraded).toBe(true);
    expect(result.sourceHealth).toMatchObject({ state: 'stale', errorCode: 'access' });
    const after = await files(root);
    for (const path of [
      '.roadmap/roadmap.json',
      '.roadmap/history.jsonl',
      '.roadmap/source-changes.jsonl',
      '.roadmap/sources/notion-posts.json',
    ])
      expect(after[path]).toBe(before[path]);
    expect(after['.roadmap/roadmap.html']).toContain('Notion data is stale');
    expect(after['.roadmap/roadmap.html']).toContain('Last successful refresh');
    expect(JSON.stringify(result)).not.toContain(token);
    const cli = await executeCli(['sync'], {
      sync: () => Promise.resolve(result),
      install: vi.fn(),
      validate: vi.fn(),
    });
    expect(cli.exitCode).toBe(1);
    expect(cli.stderr).toContain('stale');
  });
  it('marks first-refresh failure uninitialized and offline exit successful', async () => {
    const root = await fixture();
    const result = await runSync({ root, mode: 'sync', notion: { environment: () => undefined } });
    expect(result.sourceHealth?.state).toBe('uninitialized');
    expect(result.roadmap.items).toEqual([]);
    // Verify argument plumbing with an injected repository-independent response.
    const sync = vi.fn<
      (
        options: import('../../src/core/run-sync.js').RunSyncOptions,
      ) => Promise<import('../../src/core/run-sync.js').RunSyncResult>
    >(() =>
      Promise.resolve({
        ...result,
        degraded: false,
        sourceHealth: { provider: 'notion' as const, state: 'offline' as const },
      }),
    );
    const offline = await executeCli(['sync', '--offline'], {
      sync,
      install: vi.fn(),
      validate: vi.fn(),
    });
    expect(offline.exitCode).toBe(0);
    expect(sync.mock.calls[0]?.[0]).toMatchObject({ offline: true });
  });
  it('rejects source configuration changes during collection without committing', async () => {
    const root = await fixture();
    const notion = online();
    const fetch = notion.transport.fetch;
    notion.transport.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
      await writeFile(join(root, '.roadmap/config.json'), '{}');
      return fetch(...args);
    });
    await expect(runSync({ root, mode: 'sync', notion })).rejects.toThrow(/changed.*retry/i);
    expect((await files(root))['.roadmap/sources/notion-posts.json']).toBeUndefined();
  });
  it.each(['render', 'commit'] as const)('preserves all files on %s failure', async (failure) => {
    const root = await fixture();
    const before = await files(root);
    await expect(
      runSync({
        root,
        mode: 'sync',
        notion: online(),
        ...(failure === 'render'
          ? {
              renderHtml: () => {
                throw new Error('render failed');
              },
            }
          : {
              transactionOptions: {
                fault: (point: string) => {
                  if (point === 'after-replace') throw new Error('commit failed');
                },
              },
            }),
      }),
    ).rejects.toThrow(`${failure} failed`);
    expect(await files(root)).toEqual(before);
  });
});

it('reconciles independent local evidence when the provider fails', async () => {
  const root = await fixture();
  const value = JSON.parse(
    await readFile(join(root, '.roadmap/roadmap.json'), 'utf8'),
  ) as import('../../src/types/index.js').Roadmap;
  value.items.push({
    id: 'del-local',
    kind: 'deliverable',
    title: 'Local work',
    status: 'active',
    horizon: 'now',
    commitment: 'planned',
    confidence: 'medium',
    extensions: {},
  });
  await writeFile(join(root, '.roadmap/roadmap.json'), JSON.stringify(value));
  const result = await runSync({
    root,
    mode: 'sync',
    notion: { environment: () => undefined },
    adapters: [
      {
        identity: { provider: 'local-test', version: '1', capabilities: ['workItems'] },
        collect: () =>
          Promise.resolve({
            diagnostics: [],
            evidence: [
              {
                id: 'ev-local-done',
                kind: 'planCompletion',
                class: 'deterministic',
                observedAt: '2026-10-20T12:00:00.000Z',
                summary: 'Complete',
                itemRefs: ['del-local'],
                provenance: { provider: 'local-test', eventId: 'done', sourceRef: 'local:done' },
                data: {},
              },
            ],
          }),
      },
    ],
  });
  expect(result.degraded).toBe(true);
  expect(result.roadmap.items[0]?.status).toBe('completed');
  expect(result.receipts).toHaveLength(1);
});

it('rereads local edits made during fetch instead of overwriting them', async () => {
  const root = await fixture();
  const notion = online();
  const fetch = notion.transport.fetch;
  let changed = false;
  notion.transport.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    if (!changed) {
      changed = true;
      await saveRoadmapChanges(root, {
        roadmapRevision: 3,
        newOutcomes: [{ id: 'out-local', title: 'Keep this local outcome' }],
      });
    }
    return fetch(...args);
  });
  const result = await runSync({ root, mode: 'sync', notion });
  expect(result.roadmap.items.some((i) => i.id === 'out-local')).toBe(true);
  expect(result.roadmap.items).toHaveLength(2);
});

it('rejects an older in-flight generation after another sync has committed', async () => {
  const root = await fixture();
  const notion = online();
  const fetch = notion.transport.fetch;
  let changed = false;
  let saved: Record<string, string> = {};
  notion.transport.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    if (!changed) {
      changed = true;
      await runSync({ root, mode: 'sync', notion: online() });
      saved = await files(root);
    }
    return fetch(...args);
  });
  await expect(runSync({ root, mode: 'sync', notion })).rejects.toThrow(/changed.*retry/i);
  expect(await files(root)).toEqual(saved);
});

it('retains the stale notice on browser saves and does not replay a snapshot offline', async () => {
  const root = await fixture();
  const first = await runSync({ root, mode: 'sync', notion: online() });
  await runSync({ root, mode: 'sync', notion: { environment: () => undefined } });
  await saveRoadmapChanges(root, {
    roadmapRevision: first.roadmap.revision,
    deliveryWindows: ['Soon', 'Next', 'Later'],
  });
  expect(await readFile(join(root, '.roadmap/roadmap.html'), 'utf8')).toContain(
    'Notion data is stale',
  );
  const result = await runSync({
    root,
    mode: 'sync',
    offline: true,
    notion: {
      environment: () => {
        throw new Error('secret');
      },
    },
  });
  expect(result.sourceHealth?.state).toBe('offline');
  expect(result.receipts).toEqual([]);
  expect(result.degraded).toBe(false);
});

it('rejects a whole projection with unknown vocabulary while preserving the cached generation', async () => {
  const root = await fixture();
  await runSync({ root, mode: 'sync', notion: online() });
  const before = await files(root);
  const s = schema();
  s.properties.RenamedStatus.status.options.push({ id: 'unknown', name: 'Unknown' });
  const p = page();
  p.properties.RenamedStatus.status = { id: 'unknown', name: 'Unknown' };
  const result = await runSync({
    root,
    mode: 'sync',
    notion: { environment: () => token, transport: transport([json(s), json(batch([p]))]) },
  });
  expect(result.degraded).toBe(true);
  expect(result.sourceHealth?.errorCode).toBe('schema');
  expect((await files(root))['.roadmap/sources/notion-posts.json']).toBe(
    before['.roadmap/sources/notion-posts.json'],
  );
});

it.each(['history.jsonl', 'source-changes.jsonl'])(
  'rejects corrupt %s without rewriting accepted artifacts',
  async (name) => {
    const root = await fixture();
    await writeFile(join(root, '.roadmap', name), '{}\n');
    const before = await files(root);
    await expect(runSync({ root, mode: 'sync', offline: true })).rejects.toThrow(
      /invalid.*history|invalid.*journal/i,
    );
    expect(await files(root)).toEqual(before);
  },
);
