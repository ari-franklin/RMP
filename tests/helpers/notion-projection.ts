import type { NotionWorkflowPolicy } from '../../src/content/notion-policy.js';
import type { NotionPost, NotionSnapshot } from '../../src/adapters/notion-types.js';
import { defaultConfig } from '../../src/config/index.js';
import { contentId } from '../../src/utils/ids.js';
import { roadmap, item } from '../unit/core/helpers.js';
export const source = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const now = '2026-10-20T12:00:00.000Z';
export const pid = (n: number) => n.toString(16).padStart(32, '0');
export const iid = (n: number) => `mil-notion-${pid(n)}`;
export function post(n: number, status = 'idea', overrides: Partial<NotionPost> = {}): NotionPost {
  return {
    pageId: pid(n),
    dataSourceId: source,
    title: `Post ${String(n)}`,
    statusName: status,
    statusOptionId: status,
    lastEditedAt: '2026-10-19T12:00:00.000Z',
    archived: false,
    inTrash: false,
    ...overrides,
  };
}
export function fixture(
  posts: NotionPost[] = [post(1)],
  overrides: Partial<NotionWorkflowPolicy> = {},
) {
  const policy: NotionWorkflowPolicy = {
    schemaVersion: 1,
    dataSourceId: source,
    nowLimit: 2,
    nowSelection: [],
    nextCuration: [],
    laterClusters: [],
    publishedMatches: [],
    completedAliases: [],
    pageToItem: {},
    pageToThemes: {},
    statusOptions: {
      drafting: 'drafting',
      outlining: 'outlining',
      idea: 'idea',
      published: 'published',
    },
    statusMapping: {
      drafting: { horizon: 'now', roadmapStatus: 'active', stage: 'draft' },
      outlining: { horizon: 'next', roadmapStatus: 'proposed', stage: 'idea' },
      idea: { horizon: 'later', roadmapStatus: 'proposed', stage: 'idea' },
      published: { horizon: 'later', roadmapStatus: 'completed', stage: 'publish' },
    },
    draftingOverflow: { horizon: 'next', roadmapStatus: 'proposed', stage: 'draft' },
    ...overrides,
  };
  const sorted = [...posts].sort((a, b) => a.pageId.localeCompare(b.pageId));
  const snapshot: NotionSnapshot = {
    schemaVersion: 1,
    provider: 'notion',
    dataSourceId: source,
    fetchedAt: now,
    contentHash: contentId('notion', sorted),
    posts: sorted,
  };
  return {
    roadmap: roadmap({
      items: [],
      extensions: {
        'content/notion-workflow': structuredClone(policy) as unknown as Record<string, unknown>,
      },
    }),
    snapshot,
    policy,
    config: {
      ...defaultConfig,
      adapters: {
        enabled: ['notion'],
        notion: {
          dataSourceId: source,
          titlePropertyId: 'title',
          statusPropertyId: 'status',
          requestTimeoutMs: 10000,
          collectionTimeoutMs: 60000,
          maxPages: 20,
          maxRetries: 2,
        },
      },
    },
    health: { provider: 'notion' as const, state: 'fresh' as const, lastSuccessfulAt: now },
    now,
  };
}
export function managed(n: number, overrides: Parameters<typeof item>[0] = {}) {
  return item({
    id: iid(n),
    kind: 'milestone',
    title: `Post ${String(n)}`,
    status: 'proposed',
    horizon: 'later',
    extensions: { 'content/workflow': { source: 'notion:writing-ideas' } },
    ...overrides,
  });
}
