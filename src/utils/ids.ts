import { createHash } from 'node:crypto';

import { canonicalJson } from './json.js';

export function contentId(prefix: string, value: unknown): string {
  const digest = createHash('sha256').update(canonicalJson(value)).digest('hex');
  return `${prefix}-${digest}`;
}
