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
    expect(plan.proposed).toContain('At the start of every task');
    expect(plan.proposed).toContain('Before the final response');
    expect(plan.proposed.match(/npx rmp sync/gu)).toHaveLength(2);
    expect(plan.proposed).toContain('show, see, or open the roadmap');
    expect(plan.proposed).toContain('`.roadmap/roadmap.html` in Codex');
    expect(plan.proposed).toContain('Do not search for it by filename');
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
      'Follow [protocol](./RMP.md). At the start of every task, run `npx rmp sync`,',
      'then read `ROADMAP.md` before planning or editing. Before the final response,',
      'run `npx rmp sync` again after meaningful work. Stay quiet on no-op maintenance;',
      'mention only material roadmap changes, decisions needed, or unresolved failures.',
      'When asked to show, see, or open the roadmap, open `.roadmap/roadmap.html` in Codex;',
      'do not search for it by filename or substitute a chat summary unless the user asks for one.',
      '',
    ].join('\n');
    await writeFile(join(root, 'AGENTS.md'), content);
    await writeFile(join(root, 'RMP.md'), '# Protocol\n');

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('configured');
    expect(plan.proposed).toBe(content);
  });

  it('repairs the legacy end-only clause with autonomous lifecycle instructions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-agents-'));
    const content = [
      '# Instructions',
      '',
      '## Roadmap maintenance',
      '',
      'Follow [RMP.md](./RMP.md) before finishing work that changes plans, delivery',
      'state, releases, deployments, or measured outcomes.',
      '',
    ].join('\n');
    await writeFile(join(root, 'AGENTS.md'), content);
    await writeFile(join(root, 'RMP.md'), '# Protocol\n');

    const plan = await planAgentsUpdate({ root });

    expect(plan.kind).toBe('repair');
    expect(plan.problem).toBe('Roadmap maintenance content is incomplete.');
    expect(plan.proposed).toContain('At the start of every task');
    expect(plan.proposed).toContain('Before the final response');
    expect(plan.proposed).toContain('`.roadmap/roadmap.html` in Codex');
    expect(plan.proposed).toContain('Do not search for it by filename');
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
