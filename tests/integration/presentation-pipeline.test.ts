import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runSync } from '../../src/core/run-sync.js';
import { saveRoadmapChanges, startLocalServer } from '../../src/server/local.js';
import { fixture } from '../helpers/notion-projection.js';

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'rmp-presentation-'));
  await mkdir(join(root, '.roadmap'));
  await writeFile(join(root, '.roadmap/roadmap.json'), JSON.stringify(fixture().roadmap));
  await writeFile(join(root, '.roadmap/config.json'), '{}');
  return root;
}
const transformHtml = (html: string) =>
  html.replace('<body>', '<body><aside>Custom calendar</aside>');
it('keeps custom presentation on sync, render, and save', async () => {
  const root = await setup();
  for (const mode of ['sync', 'render'] as const) {
    const result = await runSync({ root, mode, transformHtml });
    expect(await readFile(join(root, '.roadmap/roadmap.html'), 'utf8')).toContain(
      'Custom calendar',
    );
    await saveRoadmapChanges(root, { roadmapRevision: result.roadmap.revision }, { transformHtml });
    expect(await readFile(join(root, '.roadmap/roadmap.html'), 'utf8')).toContain(
      'Custom calendar',
    );
  }
});
it('refreshes once at server startup and explicitly, never on page or asset requests', async () => {
  const root = await setup();
  let refreshes = 0;
  const server = await startLocalServer({
    root,
    port: 0,
    transformHtml,
    refresh: async () => {
      refreshes++;
      await runSync({ root, mode: 'sync', transformHtml });
    },
  });
  try {
    expect(refreshes).toBe(1);
    expect(await (await fetch(server.url)).text()).toContain('Custom calendar');
    await fetch(`${server.url}/favicon.ico`);
    await fetch(server.url);
    expect(refreshes).toBe(1);
    expect((await fetch(`${server.url}/api/refresh`, { method: 'POST' })).status).toBe(200);
    expect(refreshes).toBe(2);
  } finally {
    await server.close();
  }
});
it('does not partially save when a trusted transform fails', async () => {
  const root = await setup();
  const path = join(root, '.roadmap/roadmap.json');
  const before = await readFile(path, 'utf8');
  await expect(
    runSync({
      root,
      mode: 'sync',
      transformHtml: () => {
        throw new Error('transform failed');
      },
    }),
  ).rejects.toThrow('transform failed');
  expect(await readFile(path, 'utf8')).toBe(before);
});

it('retains the warning above custom presentation after saves and rejects cross-origin refresh', async () => {
  const root = await setup();
  await mkdir(join(root, '.roadmap/sources'));
  await writeFile(
    join(root, '.roadmap/sources/notion-health.json'),
    JSON.stringify({
      provider: 'notion',
      state: 'stale',
      lastSuccessfulAt: '2026-10-20T12:00:00Z',
    }),
  );
  await saveRoadmapChanges(
    root,
    { roadmapRevision: fixture().roadmap.revision },
    { transformHtml },
  );
  const html = await readFile(join(root, '.roadmap/roadmap.html'), 'utf8');
  expect(html.indexOf('data-source-health="stale"')).toBeLessThan(html.indexOf('Custom calendar'));
  let calls = 0;
  const server = await startLocalServer({
    root,
    port: 0,
    transformHtml,
    refresh: () => {
      calls++;
      return Promise.resolve();
    },
  });
  try {
    const rejected = await fetch(`${server.url}/api/refresh`, {
      method: 'POST',
      headers: { origin: 'https://untrusted.example' },
    });
    expect(rejected.status).toBe(403);
    expect(calls).toBe(1);
    const saved = await fetch(`${server.url}/api/save`, {
      method: 'POST',
      body: JSON.stringify({ roadmapRevision: fixture().roadmap.revision + 1 }),
    });
    expect(saved.status).toBe(200);
    expect(await (await fetch(server.url)).text()).toContain('Custom calendar');
    expect(calls).toBe(1);
  } finally {
    await server.close();
  }
});

const wrapperPath = '../../templates/content-sync.mjs';
const { runContentCalendar } = (await import(wrapperPath)) as {
  runContentCalendar: (
    options: { root: string; command?: string; offline?: boolean; dryRun?: boolean; port?: number },
    api: { runSync: typeof runSync; startLocalServer: typeof startLocalServer },
  ) => Promise<Awaited<ReturnType<typeof runSync>> | Awaited<ReturnType<typeof startLocalServer>>>;
};
it.each(['sync', 'view', 'refresh', 'render'])(
  'the calendar %s entry point uses the same transform without enabling an unconfigured provider',
  async (command) => {
    const root = await setup();
    const result = await runContentCalendar(
      { root, command, offline: true },
      { runSync, startLocalServer },
    );
    expect(result).not.toHaveProperty('sourceHealth');
    const html = await readFile(join(root, '.roadmap/roadmap.html'), 'utf8');
    expect(html).toContain('Posts (Kanban)');
    expect(html).not.toContain('id="refresh-source"');
  },
);
it('wrapper rejects invalid commands and leaves no files on dry-run', async () => {
  const root = await setup();
  await expect(
    runContentCalendar({ root, command: 'shell' }, { runSync, startLocalServer }),
  ).rejects.toThrow('Use sync');
  await expect(
    runContentCalendar({ root, command: 'serve', dryRun: true }, { runSync, startLocalServer }),
  ).rejects.toThrow('dry-run');
  await runContentCalendar({ root, dryRun: true }, { runSync, startLocalServer });
  await expect(readFile(join(root, '.roadmap/roadmap.html'))).rejects.toThrow();
});

it('wrapper serves and saves with analytics, and refuses corrupt analytics before writing', async () => {
  const root = await setup();
  await mkdir(join(root, '.roadmap/sources'));
  const analyticsPath = join(root, '.roadmap/sources/content-analytics.json');
  await writeFile(analyticsPath, '{"posts":[]}');
  const server = await runContentCalendar(
    { root, command: 'serve', port: 0 },
    { runSync, startLocalServer },
  );
  if (!('url' in server)) throw new Error('Expected server');
  try {
    expect(await (await fetch(server.url)).text()).toContain('Posts (Kanban)');
    expect((await fetch(`${server.url}/api/refresh`, { method: 'POST' })).status).toBe(200);
  } finally {
    await server.close();
  }
  const before = await readFile(join(root, '.roadmap/roadmap.html'), 'utf8');
  await writeFile(analyticsPath, '{broken');
  await expect(runContentCalendar({ root }, { runSync, startLocalServer })).rejects.toThrow();
  expect(await readFile(join(root, '.roadmap/roadmap.html'), 'utf8')).toBe(before);
});
