import type { SourceHealth } from '../adapters/notion-types.js';

export function readSourceHealth(text: string | undefined): SourceHealth | undefined {
  if (!text) return undefined;
  const value = JSON.parse(text) as Record<string, unknown>;
  if (
    value.provider !== 'notion' ||
    !['fresh', 'stale', 'offline', 'uninitialized'].includes(String(value.state))
  )
    throw new Error('Invalid source health');
  const result: SourceHealth = { provider: 'notion', state: value.state as SourceHealth['state'] };
  for (const key of ['lastAttemptAt', 'lastSuccessfulAt'] as const) {
    const date = value[key];
    if (date === undefined) continue;
    if (
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T/.test(date) ||
      !Number.isFinite(Date.parse(date))
    )
      throw new Error('Invalid source health timestamp');
    result[key] = new Date(date).toISOString();
  }
  if (value.errorCode !== undefined) {
    if (
      typeof value.errorCode !== 'string' ||
      !['auth', 'access', 'schema', 'timeout', 'limit', 'transport', 'incomplete'].includes(
        value.errorCode,
      )
    )
      throw new Error('Invalid source health category');
    result.errorCode = value.errorCode as NonNullable<SourceHealth['errorCode']>;
  }
  return result;
}
export function failedSourceHealth(
  attempt: SourceHealth,
  previous: SourceHealth | undefined,
  hasSnapshot: boolean,
): SourceHealth {
  return {
    provider: 'notion',
    state: attempt.state === 'offline' ? 'offline' : hasSnapshot ? 'stale' : 'uninitialized',
    ...(attempt.lastAttemptAt ? { lastAttemptAt: attempt.lastAttemptAt } : {}),
    ...(hasSnapshot && previous?.lastSuccessfulAt
      ? { lastSuccessfulAt: previous.lastSuccessfulAt }
      : {}),
    ...(attempt.errorCode ? { errorCode: attempt.errorCode } : {}),
  };
}
export function sourceHealthMessage(health: SourceHealth): string {
  const status = {
    fresh: 'Notion data is current.',
    stale: 'Notion data is stale; showing the last good roadmap.',
    offline: 'Notion is offline; no refresh was attempted.',
    uninitialized: 'Notion has not completed a successful refresh.',
  }[health.state];
  return `${status} Last successful refresh: ${health.lastSuccessfulAt ?? 'never'}.${health.errorCode ? ` Refresh issue: ${health.errorCode}.` : ''}`;
}
export function renderSourceNotice(html: string, health: SourceHealth | undefined): string {
  if (!health) return html;
  const text = sourceHealthMessage(health)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return html.replace(
    /(<body\b[^>]*>)/i,
    `$1<aside role="status" data-source-health="${health.state}" style="padding:16px;background:#fff4cc;color:#302800;border-bottom:2px solid #9b7500">${text}</aside>`,
  );
}
