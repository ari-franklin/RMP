import { withRepositoryOperation } from './operation-lock.js';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

import { nodeFileSystem, pathExists, type FileSystemPort } from '../utils/files.js';
import { canonicalJson } from '../utils/json.js';
import { resolveRepositoryPath } from '../utils/paths.js';

export type TransactionFault =
  | 'after-stage'
  | 'after-backup'
  | 'after-replace'
  | 'after-manifest'
  | 'after-backup-file'
  | 'before-replace'
  | 'after-commit';

export interface TransactionWrite {
  path: string;
  content: string;
}

interface ManifestEntry {
  path: string;
  existed: boolean;
}

interface TransactionManifest {
  entries: ManifestEntry[];
}

export interface TransactionOptions {
  fileSystem?: FileSystemPort;
  fault?: (point: TransactionFault) => void | Promise<void>;
  preserveOnFailure?: boolean;
}

export interface CommitOptions {
  validate?: (writes: readonly TransactionWrite[]) => void | Promise<void>;
}

const repositoryQueues = new Map<string, Promise<void>>();
let queueRegistration = Promise.resolve();

export class RepositoryTransaction {
  private readonly fileSystem: FileSystemPort;

  public constructor(
    private readonly repositoryRoot: string,
    private readonly options: TransactionOptions = {},
  ) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
  }

  public async commit(
    writes: readonly TransactionWrite[],
    options: CommitOptions = {},
  ): Promise<void> {
    await withRepositoryOperation(this.repositoryRoot, () =>
      this.serialized(async () => {
        await this.recoverUnlocked();
        await this.commitUnlocked(writes, options);
      }),
    );
  }

  public async recover(): Promise<void> {
    await withRepositoryOperation(this.repositoryRoot, () =>
      this.serialized(() => this.recoverUnlocked()),
    );
  }

  private async serialized(operation: () => Promise<void>): Promise<void> {
    let key: string | undefined;
    let current: Promise<void> | undefined;
    const registration = queueRegistration.then(async () => {
      key = await this.fileSystem.realpath(this.repositoryRoot);
      const previous = repositoryQueues.get(key) ?? Promise.resolve();
      current = previous.catch(() => undefined).then(operation);
      repositoryQueues.set(key, current);
    });
    queueRegistration = registration.catch(() => undefined);
    await registration;

    if (key === undefined || current === undefined) {
      throw new Error('Failed to register repository transaction');
    }

    try {
      await current;
    } finally {
      if (repositoryQueues.get(key) === current) repositoryQueues.delete(key);
    }
  }

  private async commitUnlocked(
    writes: readonly TransactionWrite[],
    options: CommitOptions,
  ): Promise<void> {
    const targets = await Promise.all(
      writes.map(async (write) => ({
        ...write,
        target: await resolveRepositoryPath(this.repositoryRoot, write.path, this.fileSystem),
      })),
    );
    const transactionRoot = join(
      await this.fileSystem.realpath(this.repositoryRoot),
      '.rmp-transactions',
      randomUUID(),
    );
    const stageRoot = join(transactionRoot, 'stage');
    const backupRoot = join(transactionRoot, 'backup');
    const manifestPath = join(transactionRoot, 'manifest.json');
    const manifest: TransactionManifest = { entries: [] };
    let committed = false;

    try {
      await this.fileSystem.mkdir(stageRoot, { recursive: true });
      for (const write of targets) {
        const stagePath = join(stageRoot, write.path.replaceAll('\\', '/'));
        await this.fileSystem.mkdir(dirname(stagePath), { recursive: true });
        await this.fileSystem.writeFile(stagePath, write.content, 'utf8');
      }
      await options.validate?.(writes);
      await this.options.fault?.('after-stage');

      for (const write of targets)
        manifest.entries.push({
          path: write.path.replaceAll('\\', '/'),
          existed: await pathExists(this.fileSystem, write.target),
        });
      await this.fileSystem.writeFile(manifestPath, canonicalJson(manifest), 'utf8');
      await this.options.fault?.('after-manifest');
      for (const entry of manifest.entries) {
        if (entry.existed) {
          const backupPath = join(backupRoot, entry.path);
          await this.fileSystem.mkdir(dirname(backupPath), { recursive: true });
          await this.fileSystem.rename(join(this.repositoryRoot, entry.path), backupPath);
        }
        await this.options.fault?.('after-backup-file');
      }
      await this.options.fault?.('after-backup');

      for (const write of targets) {
        const stagePath = join(stageRoot, write.path.replaceAll('\\', '/'));
        await this.fileSystem.mkdir(dirname(write.target), { recursive: true });
        await this.options.fault?.('before-replace');
        await this.fileSystem.rename(stagePath, write.target);
        await this.options.fault?.('after-replace');
      }
      const committedRoot = `${transactionRoot}.committed`;
      await this.fileSystem.rename(transactionRoot, committedRoot);
      committed = true;
      await this.options.fault?.('after-commit');
      await this.fileSystem.rm(committedRoot, { recursive: true, force: true });
      await this.removeTransactionContainerIfEmpty();
    } catch (error) {
      if (!this.options.preserveOnFailure && !committed) {
        await this.rollback(transactionRoot, manifest);
      }
      throw error;
    }
  }

  private async recoverUnlocked(): Promise<void> {
    const container = await resolveRepositoryPath(
      this.repositoryRoot,
      '.rmp-transactions',
      this.fileSystem,
    );
    if (!(await pathExists(this.fileSystem, container))) return;

    for (const directory of await this.fileSystem.readdir(container)) {
      const transactionRoot = await resolveRepositoryPath(
        this.repositoryRoot,
        `.rmp-transactions/${directory}`,
        this.fileSystem,
      );
      const manifestPath = await resolveRepositoryPath(
        this.repositoryRoot,
        `.rmp-transactions/${directory}/manifest.json`,
        this.fileSystem,
      );
      if (directory.endsWith('.committed') || !(await pathExists(this.fileSystem, manifestPath))) {
        await this.fileSystem.rm(transactionRoot, { recursive: true, force: true });
        continue;
      }
      const manifest = JSON.parse(
        await this.fileSystem.readFile(manifestPath, 'utf8'),
      ) as TransactionManifest;
      if (!Array.isArray(manifest.entries)) throw new Error('Invalid recovery manifest');
      for (const entry of manifest.entries) {
        if (
          typeof entry.path !== 'string' ||
          typeof entry.existed !== 'boolean' ||
          entry.path.startsWith('.rmp-transactions') ||
          entry.path
            .replaceAll('\\', '/')
            .split('/')
            .some((part) => part === '' || part === '.' || part === '..')
        )
          throw new Error('Invalid recovery manifest');
        await resolveRepositoryPath(this.repositoryRoot, entry.path, this.fileSystem);
      }
      await this.rollback(transactionRoot, manifest);
    }
    await this.removeTransactionContainerIfEmpty();
  }

  private async rollback(transactionRoot: string, manifest: TransactionManifest): Promise<void> {
    const root = await this.fileSystem.realpath(this.repositoryRoot);
    for (const entry of [...manifest.entries].reverse()) {
      const target = join(root, entry.path);
      const backup = join(transactionRoot, 'backup', entry.path);
      const hasBackup = await pathExists(this.fileSystem, backup);
      // No backup means this original was never moved, or already restored.
      if (entry.existed && !hasBackup) continue;
      if (await pathExists(this.fileSystem, target))
        await this.fileSystem.rm(target, { recursive: true, force: true });
      if (hasBackup) {
        await this.fileSystem.mkdir(dirname(target), { recursive: true });
        await this.fileSystem.rename(backup, target);
      }
    }
    await this.fileSystem.rm(transactionRoot, { recursive: true, force: true });
    await this.removeTransactionContainerIfEmpty();
  }

  private async removeTransactionContainerIfEmpty(): Promise<void> {
    const root = await this.fileSystem.realpath(this.repositoryRoot);
    const container = join(root, '.rmp-transactions');
    if (
      (await pathExists(this.fileSystem, container)) &&
      (await this.fileSystem.readdir(container)).length === 0
    ) {
      await this.fileSystem.rm(container, { recursive: true, force: true });
    }
  }
}
