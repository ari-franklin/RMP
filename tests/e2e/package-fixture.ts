import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { npmCliPath } from '../helpers/npm.js';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface PackedFixture {
  root: string;
  packageRoot: string;
  cli: string;
  tarball: string;
}

export async function run(
  executable: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

export async function createPackedFixture(): Promise<PackedFixture> {
  const packageRoot = await mkdtemp(join(tmpdir(), 'rmp-package-'));
  const root = await mkdtemp(join(tmpdir(), 'rmp-repository-'));
  await run(process.execPath, [npmCliPath(), 'run', 'build'], projectRoot);
  const packed = await run(
    process.execPath,
    [npmCliPath(), 'pack', '--json', '--pack-destination', packageRoot],
    projectRoot,
  );
  const packResults = JSON.parse(packed.stdout) as Array<{ filename: string }>;
  const filename = packResults[0]?.filename;
  if (filename === undefined) throw new Error('npm pack did not produce a package artifact');
  const tarball = join(packageRoot, filename);
  // Installation may fetch dependency metadata on a fresh runner. CLI execution
  // remains local; it must not depend on a pre-warmed developer npm cache.
  await run(
    process.execPath,
    [npmCliPath(), 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
    packageRoot,
  );
  return {
    root,
    packageRoot,
    tarball,
    cli: join(packageRoot, 'node_modules', 'roadmap-maintenance-protocol', 'dist', 'cli.js'),
  };
}

export async function runCli(
  fixture: PackedFixture,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return run(process.execPath, [fixture.cli, ...args, '--root', fixture.root], fixture.root);
}

export async function readRoadmap(root: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}
