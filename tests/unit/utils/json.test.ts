import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../../../src/utils/json.js';
import { contentId } from '../../../src/utils/ids.js';

describe('canonical JSON', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [{ b: 2, a: 1 }] })).toBe(
      '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "list": [\n    {\n      "a": 1,\n      "b": 2\n    }\n  ],\n  "z": 1\n}\n',
    );
  });

  it('creates stable SHA-256 content identifiers', () => {
    expect(contentId('rec', { b: 2, a: 1 })).toBe(contentId('rec', { a: 1, b: 2 }));
    expect(contentId('rec', { a: 1 })).toMatch(/^rec-[a-f0-9]{64}$/);
  });
});
