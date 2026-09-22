import { mkdtemp, mkdir, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveRepositoryPath } from '../../../src/utils/paths.js';

describe('resolveRepositoryPath', () => {
  it.each(['../outside.json', '..\\outside.json', 'nested/../../outside.json'])(
    'rejects traversal through %s',
    async (candidate) => {
      const root = await mkdtemp(join(tmpdir(), 'rmp-paths-'));

      await expect(resolveRepositoryPath(root, candidate)).rejects.toThrow(
        /outside repository root/i,
      );
    },
  );

  it('normalizes POSIX and Windows separators beneath the repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-paths-'));
    const realRoot = await realpath(root);

    await expect(resolveRepositoryPath(root, '.roadmap/history.jsonl')).resolves.toBe(
      join(realRoot, '.roadmap', 'history.jsonl'),
    );
    await expect(resolveRepositoryPath(root, '.roadmap\\history.jsonl')).resolves.toBe(
      join(realRoot, '.roadmap', 'history.jsonl'),
    );
  });

  it('rejects a target whose existing parent symlink escapes the repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-paths-'));
    const outside = await mkdtemp(join(tmpdir(), 'rmp-outside-'));
    await mkdir(join(root, '.roadmap'));
    await symlink(outside, join(root, '.roadmap', 'escape'));

    await expect(resolveRepositoryPath(root, '.roadmap/escape/roadmap.json')).rejects.toThrow(
      /symlink escapes repository root/i,
    );
  });
});
