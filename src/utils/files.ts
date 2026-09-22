import * as fs from 'node:fs/promises';

export interface FileSystemPort {
  access(path: string): Promise<void>;
  appendFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  lstat(path: string): Promise<{ isSymbolicLink(): boolean }>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  readdir(path: string): Promise<string[]>;
  realpath(path: string): Promise<string>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
}

export const nodeFileSystem: FileSystemPort = fs;

export async function pathExists(fileSystem: FileSystemPort, path: string): Promise<boolean> {
  try {
    await fileSystem.access(path);
    return true;
  } catch {
    return false;
  }
}
