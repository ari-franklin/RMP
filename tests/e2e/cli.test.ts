import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { createPackedFixture, runCli } from './package-fixture.js';

test('packed CLI installs valid assets and is idempotent', async () => {
  const fixture = await createPackedFixture();

  const first = await runCli(fixture, [
    'init',
    '--non-interactive',
    '--accept-agents-update',
    '--json',
  ]);
  const second = await runCli(fixture, [
    'init',
    '--non-interactive',
    '--accept-agents-update',
    '--json',
  ]);

  expect(JSON.parse(first.stdout)).toMatchObject({
    command: 'init',
    result: { agentAwareness: 'enabled', agentsAction: 'created' },
  });
  expect(JSON.parse(second.stdout)).toMatchObject({
    command: 'init',
    result: { agentAwareness: 'enabled', agentsAction: 'unchanged', installed: [] },
  });
  const agents = await readFile(join(fixture.root, 'AGENTS.md'), 'utf8');
  expect(agents).toContain('Follow [RMP.md](./RMP.md)');
  expect(agents).toContain('At the start of every task');
  expect(agents).toContain('Before the final response');
  expect((await runCli(fixture, ['validate', '--json'])).stdout).toContain('"valid":true');
  expect(
    await readFile(
      join(fixture.packageRoot, 'node_modules', 'roadmap-maintenance-protocol', 'README.md'),
      'utf8',
    ),
  ).toContain('Roadmap Maintenance Protocol');
  expect(
    await readFile(
      join(fixture.packageRoot, 'node_modules', 'roadmap-maintenance-protocol', 'LICENSE'),
      'utf8',
    ),
  ).toContain('MIT License');
});
