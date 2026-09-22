import { dirname } from 'node:path';

import { validateTransitionReceipt } from '../schemas/index.js';
import type { TransitionReceipt } from '../types/index.js';
import { canonicalJsonLine } from '../utils/json.js';
import { nodeFileSystem, pathExists, type FileSystemPort } from '../utils/files.js';
import { resolveRepositoryPath } from '../utils/paths.js';

const writes = new Map<string, Promise<void>>();

export class ReceiptHistory {
  public constructor(
    private readonly repositoryRoot: string,
    private readonly historyPath = '.roadmap/history.jsonl',
    private readonly fileSystem: FileSystemPort = nodeFileSystem,
  ) {}

  public async read(): Promise<TransitionReceipt[]> {
    const path = await resolveRepositoryPath(
      this.repositoryRoot,
      this.historyPath,
      this.fileSystem,
    );
    if (!(await pathExists(this.fileSystem, path))) return [];

    const text = await this.fileSystem.readFile(path, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const parsed: unknown = JSON.parse(line);
        const result = validateTransitionReceipt(parsed);
        if (!result.valid)
          throw new Error(
            `Invalid transition receipt: ${result.diagnostics[0]?.message ?? 'unknown error'}`,
          );
        return result.value;
      });
  }

  public async append(receipt: TransitionReceipt): Promise<boolean> {
    const key = await this.fileSystem.realpath(this.repositoryRoot);
    const previous = writes.get(key) ?? Promise.resolve();
    let appended = false;
    const current = previous.then(async () => {
      const validation = validateTransitionReceipt(receipt);
      if (!validation.valid) {
        throw new Error(
          `Invalid transition receipt: ${validation.diagnostics[0]?.message ?? 'unknown error'}`,
        );
      }

      const existing = await this.read();
      if (existing.some((entry) => entry.id === receipt.id)) return;
      const latest = existing.at(-1);
      if (latest && receipt.timestamp < latest.timestamp) {
        throw new Error('Receipts must be appended in chronological order');
      }

      const path = await resolveRepositoryPath(
        this.repositoryRoot,
        this.historyPath,
        this.fileSystem,
      );
      await this.fileSystem.mkdir(dirname(path), { recursive: true });
      await this.fileSystem.appendFile(path, canonicalJsonLine(receipt), 'utf8');
      appended = true;
    });
    writes.set(key, current);
    try {
      await current;
      return appended;
    } finally {
      if (writes.get(key) === current) writes.delete(key);
    }
  }
}
