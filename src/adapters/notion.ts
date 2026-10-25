import { contentId } from '../utils/ids.js';
import { canonicalJson } from '../utils/json.js';
import { NotionClient, NotionFailure } from './notion-client.js';
import type { NotionPost } from './notion-types.js';
import type { NotionConfig } from '../config/notion.js';
import type { CompleteSourceCollection, SourceHealth } from './notion-types.js';
import type { NotionTransport } from './notion-client.js';
export interface NotionCollectionOptions {
  config: NotionConfig;
  enabled: boolean;
  offline?: boolean;
  statusOptionIds?: readonly string[];
  environment?: (name: string) => string | undefined;
  transport?: Partial<NotionTransport>;
}
export type NotionCollectionResult =
  | { ok: true; collection: CompleteSourceCollection; health: SourceHealth; diagnostics: [] }
  | { ok: false; health: SourceHealth; diagnostics: string[] };
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new NotionFailure('schema');
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.length || value.length > max)
    throw new NotionFailure('schema');
  return value;
}
function array(value: unknown, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new NotionFailure('schema');
  return value as unknown[];
}
function id(value: unknown): string {
  const text = string(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))
    throw new NotionFailure('schema');
  return text.replaceAll('-', '').toLowerCase();
}
function date(value: unknown, timestamp = false): string {
  const text = string(value);
  if (
    !(timestamp ? /^\d{4}-\d{2}-\d{2}T/ : /^\d{4}-\d{2}-\d{2}($|T)/).test(text) ||
    !Number.isFinite(Date.parse(text))
  )
    throw new NotionFailure('schema');
  const datePart = text.slice(0, 10);
  if (new Date(datePart).toISOString().slice(0, 10) !== datePart) throw new NotionFailure('schema');
  return text;
}
function propertyMap(value: unknown): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const valueProperty of Object.values(object(value))) {
    const prop = object(valueProperty);
    const key = string(prop.id);
    if (result.has(key)) throw new NotionFailure('schema');
    result.set(key, prop);
  }
  return result;
}
function property(
  props: Map<string, Record<string, unknown>>,
  key: string,
  types: string[],
): Record<string, unknown> {
  const prop = props.get(key);
  if (!prop || !types.includes(String(prop.type))) throw new NotionFailure('schema');
  return prop;
}
const metadata = [
  ['publishDatePropertyId', 'publishDate', 'date'],
  ['typePropertyId', 'type', 'multi_select'],
  ['blogPropertyId', 'blog', 'select'],
  ['seriesPropertyId', 'series', 'multi_select'],
] as const;
function validateSchema(value: unknown, config: NotionConfig, expected?: readonly string[]) {
  const schema = object(value);
  if (schema.object !== 'data_source' || id(schema.id) !== id(config.dataSourceId))
    throw new NotionFailure('schema');
  const props = propertyMap(schema.properties);
  property(props, config.titlePropertyId, ['title']);
  const status = property(props, config.statusPropertyId, ['status', 'select']);
  const statusType = string(status.type);
  const options = new Map<string, string>();
  for (const raw of array(object(status[statusType]).options)) {
    const option = object(raw);
    const key = string(option.id);
    if (options.has(key)) throw new NotionFailure('schema');
    options.set(key, string(option.name));
  }
  if (!options.size || expected?.some((key) => !options.has(key)))
    throw new NotionFailure('schema');
  for (const [key, , type] of metadata)
    if (config[key] !== undefined) property(props, config[key], [type]);
  return { statusType, options };
}
function normalizePage(
  value: unknown,
  config: NotionConfig,
  schema: ReturnType<typeof validateSchema>,
): NotionPost {
  const page = object(value);
  const parent = object(page.parent);
  if (
    page.object !== 'page' ||
    parent.type !== 'data_source_id' ||
    id(parent.data_source_id) !== id(config.dataSourceId)
  )
    throw new NotionFailure('schema');
  if (
    typeof page.in_trash !== 'boolean' ||
    (page.archived !== undefined && typeof page.archived !== 'boolean')
  )
    throw new NotionFailure('schema');
  const props = propertyMap(page.properties);
  const title = array(property(props, config.titlePropertyId, ['title']).title)
    .map((part) => {
      const text = object(part).plain_text;
      if (typeof text !== 'string' || text.length > 500) throw new NotionFailure('schema');
      return text;
    })
    .join('');
  if (title.length > 500) throw new NotionFailure('schema');
  const status = object(
    property(props, config.statusPropertyId, [schema.statusType])[schema.statusType],
  );
  const statusOptionId = string(status.id);
  const statusName = string(status.name);
  if (schema.options.get(statusOptionId) !== statusName) throw new NotionFailure('schema');
  const post: NotionPost = {
    pageId: id(page.id),
    dataSourceId: config.dataSourceId.toLowerCase(),
    lastEditedAt: date(page.last_edited_time, true),
    title,
    statusOptionId,
    statusName,
    archived: page.archived === true,
    inTrash: page.in_trash,
  };
  for (const [key, field, type] of metadata) {
    const configured = config[key];
    if (configured === undefined) continue;
    const raw = property(props, configured, [type])[type];
    if (type === 'date') {
      if (raw !== null) post.publishDate = date(object(raw).start);
    } else if (type === 'select') {
      if (raw !== null) post.blog = string(object(raw).name);
    } else post[field] = array(raw, 50).map((item) => string(object(item).name));
  }
  return post;
}

