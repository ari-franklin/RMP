import { LocalEvidenceAdapter } from './local.js';
import { GitEvidenceAdapter } from './git.js';
import { collectNotionSource, type NotionCollectionOptions } from './notion.js';
import type { Adapter } from './types.js';
import type { RmpConfig } from '../types/index.js';

export type NotionRuntimeOptions = Pick<NotionCollectionOptions, 'environment' | 'transport'>;
export function createAdapters(
  config: RmpConfig,
  options: NotionRuntimeOptions & { offline?: boolean; statusOptionIds?: readonly string[] } = {},
): Adapter[] {
  const adapters: Adapter[] = [];
  if (config.adapters.enabled.includes('local')) adapters.push(new LocalEvidenceAdapter());
  if (config.adapters.enabled.includes('git')) adapters.push(new GitEvidenceAdapter());
  if (config.adapters.enabled.includes('notion'))
    adapters.push({
      identity: { provider: 'notion', version: '1', capabilities: ['workItems', 'pagination'] },
      collect: async () => {
        const source = config.adapters.notion
          ? await collectNotionSource({ ...options, config: config.adapters.notion, enabled: true })
          : {
              ok: false as const,
              health: {
                provider: 'notion' as const,
                state: options.offline ? ('offline' as const) : ('uninitialized' as const),
                ...(options.offline ? {} : { errorCode: 'schema' as const }),
              },
              diagnostics: ['Notion source configuration is required.'],
            };
        return { evidence: [], diagnostics: [], source };
      },
    });
  return adapters;
}
