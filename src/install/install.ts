import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planAgentsUpdate } from './agents-md.js';

export interface InstallPromptRequest {
  message: string;
  preview: string;
}

export type InstallPrompt = (request: InstallPromptRequest) => Promise<boolean>;

export interface InstallOptions {
  root: string;
  interactive?: boolean;
  acceptAgentsUpdate?: boolean;
  prompt?: InstallPrompt;
  protocolPath?: string;
}

export interface InstallDiagnostic {
  code: string;
  message: string;
}

export interface InstallResult {
  agentAwareness: 'enabled' | 'disabled';
  agentsAction: 'created' | 'updated' | 'unchanged' | 'declined' | 'authorization-required';
  installed: string[];
  updated: string[];
  unchanged: string[];
  diagnostics: InstallDiagnostic[];
  agentsPreview: string;
}

interface Asset {
  sourceGroup: 'templates' | 'schemas';
  source: string;
  destination: string;
}

const assets: Asset[] = [
  { sourceGroup: 'templates', source: 'RMP.md', destination: 'RMP.md' },
  { sourceGroup: 'templates', source: 'roadmap.json', destination: '.roadmap/roadmap.json' },
  { sourceGroup: 'schemas', source: 'roadmap.schema.json', destination: '.roadmap/schema.json' },
  { sourceGroup: 'templates', source: 'config.json', destination: '.roadmap/config.json' },
  { sourceGroup: 'templates', source: 'history.jsonl', destination: '.roadmap/history.jsonl' },
  {
    sourceGroup: 'templates',
    source: 'adapters/README.md',
    destination: '.roadmap/adapters/README.md',
  },
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function sourceRoot(group: Asset['sourceGroup']): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, '..', '..', group),
    resolve(moduleDirectory, '..', '..', '..', group),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error(`Unable to locate packaged ${group} assets`);
}

async function installAssets(
  root: string,
): Promise<Pick<InstallResult, 'installed' | 'unchanged'>> {
  const roots = {
    templates: await sourceRoot('templates'),
    schemas: await sourceRoot('schemas'),
  };
  const installed: string[] = [];
  const unchanged: string[] = [];

  for (const asset of assets) {
    const destination = join(root, asset.destination);
    if (await pathExists(destination)) {
      unchanged.push(asset.destination);
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    const source = await readFile(join(roots[asset.sourceGroup], asset.source));
    if (asset.destination === '.roadmap/roadmap.json') {
      const roadmap = JSON.parse(source.toString('utf8')) as { title: string };
      const projectName = basename(root)
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
      roadmap.title = `${projectName || 'Project'} Roadmap`;
      await writeFile(destination, `${JSON.stringify(roadmap, null, 2)}\n`, 'utf8');
    } else {
      await writeFile(destination, source);
    }
    installed.push(asset.destination);
  }

  return { installed, unchanged };
}

export async function installRmp(options: InstallOptions): Promise<InstallResult> {
  const root = resolve(options.root);
  await mkdir(root, { recursive: true });
  const { installed, unchanged } = await installAssets(root);
  const agentsPlan = await planAgentsUpdate({
    root,
    ...(options.protocolPath === undefined ? {} : { protocolPath: options.protocolPath }),
  });
  const diagnostics: InstallDiagnostic[] = [];

  if (agentsPlan.kind === 'configured') {
    return {
      agentAwareness: 'enabled',
      agentsAction: 'unchanged',
      installed,
      updated: [],
      unchanged: [...unchanged, 'AGENTS.md'],
      diagnostics,
      agentsPreview: '',
    };
  }

  const explicitlyAccepted = options.acceptAgentsUpdate === true;
  const interactive = options.interactive !== false;
  let accepted = explicitlyAccepted;
  if (!accepted && interactive && options.prompt) {
    accepted = await options.prompt({
      message: agentsPlan.problem ?? 'Authorize the proposed AGENTS.md update?',
      preview: agentsPlan.preview,
    });
  }

  if (accepted) {
    await writeFile(join(root, 'AGENTS.md'), agentsPlan.proposed, 'utf8');
    return {
      agentAwareness: 'enabled',
      agentsAction: agentsPlan.kind === 'create' ? 'created' : 'updated',
      installed,
      updated: ['AGENTS.md'],
      unchanged,
      diagnostics,
      agentsPreview: agentsPlan.preview,
    };
  }

  const agentsAction = interactive ? 'declined' : 'authorization-required';
  diagnostics.push({
    code: 'agentAwareness.disabled',
    message:
      agentsAction === 'declined'
        ? 'AGENTS.md update declined; automatic agent awareness is disabled.'
        : 'AGENTS.md update requires explicit authorization in non-interactive mode.',
  });

  return {
    agentAwareness: 'disabled',
    agentsAction,
    installed,
    updated: [],
    unchanged,
    diagnostics,
    agentsPreview: agentsPlan.preview,
  };
}
