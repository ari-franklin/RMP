import { mkdtemp, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { withRepositoryOperation } from '../../../src/storage/operation-lock.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
afterEach(() => vi.mocked(rename).mockReset());
it.each(['EPERM', 'EACCES', 'EBUSY'])(
  'retries a transient %s sharing failure while publishing its own lock',
  async (code) => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-lock-publish-'));
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('file in use'), { code }));
    await expect(withRepositoryOperation(root, () => Promise.resolve(42))).resolves.toBe(42);
    await expect(withRepositoryOperation(root, () => Promise.resolve(43))).resolves.toBe(43);
  },
);
it('stops retrying within its deadline and cleans up the contender', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rmp-lock-publish-timeout-'));
  vi.mocked(rename).mockRejectedValue(Object.assign(new Error('file in use'), { code: 'EPERM' }));
  await expect(
    withRepositoryOperation(root, () => Promise.resolve(), { timeoutMs: 30 }),
  ).rejects.toThrow(/lock.*retry/i);
  vi.mocked(rename).mockReset();
  await expect(withRepositoryOperation(root, () => Promise.resolve(42))).resolves.toBe(42);
});
it('does not retry unrelated filesystem errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rmp-lock-publish-error-'));
  vi.mocked(rename).mockRejectedValueOnce(
    Object.assign(new Error('disk failure'), { code: 'EIO' }),
  );
  await expect(withRepositoryOperation(root, () => Promise.resolve())).rejects.toThrow(
    'disk failure',
  );
  expect(rename).toHaveBeenCalledTimes(1);
});
