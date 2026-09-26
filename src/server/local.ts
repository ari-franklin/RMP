import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { renderHtml, renderMarkdown } from '../renderers/index.js';
import { validateRoadmap } from '../schemas/index.js';
import { RepositoryTransaction } from '../storage/index.js';
import type { Roadmap } from '../types/index.js';
import { canonicalJson } from '../utils/json.js';

export interface LocalServerOptions {
  root: string;
  port?: number;
  host?: string;
}

interface SaveRequest {
  roadmapRevision?: unknown;
  horizonMoves?: unknown;
  deliveryWindows?: unknown;
  itemEdits?: unknown;
  newOutcomes?: unknown;
}

export interface RoadmapSaveRequest {
  roadmapRevision?: unknown;
  horizonMoves?: unknown;
  deliveryWindows?: unknown;
  itemEdits?: unknown;
  newOutcomes?: unknown;
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('Save request is too large');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function applySave(roadmap: Roadmap, input: SaveRequest): Roadmap {
  if (input.roadmapRevision !== roadmap.revision)
    throw new Error('Roadmap changed; reload before saving');
  const moves =
    typeof input.horizonMoves === 'object' && input.horizonMoves !== null
      ? (input.horizonMoves as Record<string, unknown>)
      : {};
  const allowed = new Set(['now', 'next', 'later']);
  const ids = new Set(roadmap.items.map((item) => item.id));
  const pendingOutcomeIds = new Set(
    Array.isArray(input.newOutcomes)
      ? input.newOutcomes.flatMap((value) =>
          typeof value === 'object' &&
          value !== null &&
          typeof (value as Record<string, unknown>).id === 'string'
            ? [String((value as Record<string, unknown>).id)]
            : [],
        )
      : [],
  );
  for (const [id, horizon] of Object.entries(moves)) {
    if (!ids.has(id) && !pendingOutcomeIds.has(id)) throw new Error(`Unknown roadmap item: ${id}`);
    if (typeof horizon !== 'string' || !allowed.has(horizon)) {
      throw new Error(`Invalid horizon for ${id}`);
    }
  }
  const deliveryWindows = Array.isArray(input.deliveryWindows)
    ? input.deliveryWindows.map((entry) => String(entry).trim().slice(0, 40))
    : undefined;
  if (
    deliveryWindows !== undefined &&
    (deliveryWindows.length !== 3 || deliveryWindows.some((entry) => !entry))
  ) {
    throw new Error('Delivery windows must contain three labels');
  }
  const itemEdits =
    typeof input.itemEdits === 'object' && input.itemEdits !== null
      ? (input.itemEdits as Record<string, { title?: unknown; description?: unknown }>)
      : {};
  for (const [id, edit] of Object.entries(itemEdits)) {
    if (!ids.has(id)) throw new Error(`Unknown roadmap item: ${id}`);
    if (typeof edit.title !== 'string' || !edit.title.trim())
      throw new Error(`Title is required for ${id}`);
  }
  const newOutcomes = Array.isArray(input.newOutcomes) ? input.newOutcomes : [];
  const added = newOutcomes.map((value) => {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid new outcome');
    const candidate = value as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id : '';
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const horizon = typeof candidate.horizon === 'string' ? candidate.horizon : 'now';
    const description =
      typeof candidate.description === 'string' ? candidate.description.trim() : '';
    if (!/^out-[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id))
      throw new Error(`Invalid outcome ID: ${id}`);
    if (!title || !allowed.has(horizon))
      throw new Error('New outcomes require a title and valid horizon');
    ids.add(id);
    return {
      id,
      kind: 'outcome' as const,
      title,
      ...(description ? { description } : {}),
      status: 'proposed' as const,
      horizon: (moves[id] ?? horizon) as Roadmap['items'][number]['horizon'],
      commitment: 'planned' as const,
      confidence: 'medium' as const,
      signal: { metric: 'success measure', target: 1, unit: 'target' },
      measurements: [],
      extensions: { 'rmp/workflow': { artifacts: [] } },
    };
  });
  return {
    ...roadmap,
    revision: roadmap.revision + 1,
    items: roadmap.items
      .map((item) => {
        const horizon = moves[item.id];
        const edit = itemEdits[item.id];
        return {
          ...item,
          ...(typeof horizon === 'string'
            ? { horizon: horizon as Roadmap['items'][number]['horizon'] }
            : {}),
          ...(edit === undefined
            ? {}
            : {
                title: typeof edit.title === 'string' ? edit.title.trim() : '',
                description: typeof edit.description === 'string' ? edit.description.trim() : '',
              }),
        };
      })
      .concat(added),
    extensions:
      deliveryWindows === undefined
        ? roadmap.extensions
        : { ...roadmap.extensions, 'rmp/view': { deliveryWindows } },
  };
}

export async function saveRoadmapChanges(
  root: string,
  input: RoadmapSaveRequest,
): Promise<Roadmap> {
  const roadmapPath = join(root, '.roadmap', 'roadmap.json');
  const currentValue: unknown = JSON.parse(await readFile(roadmapPath, 'utf8'));
  const current = validateRoadmap(currentValue);
  if (!current.valid)
    throw new Error(current.diagnostics[0]?.message ?? 'Current roadmap is invalid');
  const updated = applySave(current.value, input);
  const validated = validateRoadmap(updated);
  if (!validated.valid)
    throw new Error(validated.diagnostics[0]?.message ?? 'Updated roadmap is invalid');
  await new RepositoryTransaction(root).commit([
    { path: '.roadmap/roadmap.json', content: canonicalJson(validated.value) },
    { path: '.roadmap/roadmap.html', content: renderHtml(validated.value) },
    { path: 'ROADMAP.md', content: renderMarkdown(validated.value) },
  ]);
  return validated.value;
}

export async function startLocalServer(
  options: LocalServerOptions,
): Promise<{ url: string; close: () => Promise<void> }> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4177;
  const htmlPath = join(options.root, '.roadmap', 'roadmap.html');
  const handleRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    try {
      if (request.method === 'GET' && (request.url === '/' || request.url === '/roadmap.html')) {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        response.end(await readFile(htmlPath, 'utf8'));
        return;
      }
      if (request.method === 'GET' && request.url === '/health') {
        respond(response, 200, { ok: true });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/save') {
        const updated = await saveRoadmapChanges(
          options.root,
          (await readBody(request)) as SaveRequest,
        );
        respond(response, 200, { ok: true, revision: updated.revision });
        return;
      }
      respond(response, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      respond(response, message.includes('reload before saving') ? 409 : 400, { error: message });
    }
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://${host}:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
