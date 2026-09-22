import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('package bootstrap', () => {
  it('builds an executable CLI that reports its version', () => {
    execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
    const output = execFileSync(process.execPath, ['dist/cli.js', '--version'], {
      encoding: 'utf8',
    });

    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
