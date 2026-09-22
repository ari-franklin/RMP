import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { nodeFileSystem, pathExists, type FileSystemPort } from './files.js';

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..');
}

export async function resolveRepositoryPath(
  repositoryRoot: string,
  requestedPath: string,
  fileSystem: FileSystemPort = nodeFileSystem,
): Promise<string> {
  const normalizedRequest = requestedPath.replaceAll('\\', '/');
  if (isAbsolute(normalizedRequest)) throw new Error('Path is outside repository root');

  const realRoot = await fileSystem.realpath(repositoryRoot);
  const target = resolve(realRoot, normalizedRequest);
  if (!isContained(realRoot, target)) throw new Error('Path is outside repository root');

  if (await pathExists(fileSystem, target)) {
    if ((await fileSystem.lstat(target)).isSymbolicLink()) {
      throw new Error('Refusing to follow target symlink');
    }
    const realTarget = await fileSystem.realpath(target);
    if (!isContained(realRoot, realTarget)) throw new Error('Symlink escapes repository root');
    return target;
  }

  let ancestor = dirname(target);
  while (!(await pathExists(fileSystem, ancestor)) && ancestor !== realRoot) {
    ancestor = dirname(ancestor);
  }
  const realAncestor = await fileSystem.realpath(ancestor);
  if (!isContained(realRoot, realAncestor)) throw new Error('Symlink escapes repository root');

  return target;
}
