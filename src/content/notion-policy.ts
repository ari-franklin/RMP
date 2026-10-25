import { canonicalJson } from '../utils/json.js';
import { loadConfig } from '../config/load.js';
import { validateRoadmap } from '../schemas/index.js';
import type { NotionConfig } from '../config/notion.js';
import type { Roadmap, RmpConfig } from '../types/index.js';

export type EditorialStatus = 'drafting' | 'outlining' | 'idea' | 'published';
export type PropertyRole = 'title' | 'status' | 'publishDate' | 'type' | 'blog' | 'series';
interface EditorialRule {
  horizon: 'now' | 'next' | 'later';
  roadmapStatus: 'active' | 'proposed' | 'completed';
  stage: 'draft' | 'idea' | 'publish';
}
const statusMapping: Record<EditorialStatus, EditorialRule> = {
  drafting: { horizon: 'now', roadmapStatus: 'active', stage: 'draft' },
  outlining: { horizon: 'next', roadmapStatus: 'proposed', stage: 'idea' },
  idea: { horizon: 'later', roadmapStatus: 'proposed', stage: 'idea' },
  published: { horizon: 'later', roadmapStatus: 'completed', stage: 'publish' },
};
export interface NotionWorkflowPolicy {
  statusMapping: Record<EditorialStatus, EditorialRule>;
  draftingOverflow: EditorialRule;
  schemaVersion: 1;
  dataSourceId: string;
  nowLimit: 2;
  nowSelection: string[];
  nextCuration: Array<{ id: string; rank: number; rationale: string }>;
  laterClusters: Array<{ name: string; ids: string[] }>;
  publishedMatches: Array<{ itemId: string; notionPageId: string; notionTitle: string }>;
  completedAliases: Array<{ pageId: string; completedAs: string; completedAsPageId?: string }>;
  pageToItem: Record<string, string>;
  pageToThemes: Record<string, string[]>;
  statusOptions: Record<string, EditorialStatus>;
}
export interface NotionMigrationInput {
  legacySource: unknown;
  dataSourceSchema: unknown;
  config: unknown;
  roadmap: Roadmap;
  propertyNames?: Partial<Record<PropertyRole, string>>;
}
export type NotionMigrationPreview =
  | {
      valid: true;
      config: RmpConfig;
      provider: NotionConfig;
      policy: NotionWorkflowPolicy;
      preservedSource: unknown;
      preservedRoadmap: Roadmap;
      diagnostics: [];
    }
  | { valid: false; diagnostics: string[] };

const statuses: EditorialStatus[] = ['drafting', 'outlining', 'idea', 'published'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000)
    throw new Error('Invalid text field');
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected a list');
  return value as unknown[];
}
function pageId(value: unknown): string {
  const id = text(value);
  if (!/^[0-9a-f]{32}$/i.test(id) && !uuid.test(id)) throw new Error('Invalid page identity');
  return id.replaceAll('-', '').toLowerCase();
}
function editorialStatus(value: unknown): EditorialStatus {
  if (!statuses.includes(value as EditorialStatus)) throw new Error('Unmapped editorial status');
  return value as EditorialStatus;
}

