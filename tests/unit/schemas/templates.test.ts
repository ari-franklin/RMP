import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/config/index.js';
import { validateTransitionReceipt } from '../../../src/schemas/index.js';

describe('JSON templates', () => {
  it('ships a valid configuration example', async () => {
    const text = await readFile(new URL('../../../templates/config.json', import.meta.url), 'utf8');

    expect(loadConfig(JSON.parse(text) as unknown).valid).toBe(true);
  });

  it('ships valid transition receipt examples', async () => {
    const text = await readFile(
      new URL('../../../templates/history.jsonl', import.meta.url),
      'utf8',
    );
    const receipts = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as unknown);

    expect(receipts).not.toHaveLength(0);
    for (const receipt of receipts) {
      expect(validateTransitionReceipt(receipt)).toEqual(
        expect.objectContaining({ valid: true, diagnostics: [] }),
      );
    }
  });
});
