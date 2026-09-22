import { dirname } from 'node:path';

import { nodeFileSystem, type FileSystemPort } from '../utils/files.js';
import { resolveRepositoryPath } from '../utils/paths.js';

export class RepositoryStorage {
  public constructor(
    private readonly repositoryRoot: string,
    private readonly fileSystem: FileSystemPort = nodeFileSystem,
  ) {}

  public async readText(path: string): Promise<string> {
    const target = await resolveRepositoryPath(this.repositoryRoot, path, this.fileSystem);
    return this.fileSystem.readFile(target, 'utf8');
  }

  public async writeText(path: string, content: string): Promise<void> {
    const target = await resolveRepositoryPath(this.repositoryRoot, path, this.fileSystem);
    await this.fileSystem.mkdir(dirname(target), { recursive: true });
    await this.fileSystem.writeFile(target, content, 'utf8');
  }
}
