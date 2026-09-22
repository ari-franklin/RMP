import { describe, expect, it, vi } from 'vitest';

import { GitClient } from '../../../src/adapters/index.js';

describe('GitClient', () => {
  it('invokes Git with argument arrays and no shell', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: 'main\n', stderr: '' });
    const client = new GitClient('/repo; touch /tmp/unsafe', exec);

    await expect(client.run(['branch', '--show-current'])).resolves.toBe('main');
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['-C', '/repo; touch /tmp/unsafe', 'branch', '--show-current'],
      expect.objectContaining({ shell: false }),
    );
  });
});
