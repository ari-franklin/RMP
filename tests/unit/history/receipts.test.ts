import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ReceiptHistory } from '../../../src/history/index.js';
import type { TransitionReceipt } from '../../../src/types/index.js';

function receipt(id: string, timestamp: string): TransitionReceipt {
  return {
    id,
    schemaVersion: '1.0.0',
    itemId: 'del-work',
    previousStatus: 'active',
    newStatus: 'completed',
    timestamp,
    evidenceIds: ['ev-build'],
    evidenceClass: 'deterministic',
    authorizingRule: 'build passed',
    actor: 'test',
    disposition: 'automatic',
    extensions: {},
  };
}

describe('ReceiptHistory', () => {
  it('appends newline-delimited receipts in timestamp order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-history-'));
    const history = new ReceiptHistory(root, '.roadmap/history.jsonl');
    await history.append(receipt('tr-first', '2026-01-01T00:00:00.000Z'));
    await history.append(receipt('tr-second', '2026-01-02T00:00:00.000Z'));

    expect(await history.read()).toEqual([
      expect.objectContaining({ id: 'tr-first' }),
      expect.objectContaining({ id: 'tr-second' }),
    ]);
    expect(await readFile(join(root, '.roadmap', 'history.jsonl'), 'utf8')).toMatch(/\n$/);
  });

  it('treats duplicate receipt IDs as harmless no-ops', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-history-'));
    const history = new ReceiptHistory(root, '.roadmap/history.jsonl');
    const entry = receipt('tr-once', '2026-01-01T00:00:00.000Z');

    expect(await history.append(entry)).toBe(true);
    expect(await history.append(entry)).toBe(false);
    expect(await history.read()).toHaveLength(1);
  });

  it('rejects receipts older than the latest entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-history-'));
    const history = new ReceiptHistory(root, '.roadmap/history.jsonl');
    await history.append(receipt('tr-latest', '2026-01-02T00:00:00.000Z'));

    await expect(history.append(receipt('tr-old', '2026-01-01T00:00:00.000Z'))).rejects.toThrow(
      /chronological order/i,
    );
  });
});
