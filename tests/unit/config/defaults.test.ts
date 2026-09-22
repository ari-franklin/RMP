import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { defaultConfig, loadConfig } from '../../../src/config/index.js';

describe('RMP configuration', () => {
  it('uses conservative default transition authority', () => {
    expect(defaultConfig.authority).toEqual({
      deterministic: 'automatic',
      corroborated: 'automatic',
      observedOutcome: 'automatic',
      inferred: 'recommendation',
      strategic: 'recommendation',
    });
  });

  it('loads a valid configuration over the defaults', () => {
    const result = loadConfig({ views: { default: 'delivery' } });

    expect(result.valid).toBe(true);
    expect(result.config?.views.default).toBe('delivery');
    expect(result.config?.authority.strategic).toBe('recommendation');
  });

  it('rejects unknown configuration fields with a JSON pointer', () => {
    const result = loadConfig({ surprise: true });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ pointer: '/surprise', keyword: 'additionalProperties' }),
    );
  });

  it('ships a protocol with operational agent instructions', async () => {
    const protocol = await readFile(new URL('../../../templates/RMP.md', import.meta.url), 'utf8');

    expect(protocol).toContain('## Agent lifecycle');
    expect(protocol).toContain('At the start of every task');
    expect(protocol).toContain('Before the final response after meaningful work');
    expect(protocol).toContain('Open `.roadmap/roadmap.html` in Codex');
    expect(protocol).toContain('## Authority boundaries');
    expect(protocol).toContain('## Evidence receipts');
    expect(protocol).toContain('## Final response');
  });
});
