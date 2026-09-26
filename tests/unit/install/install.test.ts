import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { installRmp } from '../../../src/install/index.js';

describe('installRmp', () => {
  it('names a new roadmap after the project directory', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rmp-install-'));
    const root = join(parent, 'sample-project');

    await installRmp({ root, interactive: false });

    const roadmap = JSON.parse(await readFile(join(root, '.roadmap/roadmap.json'), 'utf8')) as {
      title: string;
    };
    expect(roadmap.title).toBe('Sample Project Roadmap');
  });
});
