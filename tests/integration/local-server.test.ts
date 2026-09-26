import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { saveRoadmapChanges } from '../../src/server/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('local roadmap server', () => {
  it('saves horizon and delivery-window changes transactionally', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-server-'));
    roots.push(root);
    await mkdir(join(root, '.roadmap'), { recursive: true });
    const template = await readFile(join(process.cwd(), 'templates', 'roadmap.json'), 'utf8');
    await writeFile(join(root, '.roadmap', 'roadmap.json'), template);
    await writeFile(join(root, '.roadmap', 'roadmap.html'), '<p>initial</p>');

    await saveRoadmapChanges(root, {
      roadmapRevision: 0,
      horizonMoves: { 'del-cli': 'next' },
      deliveryWindows: ['This month', 'Next month', 'Later'],
      itemEdits: {
        'out-adoption': { title: 'Grow successful adoption', description: 'Prove repeat use.' },
      },
      newOutcomes: [
        { id: 'out-retention', title: 'Improve retention', description: '', horizon: 'next' },
      ],
    });
    const saved = JSON.parse(await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8')) as {
      revision: number;
      items: Array<{
        id: string;
        title: string;
        horizon: string;
        extensions: Record<string, unknown>;
      }>;
      extensions: Record<string, { deliveryWindows: string[] }>;
    };
    expect(saved.revision).toBe(1);
    expect(saved.items.find((item) => item.id === 'del-cli')?.horizon).toBe('next');
    expect(saved.items.find((item) => item.id === 'out-adoption')?.title).toBe(
      'Grow successful adoption',
    );
    expect(saved.items.find((item) => item.id === 'out-retention')?.horizon).toBe('next');
    expect(saved.items.find((item) => item.id === 'out-retention')?.extensions).toEqual({
      'rmp/workflow': { artifacts: [] },
    });
    expect(saved.extensions['rmp/view']?.deliveryWindows).toEqual([
      'This month',
      'Next month',
      'Later',
    ]);
    expect(await readFile(join(root, 'ROADMAP.md'), 'utf8')).toContain('Starter roadmap');
    expect(await readFile(join(root, '.roadmap', 'roadmap.html'), 'utf8')).toContain('This month');
  });

  it('rejects stale saves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-server-'));
    roots.push(root);
    await mkdir(join(root, '.roadmap'), { recursive: true });
    await writeFile(
      join(root, '.roadmap', 'roadmap.json'),
      await readFile(join(process.cwd(), 'templates', 'roadmap.json'), 'utf8'),
    );
    await writeFile(join(root, '.roadmap', 'roadmap.html'), '<p>initial</p>');
    await expect(
      saveRoadmapChanges(root, { roadmapRevision: 99, horizonMoves: {} }),
    ).rejects.toThrow('reload before saving');
  });
});
