import { GitClient, type GitCommandExecutor } from './git-client.js';
import { deduplicateEvidence } from './registry.js';
import type {
  Adapter,
  AdapterCollection,
  AdapterCollectionContext,
  AdapterIdentity,
  EvidenceKind,
  NormalizedEvidence,
} from './types.js';

function event(
  kind: EvidenceKind,
  eventId: string,
  observedAt: string,
  summary: string,
  evidenceClass: NormalizedEvidence['class'],
  data: Record<string, unknown>,
): NormalizedEvidence {
  return {
    id: `git-${eventId}`,
    kind,
    class: evidenceClass,
    observedAt,
    summary,
    itemRefs: [],
    provenance: { provider: 'git', eventId, sourceRef: `git:${eventId}` },
    data,
  };
}

export class GitEvidenceAdapter implements Adapter {
  readonly identity: AdapterIdentity = {
    provider: 'git',
    version: '1.0.0',
    capabilities: ['branches', 'changedFiles', 'commits', 'releases'],
  };

  constructor(private readonly execute?: GitCommandExecutor) {}

  async collect(context: AdapterCollectionContext): Promise<AdapterCollection> {
    const git = new GitClient(context.repositoryRoot, this.execute);
    try {
      if ((await git.run(['rev-parse', '--is-inside-work-tree'])) !== 'true') {
        throw new Error('not a Git repository');
      }
    } catch (error) {
      return {
        evidence: [],
        diagnostics: [
          {
            provider: 'git',
            code: 'not-a-repository',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }

    const evidence: NormalizedEvidence[] = [];
    const branch = await git.run(['branch', '--show-current']);
    if (branch)
      evidence.push(
        event(
          'branch',
          `branch:${branch}`,
          '1970-01-01T00:00:00.000Z',
          `Current branch ${branch}`,
          'inferred',
          { branch },
        ),
      );

    const log = await git.run(['log', '-n', '50', '--format=%H%x1f%cI%x1f%P%x1f%s']);
    const commits: NormalizedEvidence[] = [];
    const merges: NormalizedEvidence[] = [];
    for (const line of log.split('\n').filter(Boolean)) {
      const [hash, observedAt, parents, subject] = line.split('\u001f');
      if (!hash || !observedAt || parents === undefined || subject === undefined) continue;
      const parentList = parents.split(' ').filter(Boolean);
      const target = parentList.length > 1 ? merges : commits;
      target.push(
        event(
          parentList.length > 1 ? 'merge' : 'commit',
          `commit:${hash}`,
          observedAt,
          subject,
          parentList.length > 1 ? 'corroborated' : 'inferred',
          { hash, parents: parentList, subject },
        ),
      );
    }
    evidence.push(...commits, ...merges);

    const tags = await git.run(['tag', '--points-at', 'HEAD']);
    for (const tag of tags.split('\n').filter(Boolean).sort()) {
      evidence.push(
        event(
          'tag',
          `tag:${tag}`,
          '1970-01-01T00:00:00.000Z',
          `Release tag ${tag}`,
          'deterministic',
          { tag },
        ),
      );
    }

    const status = await git.run(['status', '--short']);
    const files = status
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))
      .sort();
    if (files.length > 0) {
      evidence.push(
        event(
          'changedFiles',
          `changed:${files.join('|')}`,
          '1970-01-01T00:00:00.000Z',
          `${String(files.length)} changed files`,
          'inferred',
          { files },
        ),
      );
    }

    return { evidence: deduplicateEvidence(evidence), diagnostics: [] };
  }
}
