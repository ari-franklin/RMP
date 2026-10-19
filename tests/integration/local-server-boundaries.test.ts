import { afterEach, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveRoadmapChanges, startLocalServer } from '../../src/server/index.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rmp-save-boundaries-'));
  roots.push(root);
  await mkdir(join(root, '.roadmap'));
  await writeFile(join(root, '.roadmap/roadmap.json'), await readFile('templates/roadmap.json'));
  await writeFile(join(root, '.roadmap/roadmap.html'), '<p>original</p>');
  return root;
}
it.each([
  [{ horizonMoves: { missing: 'now' } }, 'Unknown roadmap item'],
  [{ horizonMoves: { 'del-cli': 'tomorrow' } }, 'Invalid horizon'],
  [{ horizonMoves: { 'del-cli': 1 } }, 'Invalid horizon'],
  [{ deliveryWindows: ['one'] }, 'three labels'],
  [{ deliveryWindows: ['one', '', 'three'] }, 'three labels'],
  [{ itemEdits: { missing: { title: 'Title' } } }, 'Unknown roadmap item'],
  [{ itemEdits: { 'del-cli': { title: 1 } } }, 'Title is required'],
  [{ itemEdits: { 'del-cli': { title: ' ' } } }, 'Title is required'],
  [{ newOutcomes: [null] }, 'Invalid new outcome'],
  [{ newOutcomes: [1] }, 'Invalid new outcome'],
  [{ newOutcomes: [{ id: 1, title: 'Title' }] }, 'Invalid outcome ID'],
  [{ newOutcomes: [{ id: 'out-adoption', title: 'Title' }] }, 'Invalid outcome ID'],
  [{ newOutcomes: [{ id: 'out-new', title: 1 }] }, 'require a title'],
  [{ newOutcomes: [{ id: 'out-new', title: 'Title', horizon: 'tomorrow' }] }, 'valid horizon'],
])('rejects invalid edits without changing stored files: %j', async (input, message) => {
  const root = await fixture();
  const before = await readFile(join(root, '.roadmap/roadmap.json'), 'utf8');
  await expect(saveRoadmapChanges(root, { roadmapRevision: 0, ...input })).rejects.toThrow(message);
  expect(await readFile(join(root, '.roadmap/roadmap.json'), 'utf8')).toBe(before);
  expect(await readFile(join(root, '.roadmap/roadmap.html'), 'utf8')).toBe('<p>original</p>');
});
it('moves newly added outcomes and normalizes optional edit fields', async () => {
  const root = await fixture();
  const saved = await saveRoadmapChanges(root, {
    roadmapRevision: 0,
    newOutcomes: [{ id: 'out-new', title: ' New ', description: ' Detail ' }],
    horizonMoves: { 'out-new': 'later' },
    itemEdits: { 'del-cli': { title: ' Updated ' } },
  });
  expect(saved.items.find((item) => item.id === 'out-new')).toMatchObject({
    title: 'New',
    description: 'Detail',
    horizon: 'later',
    status: 'proposed',
  });
  expect(saved.items.find((item) => item.id === 'del-cli')).toMatchObject({
    title: 'Updated',
    description: '',
  });
});
it('rejects invalid repository configuration before writing', async () => {
  const root = await fixture();
  await writeFile(
    join(root, '.roadmap/config.json'),
    JSON.stringify({ views: { default: 'missing' } }),
  );
  await expect(saveRoadmapChanges(root, { roadmapRevision: 0 })).rejects.toThrow(
    'Invalid repository configuration',
  );
  expect(await readFile(join(root, '.roadmap/roadmap.html'), 'utf8')).toBe('<p>original</p>');
});
it('rejects invalid current state', async () => {
  const root = await fixture();
  await writeFile(join(root, '.roadmap/roadmap.json'), '{}');
  await expect(saveRoadmapChanges(root, { roadmapRevision: 0 })).rejects.toThrow();
});
it('serves the roadmap and reports save success, conflicts and malformed requests over HTTP', async () => {
  const root = await fixture();
  const server = await startLocalServer({ root, port: 0 });
  try {
    for (const path of ['/', '/roadmap.html']) {
      const response = await fetch(server.url + path);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe('<p>original</p>');
    }
    expect(await (await fetch(server.url + '/health')).json()).toEqual({ ok: true });
    expect((await fetch(server.url + '/missing')).status).toBe(404);
    expect((await fetch(server.url + '/health', { method: 'PUT' })).status).toBe(404);
    const post = (body: string) => fetch(server.url + '/api/save', { method: 'POST', body });
    const saved = await post(
      JSON.stringify({ roadmapRevision: 0, horizonMoves: null, itemEdits: null }),
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true, revision: 1 });
    expect((await post(JSON.stringify({ roadmapRevision: 0 }))).status).toBe(409);
    expect((await post('{')).status).toBe(400);
    expect((await post(JSON.stringify({ padding: 'x'.repeat(66000) }))).status).toBe(400);
    expect((await fetch(server.url + '/roadmap.html')).status).toBe(200);
  } finally {
    await server.close();
  }
});
