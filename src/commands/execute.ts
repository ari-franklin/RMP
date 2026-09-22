import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { runSync, type RunSyncOptions, type RunSyncResult } from '../core/run-sync.js';
import { installRmp, type InstallOptions, type InstallResult } from '../install/index.js';
import { validateRoadmap } from '../schemas/index.js';
import { validateConsistency } from '../core/validate-consistency.js';

export interface ValidationCommandResult {
  valid: boolean;
  diagnostics: Array<{ message: string }>;
}

export interface CommandDependencies {
  install: (options: InstallOptions) => Promise<InstallResult>;
  sync: (options: RunSyncOptions) => Promise<RunSyncResult>;
  validate: (root: string) => Promise<ValidationCommandResult>;
}

export interface CliExecutionResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

type Command = 'init' | 'validate' | 'collect' | 'reconcile' | 'render' | 'sync';

async function validateRepository(root: string): Promise<ValidationCommandResult> {
  try {
    const value: unknown = JSON.parse(
      await readFile(join(root, '.roadmap', 'roadmap.json'), 'utf8'),
    );
    const result = validateRoadmap(value);
    if (!result.valid) return result;
    return {
      valid: true,
      diagnostics: validateConsistency(result.value).map((entry) => ({ message: entry.message })),
    };
  } catch (error) {
    return {
      valid: false,
      diagnostics: [{ message: error instanceof Error ? error.message : 'Validation failed' }],
    };
  }
}

const defaults: CommandDependencies = {
  install: installRmp,
  sync: runSync,
  validate: validateRepository,
};

function success(command: Command, value: unknown, json: boolean): CliExecutionResult {
  return {
    exitCode: 0,
    stdout: json
      ? `${JSON.stringify({ schemaVersion: '1.0.0', command, result: value })}\n`
      : `${command} completed successfully\n`,
    stderr: '',
  };
}

function usage(message: string): CliExecutionResult {
  return { exitCode: 2, stdout: '', stderr: `${message}\n` };
}

export async function executeCli(
  argv: string[],
  dependencies: CommandDependencies = defaults,
): Promise<CliExecutionResult> {
  const [candidate, ...args] = argv;
  if (!['init', 'validate', 'collect', 'reconcile', 'render', 'sync'].includes(candidate ?? '')) {
    return usage(`Unknown command: ${candidate ?? '(missing)'}`);
  }
  const command = candidate as Command;

  try {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        root: { type: 'string' },
        json: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        'non-interactive': { type: 'boolean' },
        'accept-agents-update': { type: 'boolean' },
        format: { type: 'string' },
      },
    });
    const root = resolve(values.root ?? '.');
    const json = values.json ?? false;
    if (command === 'init') {
      const result = await dependencies.install({
        root,
        interactive: !(values['non-interactive'] ?? false),
        acceptAgentsUpdate: values['accept-agents-update'] ?? false,
      });
      return success(command, result, json);
    }
    if (command === 'validate') {
      const result = await dependencies.validate(root);
      return result.valid
        ? success(command, result, json)
        : {
            exitCode: 1,
            stdout: json ? `${JSON.stringify({ schemaVersion: '1.0.0', command, result })}\n` : '',
            stderr: json ? '' : `${result.diagnostics[0]?.message ?? 'Validation failed'}\n`,
          };
    }
    const format = values.format ?? 'all';
    if (!['all', 'markdown', 'html'].includes(format)) return usage(`Invalid format: ${format}`);
    const result = await dependencies.sync({
      root,
      mode: command,
      dryRun: values['dry-run'] ?? false,
      format: format as NonNullable<RunSyncOptions['format']>,
    });
    return success(command, result, json);
  } catch (error) {
    if (error instanceof TypeError) return usage(error.message);
    return {
      exitCode: 1,
      stdout: '',
      stderr: `${error instanceof Error ? error.message : 'Command failed'}\n`,
    };
  }
}
