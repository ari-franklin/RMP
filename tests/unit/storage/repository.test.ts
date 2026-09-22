import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RepositoryStorage } from '../../../src/storage/index.js';

describe('RepositoryStorage', () => {
  it('reads and writes only repository-contained targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-repository-'));
    const storage = new RepositoryStorage(root);
    await storage.writeText('.roadmap/state.txt', 'ready');

    await expect(storage.readText('.roadmap/state.txt')).resolves.toBe('ready');
    await expect(storage.writeText('../outside.txt', 'nope')).rejects.toThrow(
      /outside repository root/i,
    );
  });

  it('does not follow an existing target symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-repository-'));
    const outside = await mkdtemp(join(tmpdir(), 'rmp-repository-outside-'));
    await mkdir(join(root, '.roadmap'));
    await writeFile(join(outside, 'state.txt'), 'safe');
    await symlink(join(outside, 'state.txt'), join(root, '.roadmap', 'state.txt'));

    const storage = new RepositoryStorage(root);
    await expect(storage.writeText('.roadmap/state.txt', 'changed')).rejects.toThrow(/symlink/i);
    await expect(readFile(join(outside, 'state.txt'), 'utf8')).resolves.toBe('safe');
  });
});
