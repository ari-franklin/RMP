#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { executeCli } from './commands/index.js';
import { version } from './index.js';

const HELP_TEXT = `Roadmap Maintenance Protocol

Usage:
  rmp --version
  rmp --help
`;

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (
    argv.length > 0 &&
    !argv.some((argument) => ['--help', '-h', '--version', '-v'].includes(argument))
  ) {
    const result = await executeCli(argv);
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result.exitCode;
  }
  const { values } = parseArgs({
    args: argv,
    options: {
      help: {
        short: 'h',
        type: 'boolean',
      },
      version: {
        short: 'v',
        type: 'boolean',
      },
    },
    strict: true,
  });

  if (values.version) {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  process.stdout.write(HELP_TEXT);
  return 0;
}

const entrypoint = process.argv[1];

if (
  entrypoint !== undefined &&
  realpathSync(entrypoint) === realpathSync(fileURLToPath(import.meta.url))
) {
  runCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Unexpected CLI failure'}\n`,
      );
      process.exitCode = 1;
    });
}
