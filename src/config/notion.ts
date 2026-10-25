export interface NotionConfig {
  dataSourceId: string;
  titlePropertyId: string;
  statusPropertyId: string;
  publishDatePropertyId?: string;
  typePropertyId?: string;
  blogPropertyId?: string;
  seriesPropertyId?: string;
  requestTimeoutMs: number;
  collectionTimeoutMs: number;
  maxPages: number;
  maxRetries: number;
}

export type NotionConfigInput = Pick<
  NotionConfig,
  'dataSourceId' | 'titlePropertyId' | 'statusPropertyId'
> &
  Partial<NotionConfig>;

/** Apply only after the strict configuration schema has accepted the input. */
export function withNotionDefaults(input: NotionConfigInput): NotionConfig {
  return {
    requestTimeoutMs: 10000,
    collectionTimeoutMs: 60000,
    maxPages: 20,
    maxRetries: 2,
    ...input,
  };
}
