import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RepositoryTransaction, type TransactionFault } from '../../../src/storage/index.js';

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rmp-transaction-'));
  await writeFile(join(root, 'a.txt'), 'old-a');
  await writeFile(join(root, 'b.txt'), 'old-b');
  return root;
}

describe('RepositoryTransaction', () => {
  it('replaces multiple files as one successful transaction', async () => {
    const root = await fixture();
    const transaction = new RepositoryTransaction(root);

    await transaction.commit([
      { path: 'a.txt', content: 'new-a' },
      { path: 'b.txt', content: 'new-b' },
    ]);

    await expect(readFile(join(root, 'a.txt'), 'utf8')).resolves.toBe('new-a');
    await expect(readFile(join(root, 'b.txt'), 'utf8')).resolves.toBe('new-b');
  });

  it('does not alter files when candidate validation fails', async () => {
    const root = await fixture();
    const transaction = new RepositoryTransaction(root);

    await expect(
      transaction.commit([{ path: 'a.txt', content: 'new-a' }], {
        validate: () => Promise.reject(new Error('invalid candidate')),
      }),
    ).rejects.toThrow('invalid candidate');
    await expect(readFile(join(root, 'a.txt'), 'utf8')).resolves.toBe('old-a');
  });

  it.each(['after-stage', 'after-backup', 'after-replace'] satisfies TransactionFault[])(
    'rolls back after a simulated %s failure',
    async (fault) => {
      const root = await fixture();
      const transaction = new RepositoryTransaction(root, {
        fault: (point) => {
          if (point === fault) throw new Error(`simulated ${fault}`);
        },
      });

      await expect(
        transaction.commit([
          { path: 'a.txt', content: 'new-a' },
          { path: 'b.txt', content: 'new-b' },
        ]),
      ).rejects.toThrow(`simulated ${fault}`);
      await expect(readFile(join(root, 'a.txt'), 'utf8')).resolves.toBe('old-a');
      await expect(readFile(join(root, 'b.txt'), 'utf8')).resolves.toBe('old-b');
    },
  );

  it('recovers an interrupted transaction from its manifest', async () => {
    const root = await fixture();
    const interrupted = new RepositoryTransaction(root, {
      fault: (point) => {
        if (point === 'after-replace') throw new Error('process interrupted');
      },
      preserveOnFailure: true,
    });
    await expect(interrupted.commit([{ path: 'a.txt', content: 'new-a' }])).rejects.toThrow(
      'process interrupted',
    );

    const recovered = new RepositoryTransaction(root);
    await recovered.recover();

    await expect(readFile(join(root, 'a.txt'), 'utf8')).resolves.toBe('old-a');
    await expect(access(join(root, '.rmp-transactions'))).rejects.toThrow();
  });

  it('serializes concurrent writes for the same repository root', async () => {
    const root = await fixture();
    const events: string[] = [];
    const first = new RepositoryTransaction(root, {
      fault: async (point) => {
        if (point === 'after-stage') {
          events.push('first-staged');
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      },
    });
    const second = new RepositoryTransaction(root, {
      fault: (point) => {
        if (point === 'after-stage') events.push('second-staged');
      },
    });

    await Promise.all([
      first.commit([{ path: 'a.txt', content: 'first' }]),
      second.commit([{ path: 'a.txt', content: 'second' }]),
    ]);

    expect(events).toEqual(['first-staged', 'second-staged']);
    expect(await readFile(join(root, 'a.txt'), 'utf8')).toBe('second');
  });
});
