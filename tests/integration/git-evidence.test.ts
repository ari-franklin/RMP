import { describe, expect, it } from 'vitest';

import { GitEvidenceAdapter, type GitCommandExecutor } from '../../src/adapters/index.js';

function scriptedGit(outputs: Record<string, string | Error>): GitCommandExecutor {
  return (_file, args) => {
    const command = args.slice(2).join(' ');
    const output = outputs[command] ?? '';
    if (output instanceof Error) throw output;
    return Promise.resolve({ stdout: output, stderr: '' });
  };
}

describe('GitEvidenceAdapter', () => {
  it('normalizes branch, merge, tag, commit, and changed-file evidence', async () => {
    const adapter = new GitEvidenceAdapter(
      scriptedGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'branch --show-current': 'feature/del-cli\n',
        'log -n 50 --format=%H%x1f%cI%x1f%P%x1f%s': [
          'abc123\u001f2026-09-20T10:00:00Z\u001fparent1 parent2\u001fMerge plan del-cli',
          'def456\u001f2026-09-20T09:00:00Z\u001fparent1\u001fImplement del-cli',
        ].join('\n'),
        'tag --points-at HEAD': 'v1.0.0\n',
        'status --short': ' M src/cli.ts\n?? tests/new.test.ts\n',
      }),
    );

    const result = await adapter.collect({ repositoryRoot: '/repo' });

    expect(result.evidence.map((event) => [event.kind, event.class])).toEqual([
      ['branch', 'inferred'],
      ['commit', 'inferred'],
      ['merge', 'corroborated'],
      ['tag', 'deterministic'],
      ['changedFiles', 'inferred'],
    ]);
    expect(result.evidence.find((event) => event.kind === 'changedFiles')?.data.files).toEqual([
      'src/cli.ts',
      'tests/new.test.ts',
    ]);
  });

  it('returns an isolated diagnostic outside a Git repository', async () => {
    const adapter = new GitEvidenceAdapter(
      scriptedGit({ 'rev-parse --is-inside-work-tree': new Error('not a git repository') }),
    );

    const result = await adapter.collect({ repositoryRoot: '/plain-directory' });

    expect(result.evidence).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ provider: 'git', code: 'not-a-repository' }),
    );
  });

  it('deduplicates repeated immutable Git events', async () => {
    const line = 'abc123\u001f2026-09-20T10:00:00Z\u001fparent1\u001fImplement del-cli';
    const adapter = new GitEvidenceAdapter(
      scriptedGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'branch --show-current': '',
        'log -n 50 --format=%H%x1f%cI%x1f%P%x1f%s': `${line}\n${line}\n`,
        'tag --points-at HEAD': '',
        'status --short': '',
      }),
    );

    const result = await adapter.collect({ repositoryRoot: '/repo' });

    expect(result.evidence.filter((event) => event.kind === 'commit')).toHaveLength(1);
  });
});
