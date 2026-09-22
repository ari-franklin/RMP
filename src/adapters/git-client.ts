import { execFile } from 'node:child_process';

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export type GitCommandExecutor = (
  file: string,
  args: string[],
  options: { shell: false },
) => Promise<GitCommandResult>;

const executeGit: GitCommandExecutor = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error instanceof Error ? error : new Error('Git command failed', { cause: error }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

export class GitClient {
  constructor(
    private readonly repositoryRoot: string,
    private readonly execute: GitCommandExecutor = executeGit,
  ) {}

  async run(args: string[]): Promise<string> {
    const result = await this.execute('git', ['-C', this.repositoryRoot, ...args], {
      shell: false,
    });
    return result.stdout.trimEnd();
  }
}
