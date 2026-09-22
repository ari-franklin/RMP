import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCli } from '../../src/cli.js';

describe('runCli', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the package version', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    expect(await runCli(['--version'])).toBe(0);
    expect(write).toHaveBeenCalledWith('0.1.0\n');
  });

  it('prints help by default', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    expect(await runCli([])).toBe(0);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });
});
