import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { createPackedFixture, readRoadmap, runCli } from './package-fixture.js';

test('release evidence completes the release without claiming outcome success', async () => {
  const fixture = await createPackedFixture();
  await runCli(fixture, ['init', '--non-interactive', '--accept-agents-update']);
  await mkdir(join(fixture.root, '.roadmap', 'releases'), { recursive: true });
  await writeFile(
    join(fixture.root, '.roadmap', 'releases', 'first-release.json'),
    `${JSON.stringify({
      id: 'release-1',
      itemId: 'rel-first',
      tag: 'v0.1.0',
      releasedAt: '2026-09-21T18:00:00.000Z',
    })}\n`,
  );

  await runCli(fixture, ['sync', '--json']);
  const roadmap = await readRoadmap(fixture.root);
  const items = roadmap.items as Array<{ id: string; status: string }>;

  expect(items.find((item) => item.id === 'rel-first')?.status).toBe('completed');
  expect(items.find((item) => item.id === 'out-adoption')?.status).toBe('active');
});
