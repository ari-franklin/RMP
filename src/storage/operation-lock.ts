import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, readdir, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface OperationLockOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}
interface Ticket {
  token: string;
  pid: number;
  host: string;
  choosing: boolean;
  number: number;
}
const held = new AsyncLocalStorage<ReadonlyMap<string, { active: boolean }>>();

/** Local-host filesystem bakery lock. Every contender owns a unique file, so dead
 * owner cleanup cannot unlink a replacement owner's lock. No age-based stealing. */
export async function withRepositoryOperation<T>(
  root: string,
  operation: () => Promise<T>,
  options: OperationLockOptions = {},
): Promise<T> {
  const key = await realpath(root);
  if (options.signal?.aborted) throw new Error('Repository operation aborted');
  if (held.getStore()?.get(key)?.active) return operation();
  const digest = createHash('sha256').update(`${userInfo().username}:${key}`).digest('hex');
  const directory = join(tmpdir(), `rmp-operation-${digest}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await lstat(directory)).isSymbolicLink())
    throw new Error('Invalid repository lock directory');
  const token = randomUUID();
  const path = join(directory, `${token}.json`);
  const staged = join(directory, `${token}.tmp`);
  const ticket: Ticket = { token, pid: process.pid, host: hostname(), choosing: true, number: 0 };
  const deadline = Date.now() + (options.timeoutMs ?? 10000);
  const publish = async () => {
    await writeFile(staged, JSON.stringify(ticket), { mode: 0o600 });
    await rename(staged, path);
  };
  const scan = async () => {
    const entries: Ticket[] = [];
    for (const name of await readdir(directory)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      const target = join(directory, name);
      let raw: string;
      try {
        raw = await readFile(target, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const value = JSON.parse(raw) as Partial<Ticket>;
      if (
        value.token !== name.slice(0, -5) ||
        !Number.isSafeInteger(value.pid) ||
        Number(value.pid) < 1 ||
        typeof value.host !== 'string' ||
        typeof value.choosing !== 'boolean' ||
        !Number.isSafeInteger(value.number) ||
        Number(value.number) < 0
      )
        throw new Error('Invalid repository lock owner; retry after operator review');
      let dead = false;
      if (value.host === hostname()) {
        try {
          process.kill(Number(value.pid), 0);
        } catch (error) {
          dead = (error as NodeJS.ErrnoException).code === 'ESRCH';
        }
      }
      if (dead) {
        await rm(target, { force: true });
        continue;
      }
      entries.push(value as Ticket);
    }
    return entries;
  };
  const ownership = { active: true };
  try {
    await publish();
    ticket.number = Math.max(0, ...(await scan()).map((t) => t.number)) + 1;
    if (!Number.isSafeInteger(ticket.number))
      throw new Error('Repository lock ticket limit; retry');
    ticket.choosing = false;
    await publish();
    let waiting = true;
    do {
      if (options.signal?.aborted) throw new Error('Repository operation aborted');
      const earlier = (await scan()).some(
        (t) =>
          t.token !== token &&
          (t.choosing ||
            t.number < ticket.number ||
            (t.number === ticket.number && t.token < token)),
      );
      waiting = earlier;
      if (waiting) {
        if (Date.now() >= deadline) throw new Error('Repository operation lock busy; retry');
        await delay(10);
      }
    } while (waiting);
    return await held.run(new Map([...(held.getStore() ?? []), [key, ownership]]), operation);
  } finally {
    ownership.active = false;
    await rm(path, { force: true });
    await rm(staged, { force: true });
  }
}
