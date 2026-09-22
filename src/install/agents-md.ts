import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { unifiedDiff } from './diff.js';

export type AgentsUpdateKind = 'configured' | 'create' | 'append' | 'repair';

export interface AgentsUpdatePlan {
  kind: AgentsUpdateKind;
  clause: string;
  current?: string;
  proposed: string;
  preview: string;
  problem?: string;
}

export interface PlanAgentsUpdateOptions {
  root: string;
  protocolPath?: string;
}

interface Section {
  start: number;
  end: number;
  value: string;
}

const headingPattern = /^##\s+roadmap\s+maintenance\s*$/imu;
const requiredContent = [
  'at the start of every task',
  'run `npx rmp sync`',
  'read `roadmap.md`',
  'before the final response',
  'run `npx rmp sync` again',
  'unresolved failures',
  'show, see, or open the roadmap',
  '`.roadmap/roadmap.html` in codex',
];

async function optionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function activationSection(content: string): Section | undefined {
  const match = headingPattern.exec(content);
  if (!match) return undefined;

  const remainder = content.slice(match.index + match[0].length);
  const nextHeading = /^#{1,2}\s+/mu.exec(remainder);
  const end =
    nextHeading?.index === undefined
      ? content.length
      : match.index + match[0].length + nextHeading.index;

  return { start: match.index, end, value: content.slice(match.index, end) };
}

function markdownTargets(section: string): string[] {
  return [...section.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
    .map((match) => match[1])
    .filter((target): target is string => target !== undefined);
}

function normalized(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().toLowerCase();
}

function activationClause(protocolPath: string): string {
  const displayName = protocolPath.split('/').at(-1) ?? protocolPath;
  const href = protocolPath.startsWith('.') ? protocolPath : `./${protocolPath}`;
  return [
    '## Roadmap maintenance',
    '',
    `Follow [${displayName}](${href}). At the start of every task, run \`npx rmp sync\`,`,
    'then read `ROADMAP.md` before planning or editing. Before the final response,',
    'run `npx rmp sync` again after meaningful work. Stay quiet on no-op maintenance;',
    'mention only material roadmap changes, decisions needed, or unresolved failures.',
    'When asked to show, see, or open the roadmap, open `.roadmap/roadmap.html` in Codex;',
    'do not substitute a chat summary unless the user asks for one.',
    '',
  ].join('\n');
}

function replaceSection(content: string, section: Section, clause: string): string {
  const before = content.slice(0, section.start).trimEnd();
  const after = content.slice(section.end).trimStart();
  return [before, clause.trimEnd(), after].filter((part) => part.length > 0).join('\n\n') + '\n';
}

export async function planAgentsUpdate(
  options: PlanAgentsUpdateOptions,
): Promise<AgentsUpdatePlan> {
  const agentsPath = resolve(options.root, 'AGENTS.md');
  const protocolPath = options.protocolPath ?? 'RMP.md';
  const clause = activationClause(protocolPath);
  const current = await optionalFile(agentsPath);

  if (current === undefined) {
    return {
      kind: 'create',
      clause,
      proposed: clause,
      preview: unifiedDiff('AGENTS.md', undefined, clause),
    };
  }

  const section = activationSection(current);
  if (!section) {
    const proposed = `${current.trimEnd()}\n\n${clause}`;
    return {
      kind: 'append',
      clause,
      current,
      proposed,
      preview: unifiedDiff('AGENTS.md', current, proposed),
    };
  }

  const targets = markdownTargets(section.value);
  const normalizedSection = normalized(section.value);
  const contentMatches = requiredContent.every((fragment) => normalizedSection.includes(fragment));
  const validTargets = await Promise.all(
    targets.map(async (target) => {
      if (/^(?:[a-z]+:|#)/iu.test(target)) return false;
      return pathExists(resolve(dirname(agentsPath), target));
    }),
  );

  if (targets.length === 1 && validTargets[0] === true && contentMatches) {
    return { kind: 'configured', clause, current, proposed: current, preview: '' };
  }

  const proposed = replaceSection(current, section, clause);
  const target = targets[0] ?? 'unknown target';
  const problem =
    targets.length > 1
      ? 'Roadmap maintenance contains multiple protocol links and is ambiguous.'
      : targets.length === 0
        ? 'Roadmap maintenance does not contain a protocol link.'
        : validTargets[0] !== true
          ? `Roadmap protocol link ${target} does not resolve.`
          : 'Roadmap maintenance content is incomplete.';

  return {
    kind: 'repair',
    clause,
    current,
    proposed,
    preview: unifiedDiff('AGENTS.md', current, proposed),
    problem,
  };
}