/** Read-only collection. No registry wiring or roadmap mutation until N4. */
export async function collectNotionSource(
  options: NotionCollectionOptions,
): Promise<NotionCollectionResult> {
  if (!options.enabled || options.offline)
    return { ok: false, health: { provider: 'notion', state: 'offline' }, diagnostics: [] };
  const now = options.transport?.now ?? Date.now;
  const lastAttemptAt = new Date(now()).toISOString();
  try {
    const environment = options.environment ?? ((name) => process.env[name]);
    const token =
      environment('RMP_NOTION_TOKEN') ??
      environment('NOTION_TOKEN') ??
      environment('NOTION_API_KEY');
    if (!token) throw new NotionFailure('auth');
    const client = new NotionClient(options.config, token, options.transport);
    const schema = validateSchema(await client.schema(), options.config, options.statusOptionIds);
    const posts = new Map<string, NotionPost>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageNumber = 0; ; pageNumber++) {
      if (pageNumber >= options.config.maxPages) throw new NotionFailure('limit');
      const response = object(await client.query(cursor));
      if (
        response.request_status !== undefined &&
        object(response.request_status).type !== 'complete'
      )
        throw new NotionFailure('incomplete');
      if (response.object !== 'list' || typeof response.has_more !== 'boolean')
        throw new NotionFailure('schema');
      for (const raw of array(response.results)) {
        const post = normalizePage(raw, options.config, schema);
        const previous = posts.get(post.pageId);
        if (previous && canonicalJson(previous) !== canonicalJson(post))
          throw new NotionFailure('incomplete');
        posts.set(post.pageId, post);
      }
      if (!response.has_more) {
        if (response.next_cursor !== null) throw new NotionFailure('incomplete');
        break;
      }
      cursor = string(response.next_cursor, 4096);
      if (cursors.has(cursor)) throw new NotionFailure('incomplete');
      cursors.add(cursor);
    }
    const sorted = [...posts.values()].sort((a, b) => a.pageId.localeCompare(b.pageId));
    const fetchedAt = new Date(now()).toISOString();
    const snapshot = {
      schemaVersion: 1 as const,
      provider: 'notion' as const,
      dataSourceId: options.config.dataSourceId.toLowerCase(),
      fetchedAt,
      contentHash: contentId('notion', sorted),
      posts: sorted,
    };
    const evidence = sorted.map((post) => {
      const eventId = contentId('notion', post);
      return {
        id: eventId,
        kind: 'workItem' as const,
        class: 'deterministic' as const,
        observedAt: post.lastEditedAt,
        summary: 'Notion post snapshot observed',
        itemRefs: [],
        provenance: {
          provider: 'notion',
          eventId,
          sourceRef: `https://www.notion.so/${post.pageId}`,
        },
        data: { ...post },
      };
    });
    return {
      ok: true,
      collection: { snapshot, evidence },
      health: { provider: 'notion', state: 'fresh', lastAttemptAt, lastSuccessfulAt: fetchedAt },
      diagnostics: [],
    };
  } catch (error) {
    const code = error instanceof NotionFailure ? error.code : 'transport';
    return {
      ok: false,
      health: { provider: 'notion', state: 'uninitialized', lastAttemptAt, errorCode: code },
      diagnostics: [`Notion collection failed: ${code}`],
    };
  }
}
