import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { createPackedFixture, readRoadmap, runCli } from './package-fixture.js';

test('completed plan advances its delivery item with an audit receipt', async () => {
  const fixture = await createPackedFixture();
  await runCli(fixture, ['init', '--non-interactive', '--accept-agents-update']);
  await mkdir(join(fixture.root, 'plans'), { recursive: true });
  await writeFile(
    join(fixture.root, 'plans', 'completed.md'),
    '# Completed phase\n\nRMP-Item: del-cli\nRMP-Status: completed\n',
  );

  const result = JSON.parse((await runCli(fixture, ['sync', '--json'])).stdout) as {
    result: { changedPaths: string[] };
  };
  const roadmap = await readRoadmap(fixture.root);
  const items = roadmap.items as Array<{ id: string; status: string }>;

  expect(items.find((item) => item.id === 'del-cli')?.status).toBe('completed');
  expect(result.result.changedPaths).toContain('.roadmap/history.jsonl');
  expect(await readFile(join(fixture.root, '.roadmap', 'history.jsonl'), 'utf8')).toContain(
    '"itemId":"del-cli"',
  );
  expect(await readFile(join(fixture.root, 'ROADMAP.md'), 'utf8')).toContain('Revision: 1');
  expect(await readFile(join(fixture.root, '.roadmap', 'roadmap.html'), 'utf8')).toContain(
    'data-revision="1"',
  );
});