/** Pure preview: supplied schema only, no credential reads, network or writes. */
export function previewNotionMigration(input: NotionMigrationInput): NotionMigrationPreview {
  try {
    const loaded = loadConfig(input.config);
    if (!loaded.valid) throw new Error('Invalid repository configuration');
    if (!validateRoadmap(input.roadmap).valid) throw new Error('Invalid existing roadmap');
    const source = record(input.legacySource);
    const schema = record(input.dataSourceSchema);
    const dataSourceId = text(schema.id).toLowerCase();
    if (!uuid.test(dataSourceId) || source.dataSourceUrl !== `collection://${dataSourceId}`)
      throw new Error('Source identity requires explicit verification');
    const properties = Object.values(record(schema.properties)).map(record);
    const propertyIds = properties.map((p) => text(p.id));
    if (new Set(propertyIds).size !== propertyIds.length)
      throw new Error('Duplicate property identity');
    const legacyConfig = loaded.config.extensions['content/notion'];
    const names = {
      title: 'Name',
      status:
        legacyConfig?.statusProperty === undefined ? 'Status' : text(legacyConfig.statusProperty),
      ...input.propertyNames,
    };
    const bind = (name: string, types: string[]) => {
      const matches = properties.filter((p) => p.name === name);
      const property = matches[0];
      if (matches.length !== 1 || !property || !types.includes(String(property.type)))
        throw new Error('Missing, ambiguous or incompatible property');
      return property;
    };
    const title = bind(names.title, ['title']);
    const status = bind(names.status, ['status', 'select']);
    const statusOptions: Record<string, EditorialStatus> = {};
    const seenStatuses = new Set<EditorialStatus>();
    for (const option of list(record(status[String(status.type)]).options).map(record)) {
      const id = text(option.id);
      const name = editorialStatus(text(option.name).trim().toLowerCase());
      if (Object.hasOwn(statusOptions, id) || seenStatuses.has(name))
        throw new Error('Ambiguous status option');
      Object.defineProperty(statusOptions, id, {
        value: name,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      seenStatuses.add(name);
    }
    if (seenStatuses.size !== statuses.length) throw new Error('Missing editorial status option');
    const providerInput: Record<string, unknown> = {
      dataSourceId,
      titlePropertyId: title.id,
      statusPropertyId: status.id,
    };
    const optionalTypes = {
      publishDate: ['date'],
      type: ['multi_select'],
      blog: ['select'],
      series: ['multi_select'],
    };
    for (const role of Object.keys(optionalTypes) as Array<keyof typeof optionalTypes>) {
      const name = names[role as keyof typeof names];
      if (name !== undefined)
        providerInput[`${role}PropertyId`] = bind(text(name), optionalTypes[role]).id;
    }
    const existingProvider = loaded.config.adapters.notion;
    if (existingProvider !== undefined)
      throw new Error('Provider already configured; review migration separately');
    const migrated = loadConfig({
      ...loaded.config,
      adapters: { ...loaded.config.adapters, notion: providerInput },
    });
    if (!migrated.valid || !migrated.config.adapters.notion)
      throw new Error('Invalid bound provider settings');
    if (
      source.statusMapping !== undefined &&
      canonicalJson(source.statusMapping) !== canonicalJson(statusMapping)
    )
      throw new Error('Legacy workflow mapping differs from the approved policy');
    const posts = list(source.snapshot).map(record);
    const postIds = posts.map((post) => pageId(post.id));
    if (new Set(postIds).size !== postIds.length) throw new Error('Duplicate legacy page identity');
    posts.forEach((post) => editorialStatus(post.status));
    const knownPage = (value: unknown) => {
      const id = pageId(value);
      if (!postIds.includes(id)) throw new Error('Curation refers to a missing source page');
      return id;
    };
    if (source.nowLimit !== 2)
      throw new Error('Migration requires the approved two-post Now limit');
    const nowSelection = list(source.nowSelection).map(knownPage);
    if (nowSelection.length > 2 || new Set(nowSelection).size !== nowSelection.length)
      throw new Error('Invalid Now selection');
    if (posts.some((post) => nowSelection.includes(pageId(post.id)) && post.status !== 'drafting'))
      throw new Error('Now selection must contain drafting posts');
    const nextCuration = list(source.nextCuration).map((value) => {
      const entry = record(value);
      if (typeof entry.rank !== 'number' || !Number.isInteger(entry.rank) || entry.rank < 1)
        throw new Error('Invalid curation rank');
      return { id: knownPage(entry.id), rank: entry.rank, rationale: text(entry.rationale) };
    });
    if (new Set(nextCuration.map((entry) => entry.id)).size !== nextCuration.length)
      throw new Error('Duplicate curated page');
    const laterClusters = list(source.laterClusters).map((value) => {
      const entry = record(value);
      return { name: text(entry.name), ids: list(entry.ids).map(knownPage) };
    });
    const clustered = laterClusters.flatMap((cluster) => cluster.ids);
    if (new Set(clustered).size !== clustered.length)
      throw new Error('Ambiguous cluster membership');
    const publishedMatches = list(source.publishedMatches).map((value) => {
      const entry = record(value);
      const itemId = text(entry.itemId);
      if (!input.roadmap.items.some((item) => item.id === itemId && item.kind === 'milestone'))
        throw new Error('Publication alias requires an existing milestone');
      return {
        itemId,
        notionPageId: knownPage(entry.notionPageId),
        notionTitle: text(entry.notionTitle),
      };
    });
    const completedAliases = posts.flatMap((post) =>
      post.completedAs === undefined
        ? []
        : [
            {
              pageId: pageId(post.id),
              completedAs: text(post.completedAs),
              ...(post.completedAsPageId === undefined
                ? {}
                : { completedAsPageId: knownPage(post.completedAsPageId) }),
            },
          ],
    );
    const pageToItem: Record<string, string> = {};
    const pageToThemes: Record<string, string[]> = {};
    for (const id of postIds) {
      const itemId = `mil-notion-${id}`;
      const item = input.roadmap.items.find((i) => i.id === itemId);
      if (
        item &&
        (item.kind !== 'milestone' ||
          item.extensions['content/workflow']?.source !== 'notion:writing-ideas')
      )
        throw new Error('Source item identity collides with local work');
      pageToItem[id] = itemId;
      const themes = input.roadmap.relationships
        .filter((r) => r.from === itemId && r.type === 'delivers')
        .map((r) => r.to);
      const series = item?.extensions['content/workflow']?.series;
      if (series !== undefined) {
        if (!input.roadmap.items.some((i) => i.id === series && i.kind === 'deliverable'))
          throw new Error('Unknown existing theme');
        themes.push(text(series));
      }
      pageToThemes[id] = [...new Set(themes)];
    }
    return {
      valid: true,
      diagnostics: [],
      config: structuredClone(migrated.config),
      provider: migrated.config.adapters.notion,
      policy: {
        schemaVersion: 1,
        statusMapping: structuredClone(statusMapping),
        draftingOverflow: { horizon: 'next', roadmapStatus: 'proposed', stage: 'draft' },
        dataSourceId,
        nowLimit: 2,
        nowSelection,
        nextCuration,
        laterClusters,
        publishedMatches,
        completedAliases,
        pageToItem,
        pageToThemes,
        statusOptions,
      },
      preservedSource: structuredClone(source),
      preservedRoadmap: structuredClone(input.roadmap),
    };
  } catch (error) {
    return {
      valid: false,
      diagnostics: [error instanceof Error ? error.message : 'Invalid migration input'],
    };
  }
}

/** Stable editorial queue; the caller persists selections outside the provider snapshot. */
export function selectNotionNow(
  policy: NotionWorkflowPolicy,
  posts: import('../adapters/notion-types.js').NotionPost[],
): string[] {
  const drafts = posts.filter(
    (p) => !p.archived && !p.inTrash && policy.statusOptions[p.statusOptionId] === 'drafting',
  );
  const selected = [...new Set(policy.nowSelection)]
    .filter((id) => {
      const post = posts.find((p) => p.pageId === id);
      return !post || post.archived || post.inTrash || drafts.some((p) => p.pageId === id);
    })
    .slice(0, 2);
  drafts.sort(
    (a, b) => b.lastEditedAt.localeCompare(a.lastEditedAt) || a.pageId.localeCompare(b.pageId),
  );
  for (const post of drafts)
    if (selected.length < 2 && !selected.includes(post.pageId)) selected.push(post.pageId);
  return selected;
}

export function hasSupportedNotionMapping(policy: {
  schemaVersion: unknown;
  nowLimit: unknown;
  statusMapping: unknown;
  draftingOverflow: unknown;
}): boolean {
  return (
    policy.schemaVersion === 1 &&
    policy.nowLimit === 2 &&
    canonicalJson(policy.statusMapping) === canonicalJson(statusMapping) &&
    canonicalJson(policy.draftingOverflow) ===
      canonicalJson({ horizon: 'next', roadmapStatus: 'proposed', stage: 'draft' })
  );
}
