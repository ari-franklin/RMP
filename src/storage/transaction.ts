import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

import { nodeFileSystem, pathExists, type FileSystemPort } from '../utils/files.js';
import { canonicalJson } from '../utils/json.js';
import { resolveRepositoryPath } from '../utils/paths.js';

export type TransactionFault = 'after-stage' | 'after-backup' | 'after-replace';

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
    await this.serialized(async () => {
      await this.recoverUnlocked();
      await this.commitUnlocked(writes, options);
    });
  }

  public async recover(): Promise<void> {
    await this.serialized(() => this.recoverUnlocked());
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

    try {
      await this.fileSystem.mkdir(stageRoot, { recursive: true });
      for (const write of targets) {
        const stagePath = join(stageRoot, write.path.replaceAll('\\', '/'));
        await this.fileSystem.mkdir(dirname(stagePath), { recursive: true });
        await this.fileSystem.writeFile(stagePath, write.content, 'utf8');
      }
      await options.validate?.(writes);
      await this.options.fault?.('after-stage');

      for (const write of targets) {
        const existed = await pathExists(this.fileSystem, write.target);
        manifest.entries.push({ path: write.path.replaceAll('\\', '/'), existed });
        if (existed) {
          const backupPath = join(backupRoot, write.path.replaceAll('\\', '/'));
          await this.fileSystem.mkdir(dirname(backupPath), { recursive: true });
          await this.fileSystem.rename(write.target, backupPath);
        }
      }
      await this.fileSystem.writeFile(manifestPath, canonicalJson(manifest), 'utf8');
      await this.options.fault?.('after-backup');

      for (const write of targets) {
        const stagePath = join(stageRoot, write.path.replaceAll('\\', '/'));
        await this.fileSystem.mkdir(dirname(write.target), { recursive: true });
        await this.fileSystem.rename(stagePath, write.target);
        await this.options.fault?.('after-replace');
      }
      await this.fileSystem.rm(transactionRoot, { recursive: true, force: true });
      await this.removeTransactionContainerIfEmpty();
    } catch (error) {
      if (!this.options.preserveOnFailure) {
        await this.rollback(transactionRoot, manifest);
      }
      throw error;
    }
  }

  private async recoverUnlocked(): Promise<void> {
    const container = join(
      await this.fileSystem.realpath(this.repositoryRoot),
      '.rmp-transactions',
    );
    if (!(await pathExists(this.fileSystem, container))) return;

    for (const directory of await this.fileSystem.readdir(container)) {
      const transactionRoot = join(container, directory);
      const manifestPath = join(transactionRoot, 'manifest.json');
      if (!(await pathExists(this.fileSystem, manifestPath))) {
        await this.fileSystem.rm(transactionRoot, { recursive: true, force: true });
        continue;
      }
      const manifest = JSON.parse(
        await this.fileSystem.readFile(manifestPath, 'utf8'),
      ) as TransactionManifest;
      await this.rollback(transactionRoot, manifest);
    }
    await this.removeTransactionContainerIfEmpty();
  }

  private async rollback(transactionRoot: string, manifest: TransactionManifest): Promise<void> {
    const root = await this.fileSystem.realpath(this.repositoryRoot);
    for (const entry of [...manifest.entries].reverse()) {
      const target = join(root, entry.path);
      const backup = join(transactionRoot, 'backup', entry.path);
      if (await pathExists(this.fileSystem, target)) {
        await this.fileSystem.rm(target, { recursive: true, force: true });
      }
      if (entry.existed && (await pathExists(this.fileSystem, backup))) {
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
