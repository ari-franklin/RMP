import type { NotionConfig } from '../config/notion.js';
import { loadConfig } from '../config/load.js';
export type NotionFailureCode =
  'auth' | 'access' | 'schema' | 'timeout' | 'limit' | 'transport' | 'incomplete';
export class NotionFailure extends Error {
  constructor(readonly code: NotionFailureCode) {
    super(`Notion collection failed: ${code}`);
  }
}
export interface NotionTransport {
  fetch: typeof globalThis.fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
const retryable = new Set([500, 502, 503, 504, 529]);
const responseLimit = 2 * 1024 * 1024;
const collectionLimit = 20 * 1024 * 1024;

/** One instance owns one collection's cumulative request, time and byte budgets. */
export class NotionClient {
  private readonly transport: NotionTransport;
  private readonly deadline: number;
  private lastStart = -Infinity;
  private bytes = 0;
  private readonly config: NotionConfig;
  constructor(
    config: NotionConfig,
    private readonly token: string,
    transport: Partial<NotionTransport> = {},
  ) {
    const result = loadConfig({ adapters: { notion: config } });
    if (!result.valid || !result.config.adapters.notion) throw new NotionFailure('schema');
    if (!token.trim() || /[\r\n]/.test(token)) throw new NotionFailure('auth');
    this.config = result.config.adapters.notion;
    this.transport = {
      fetch: globalThis.fetch,
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ...transport,
    };
    this.deadline = this.transport.now() + config.collectionTimeoutMs;
  }
  schema(): Promise<unknown> {
    return this.request('GET');
  }
  query(cursor?: string): Promise<unknown> {
    return this.request(
      'POST',
      JSON.stringify({ page_size: 100, ...(cursor === undefined ? {} : { start_cursor: cursor }) }),
    );
  }
  private async pause(ms: number): Promise<void> {
    if (ms >= this.deadline - this.transport.now()) throw new NotionFailure('limit');
    if (ms > 0) await this.transport.sleep(ms);
    if (this.transport.now() >= this.deadline) throw new NotionFailure('timeout');
  }
  private async request(method: 'GET' | 'POST', body?: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      await this.pause(Math.max(0, 400 - (this.transport.now() - this.lastStart)));
      this.lastStart = this.transport.now();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let response: Response | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => {
              controller.abort();
              reject(new NotionFailure('timeout'));
            },
            Math.min(this.config.requestTimeoutMs, this.deadline - this.lastStart),
          );
        });
        const operation = async () => {
          response = await this.transport.fetch(
            `https://api.notion.com/v1/data_sources/${this.config.dataSourceId}${method === 'POST' ? '/query' : ''}`,
            {
              method,
              redirect: 'manual',
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${this.token}`,
                'Notion-Version': '2026-03-11',
                'Content-Type': 'application/json',
              },
              ...(body === undefined ? {} : { body }),
            },
          );
          if (response.status !== 200) return { response };
          if (!response.body) throw new NotionFailure('schema');
          reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            this.bytes += chunk.value.byteLength;
            if (size > responseLimit || this.bytes > collectionLimit)
              throw new NotionFailure('limit');
            chunks.push(chunk.value);
          }
          const text = Buffer.concat(chunks).toString('utf8');
          if (text.includes(this.token)) throw new NotionFailure('schema');
          let value: unknown;
          try {
            value = JSON.parse(text) as unknown;
          } catch {
            throw new NotionFailure('schema');
          }
          if (JSON.stringify(value).includes(JSON.stringify(this.token).slice(1, -1)))
            throw new NotionFailure('schema');
          return { value };
        };
        const result = await Promise.race([operation(), timeout]);
        if (this.transport.now() >= this.deadline) throw new NotionFailure('timeout');
        if ('value' in result) return result.value;
        const status = result.response.status;
        if (status === 401) throw new NotionFailure('auth');
        if (status === 403 || status === 404) throw new NotionFailure('access');
        if (status !== 429 && !retryable.has(status)) throw new NotionFailure('schema');
        if (attempt >= this.config.maxRetries) throw new NotionFailure('limit');
        let delay = 1000 * 2 ** attempt;
        if (status === 429) {
          const header = result.response.headers.get('Retry-After');
          if (header === null || !/^\d+(\.\d+)?$/.test(header)) throw new NotionFailure('limit');
          delay = Number(header) * 1000;
        }
        clearTimeout(timer);
        controller.abort();
        await this.pause(delay);
      } catch (error) {
        if (error instanceof NotionFailure) throw error;
        if (attempt >= this.config.maxRetries) throw new NotionFailure('transport');
        clearTimeout(timer);
        controller.abort();
        await this.pause(1000 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
        controller.abort();
        if (reader) void reader.cancel().catch(() => {});
        else if (response?.body) void response.body.cancel().catch(() => {});
      }
    }
  }
}
