import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fixture as projection } from '../helpers/notion-projection.js';
import { mkdtemp, writeFile, readFile, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { withRepositoryOperation } from '../../src/storage/operation-lock.js';
import { npmCliPath } from '../helpers/npm.js';

const moduleUrl = pathToFileURL(resolve('dist/storage/operation-lock.js')).href;
beforeAll(() => {
  execFileSync(process.execPath, [npmCliPath(), 'run', 'build'], { stdio: 'pipe' });
});
function child(root: string, code: string) {
  const processChild = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {withRepositoryOperation} from ${JSON.stringify(moduleUrl)}; import {readFile,writeFile} from 'node:fs/promises'; const root=${JSON.stringify(root)}; ${code}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '';
  let err = '';
  processChild.stdout.on('data', (b: Buffer) => {
    out += b.toString();
  });
  processChild.stderr.on('data', (b: Buffer) => {
    err += b.toString();
  });
  const done = new Promise<string>((resolveChild, reject) => {
    processChild.once('error', reject);
    processChild.once('exit', (code) => {
      if (code === 0) resolveChild(out);
      else reject(new Error(err || 'child exited'));
    });
  });
  return { processChild, done };
}
// Keep ownership until the parent explicitly releases it; elapsed wall time is
// not a synchronization signal on loaded CI runners.
const heldOwnerCode = `await withRepositoryOperation(root,async()=>{console.log('locked');while(true){try{await readFile(root+'/release');break;}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(r=>setTimeout(r,10));}});`;

describe('repository operation lock', () => {
  it('serializes read-modify-write operations across real processes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-process-lock-'));
    await writeFile(join(root, 'counter'), '0');
    const code = `await withRepositoryOperation(root,async()=>{const p=root+'/counter';const n=Number(await readFile(p,'utf8'));await new Promise(r=>setTimeout(r,80));await writeFile(p,String(n+1));});`;
    await Promise.all(Array.from({ length: 4 }, () => child(root, code).done));
    expect(await readFile(join(root, 'counter'), 'utf8')).toBe('4');
  });
  it('times out rather than stealing a live owner, then releases after errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-live-lock-'));
    const owner = child(root, heldOwnerCode);
    await new Promise<void>((r) =>
      owner.processChild.stdout.once('data', () => {
        r();
      }),
    );
    try {
      await expect(
        withRepositoryOperation(root, () => Promise.resolve(), { timeoutMs: 40 }),
      ).rejects.toThrow(/lock.*retry/i);
    } finally {
      await writeFile(join(root, 'release'), 'release');
      await owner.done;
    }
    await expect(
      withRepositoryOperation(root, () => Promise.reject(new Error('operation failed'))),
    ).rejects.toThrow('operation failed');
    await expect(withRepositoryOperation(root, () => Promise.resolve(42))).resolves.toBe(42);
  });
  it('recovers a dead owner and supports nested protected operations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-dead-lock-'));
    const owner = child(
      root,
      `await withRepositoryOperation(root,async()=>{console.log('locked');await new Promise(r=>setTimeout(r,30000));});`,
    );
    const exited = owner.done.catch(() => undefined);
    await new Promise<void>((r) =>
      owner.processChild.stdout.once('data', () => {
        r();
      }),
    );
    owner.processChild.kill('SIGKILL');
    await exited;
    await expect(
      withRepositoryOperation(
        root,
        () => withRepositoryOperation(root, () => Promise.resolve(42)),
        {
          timeoutMs: 500,
        },
      ),
    ).resolves.toBe(42);
  });
  it('cancels waiting without leaving ownership behind', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-cancel-lock-'));
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRepositoryOperation(root, () => Promise.resolve(), { signal: controller.signal }),
    ).rejects.toThrow(/abort/i);
    await expect(withRepositoryOperation(root, () => Promise.resolve(true))).resolves.toBe(true);
  });
});

it('serializes browser-save reads across processes so a stale save cannot overwrite a newer revision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rmp-save-race-'));
  await mkdir(join(root, '.roadmap'));
  await writeFile(join(root, '.roadmap/roadmap.json'), JSON.stringify(projection().roadmap));
  await writeFile(join(root, '.roadmap/config.json'), '{}');
  const serverUrl = pathToFileURL(resolve('dist/server/local.js')).href;
  const jobs: ReturnType<typeof child>[] = [];
  await withRepositoryOperation(root, async () => {
    for (const title of ['First', 'Second'])
      jobs.push(
        child(
          root,
          `import {saveRoadmapChanges} from ${JSON.stringify(serverUrl)};console.log('ready');try {await saveRoadmapChanges(root,{roadmapRevision:3,newOutcomes:[{id:'out-test',title:${JSON.stringify(title)}}]}); console.log('saved');}catch(e){console.log('conflict:'+e.message);}`,
        ),
      );
    await Promise.all(
      jobs.map(
        (job) =>
          new Promise<void>((r) =>
            job.processChild.stdout.once('data', () => {
              r();
            }),
          ),
      ),
    );
    await new Promise((r) => setTimeout(r, 80));
  });
  const outputs = await Promise.all(jobs.map((j) => j.done));
  expect(outputs.filter((out) => out.includes('saved'))).toHaveLength(1);
  expect(outputs.filter((out) => out.includes('reload before saving'))).toHaveLength(1);
});

it('does not reuse inherited lock authority after the owning operation has ended', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rmp-lock-context-'));
  let resume: ReturnType<typeof AsyncLocalStorage.snapshot> | undefined;
  await withRepositoryOperation(root, () => {
    resume = AsyncLocalStorage.snapshot();
    return Promise.resolve();
  });
  const owner = child(root, heldOwnerCode);
  await new Promise<void>((r) => {
    owner.processChild.stdout.once('data', () => {
      r();
    });
  });
  try {
    if (!resume) throw new Error('Missing captured context');
    await expect(
      resume(() => withRepositoryOperation(root, () => Promise.resolve(), { timeoutMs: 30 })),
    ).rejects.toThrow(/lock.*retry/i);
  } finally {
    await writeFile(join(root, 'release'), 'release');
    await owner.done;
  }
});

it.each(['malformed', 'foreign'] as const)(
  'does not remove an unverifiable %s owner',
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), 'rmp-unverified-lock-'));
    const digest = createHash('sha256')
      .update(`${userInfo().username}:${await realpath(root)}`)
      .digest('hex');
    const directory = join(tmpdir(), `rmp-operation-${digest}`);
    await mkdir(directory, { recursive: true });
    const token = '11111111-1111-4111-8111-111111111111';
    const owner = join(directory, token + '.json');
    const content =
      kind === 'malformed'
        ? '{}'
        : JSON.stringify({
            token,
            pid: process.pid,
            host: 'unverifiable-host',
            choosing: false,
            number: 1,
          });
    await writeFile(owner, content);
    try {
      await expect(
        withRepositoryOperation(root, () => Promise.resolve(), { timeoutMs: 20 }),
      ).rejects.toThrow(/lock.*owner|lock.*retry/i);
      expect(await readFile(owner, 'utf8')).toBe(content);
    } finally {
      await rm(owner, { force: true });
    }
  },
);
