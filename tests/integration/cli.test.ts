import { describe, expect, it, vi } from 'vitest';

import { executeCli, type CommandDependencies } from '../../src/commands/index.js';
import type { RunSyncOptions } from '../../src/core/index.js';
import type { InstallResult } from '../../src/install/index.js';

function dependencies(): CommandDependencies {
  return {
    install: vi.fn(() =>
      Promise.resolve({
        agentAwareness: 'enabled',
        agentsAction: 'created',
        installed: ['RMP.md'],
        updated: ['AGENTS.md'],
        unchanged: [],
        diagnostics: [],
        agentsPreview: '',
      } satisfies InstallResult),
    ),
    sync: vi.fn((options: RunSyncOptions) =>
      Promise.resolve({
        schemaVersion: '1.0.0',
        mode: options.mode,
        dryRun: options.dryRun ?? false,
        roadmap: { schemaVersion: '1.0.0', revision: 0 },
        evidence: [],
        receipts: [],
        recommendations: [],
        diagnostics: [],
        changedPaths: [],
      } as never),
    ),
    validate: vi.fn(() => Promise.resolve({ valid: true, diagnostics: [] })),
  };
}

describe('executeCli', () => {
  it.each([
    ['collect', 'collect'],
    ['reconcile', 'reconcile'],
    ['render', 'render'],
    ['sync', 'sync'],
  ] as const)('routes %s to orchestration mode %s', async (command, mode) => {
    const deps = dependencies();

    const result = await executeCli([command, '--root', '/repo'], deps);

    expect(result.exitCode).toBe(0);
    expect(deps.sync).toHaveBeenCalledWith(expect.objectContaining({ root: '/repo', mode }));
  });

  it('routes init options and validate', async () => {
    const deps = dependencies();

    expect(
      (
        await executeCli(
          ['init', '--root', '/repo', '--non-interactive', '--accept-agents-update'],
          deps,
        )
      ).exitCode,
    ).toBe(0);
    expect(deps.install).toHaveBeenCalledWith(
      expect.objectContaining({ root: '/repo', interactive: false, acceptAgentsUpdate: true }),
    );
    expect((await executeCli(['validate', '--root', '/repo'], deps)).exitCode).toBe(0);
  });

  it('emits one versioned object and no prose in JSON mode', async () => {
    const result = await executeCli(['collect', '--root', '/repo', '--json'], dependencies());

    expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: '1.0.0', command: 'collect' });
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('passes dry-run and render format options', async () => {
    const deps = dependencies();

    await executeCli(['sync', '--dry-run'], deps);
    await executeCli(['render', '--format', 'html'], deps);

    expect(deps.sync).toHaveBeenNthCalledWith(1, expect.objectContaining({ dryRun: true }));
    expect(deps.sync).toHaveBeenNthCalledWith(2, expect.objectContaining({ format: 'html' }));
  });

  it('uses exit 1 for operational failures and exit 2 for invalid usage', async () => {
    const deps = dependencies();
    vi.mocked(deps.sync).mockRejectedValueOnce(new Error('missing roadmap'));

    expect((await executeCli(['sync'], deps)).exitCode).toBe(1);
    expect((await executeCli(['unknown'], deps)).exitCode).toBe(2);
    expect((await executeCli(['render', '--format', 'pdf'], deps)).exitCode).toBe(2);
  });

  it('reports validation failures in human and JSON output modes', async () => {
    const deps = dependencies();
    vi.mocked(deps.validate).mockResolvedValue({
      valid: false,
      diagnostics: [{ message: 'relationship target is missing' }],
    });

    const human = await executeCli(['validate'], deps);
    const json = await executeCli(['validate', '--json'], deps);

    expect(human).toMatchObject({
      exitCode: 1,
      stdout: '',
      stderr: 'relationship target is missing\n',
    });
    expect(json.exitCode).toBe(1);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toMatchObject({
      command: 'validate',
      result: { valid: false },
    });
  });

  it('uses exit 2 when option parsing fails', async () => {
    const result = await executeCli(['sync', '--unsupported'], dependencies());

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Unknown option');
  });
});
