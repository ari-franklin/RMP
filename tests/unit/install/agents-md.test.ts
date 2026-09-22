import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { planAgentsUpdate } from '../../../src/install/index.js';

const fixtureRoot = new URL('../../fixtures/install/', import.meta.url);

async function fixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'rmp-agents-'));
  await cp(new URL(`${name}/`, fixtureRoot), root, { recursive: true });
  return root;
}

describe('planAgentsUpdate', () => {
  it('proposes a minimal AGENTS.md when the file is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-agents-'));

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('create');
    expect(plan.current).toBeUndefined();
    expect(plan.proposed).toContain('## Roadmap maintenance');
    expect(plan.proposed).toContain('[RMP.md](./RMP.md)');
    expect(plan.preview).toContain('+++ AGENTS.md');
  });

  it('appends the clause without changing existing instructions', async () => {
    const root = await fixture('existing');
    const current = await readFile(join(root, 'AGENTS.md'), 'utf8');

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('append');
    expect(plan.proposed).toBe(`${current.trimEnd()}\n\n${plan.clause}`);
    expect(plan.preview).toContain(' Keep existing guidance exactly as written.');
    expect(plan.preview).toContain('+## Roadmap maintenance');
  });

  it('recognizes an activated clause by its resolved custom protocol link', async () => {
    const root = await fixture('customized');
    const current = await readFile(join(root, 'AGENTS.md'), 'utf8');

    const plan = await planAgentsUpdate({ root });

    expect(plan).toMatchObject({ kind: 'configured', current, proposed: current });
    expect(plan.preview).toBe('');
  });

  it('recognizes normalized activation heading and content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-agents-'));
    const content = [
      '# Instructions',
      '',
      '##   ROADMAP   MAINTENANCE',
      '',
      'Follow [protocol](./RMP.md) before finishing work that changes plans,',
      'delivery state, releases, deployments, or measured outcomes.',
      '',
    ].join('\n');
    await writeFile(join(root, 'AGENTS.md'), content);
    await writeFile(join(root, 'RMP.md'), '# Protocol\n');

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('configured');
    expect(plan.proposed).toBe(content);
  });

  it('repairs a broken activation block instead of adding a duplicate', async () => {
    const root = await fixture('broken');

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('repair');
    expect(plan.problem).toContain('does not resolve');
    expect(plan.proposed.match(/## Roadmap maintenance/giu)).toHaveLength(1);
    expect(plan.proposed).toContain('[RMP.md](./RMP.md)');
    expect(plan.proposed).not.toContain('./missing/RMP.md');
  });

  it('replaces an ambiguous activation block with one canonical clause', async () => {
    const root = await fixture('ambiguous');

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('repair');
    expect(plan.problem).toContain('multiple protocol links');
    expect(plan.proposed.match(/## Roadmap maintenance/giu)).toHaveLength(1);
    expect(plan.proposed).not.toContain('first protocol');
    expect(plan.proposed).not.toContain('second protocol');
  });
});
