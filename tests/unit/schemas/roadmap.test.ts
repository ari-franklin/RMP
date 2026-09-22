import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { validateRoadmap } from '../../../src/schemas/index.js';

const templateUrl = new URL('../../../templates/roadmap.json', import.meta.url);

async function starterRoadmap(): Promise<unknown> {
  return JSON.parse(await readFile(templateUrl, 'utf8')) as unknown;
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`Missing test fixture: ${description}`);
  }
  return value;
}

describe('validateRoadmap', () => {
  it('accepts the starter roadmap and its linked records', async () => {
    const roadmap = await starterRoadmap();

    expect(validateRoadmap(roadmap)).toEqual(
      expect.objectContaining({ valid: true, diagnostics: [], value: roadmap }),
    );
  });

  it('rejects duplicate IDs', async () => {
    const roadmap = (await starterRoadmap()) as { items: Array<Record<string, unknown>> };
    roadmap.items.push({ ...required(roadmap.items[0], 'first roadmap item') });

    const result = validateRoadmap(roadmap);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ pointer: '/items/4/id', keyword: 'uniqueId' }),
    );
  });

  it('rejects dangling relationships', async () => {
    const roadmap = (await starterRoadmap()) as {
      relationships: Array<Record<string, unknown>>;
    };
    required(roadmap.relationships[0], 'first relationship').to = 'out-missing';

    const result = validateRoadmap(roadmap);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ pointer: '/relationships/0/to', keyword: 'reference' }),
    );
  });

  it('rejects unsupported state versions', async () => {
    const roadmap = (await starterRoadmap()) as Record<string, unknown>;
    roadmap.schemaVersion = '2.0.0';

    const result = validateRoadmap(roadmap);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ pointer: '/schemaVersion', keyword: 'const' }),
    );
  });

  it('rejects exact dates without supporting evidence', async () => {
    const roadmap = (await starterRoadmap()) as { items: Array<Record<string, unknown>> };
    const release = required(
      roadmap.items.find((item) => item.kind === 'release'),
      'release item',
    );
    release.schedule = { precision: 'exact', date: '2026-10-01', evidenceIds: [] };

    const result = validateRoadmap(roadmap);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ keyword: 'scheduleEvidence' }),
    );
  });

  it('rejects completed outcomes without a successful measurement', async () => {
    const roadmap = (await starterRoadmap()) as { items: Array<Record<string, unknown>> };
    const outcome = required(
      roadmap.items.find((item) => item.kind === 'outcome'),
      'outcome item',
    );
    outcome.status = 'completed';

    const result = validateRoadmap(roadmap);

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ keyword: 'outcomeSignal' }),
    );
  });
});
