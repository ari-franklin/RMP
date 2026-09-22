import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { installRmp, type InstallPrompt } from '../../src/install/index.js';
import { validateRoadmap } from '../../src/schemas/index.js';

async function repository(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'rmp-install-'));
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

describe('installRmp', () => {
  it('installs valid protocol assets and an approved AGENTS.md update', async () => {
    const root = await repository();
    const prompt: InstallPrompt = vi.fn(({ preview }) => {
      expect(preview).toContain('+++ AGENTS.md');
      return Promise.resolve(true);
    });

    const result = await installRmp({ root, prompt });

    expect(result.agentAwareness).toBe('enabled');
    expect(result.agentsAction).toBe('created');
    expect(prompt).toHaveBeenCalledOnce();
    expect(await exists(join(root, 'RMP.md'))).toBe(true);
    expect(await exists(join(root, '.roadmap', 'schema.json'))).toBe(true);
    expect(await exists(join(root, '.roadmap', 'config.json'))).toBe(true);
    expect(await exists(join(root, '.roadmap', 'history.jsonl'))).toBe(true);
    expect(await exists(join(root, '.roadmap', 'adapters', 'README.md'))).toBe(true);

    const roadmap: unknown = JSON.parse(
      await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8'),
    );
    expect(validateRoadmap(roadmap)).toMatchObject({ valid: true });
  });

  it('preserves existing instructions after interactive approval', async () => {
    const root = await repository();
    const original = '# Team rules\n\nDo not rewrite this line.\n';
    await writeFile(join(root, 'AGENTS.md'), original);
    const prompt: InstallPrompt = vi.fn(() => Promise.resolve(true));

    const result = await installRmp({ root, prompt });
    const installed = await readFile(join(root, 'AGENTS.md'), 'utf8');

    expect(result.agentsAction).toBe('updated');
    expect(installed.startsWith(original.trimEnd())).toBe(true);
    expect(installed).toContain('## Roadmap maintenance');
  });

  it('installs other assets after a declined AGENTS.md update', async () => {
    const root = await repository();
    const prompt: InstallPrompt = vi.fn(() => Promise.resolve(false));

    const result = await installRmp({ root, prompt });

    expect(result.agentAwareness).toBe('disabled');
    expect(result.agentsAction).toBe('declined');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'agentAwareness.disabled' }),
    );
    expect(await exists(join(root, 'AGENTS.md'))).toBe(false);
    expect(await exists(join(root, 'RMP.md'))).toBe(true);
  });

  it('does not edit AGENTS.md in non-interactive mode without explicit authorization', async () => {
    const root = await repository();

    const result = await installRmp({ root, interactive: false });

    expect(result.agentsAction).toBe('authorization-required');
    expect(result.agentAwareness).toBe('disabled');
    expect(await exists(join(root, 'AGENTS.md'))).toBe(false);
    expect(await exists(join(root, '.roadmap', 'roadmap.json'))).toBe(true);
  });

  it('edits AGENTS.md in non-interactive mode with explicit authorization', async () => {
    const root = await repository();

    const result = await installRmp({
      root,
      interactive: false,
      acceptAgentsUpdate: true,
    });

    expect(result.agentsAction).toBe('created');
    expect(result.agentAwareness).toBe('enabled');
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain('## Roadmap maintenance');
  });

  it('is a complete no-op on a second run', async () => {
    const root = await repository();
    await installRmp({ root, interactive: false, acceptAgentsUpdate: true });
    const paths = [
      'AGENTS.md',
      'RMP.md',
      '.roadmap/roadmap.json',
      '.roadmap/schema.json',
      '.roadmap/config.json',
      '.roadmap/history.jsonl',
      '.roadmap/adapters/README.md',
    ];
    const before = await Promise.all(paths.map((path) => readFile(join(root, path), 'utf8')));

    const result = await installRmp({ root, interactive: false });
    const after = await Promise.all(paths.map((path) => readFile(join(root, path), 'utf8')));

    expect(result.agentsAction).toBe('unchanged');
    expect(result.installed).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(after).toEqual(before);
  });
});
