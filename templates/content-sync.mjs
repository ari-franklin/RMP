import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { transformContentCalendarHtml } from './content-calendar.mjs';

/** Trusted local entry point. Configuration cannot select or execute code. */
export async function runContentCalendar(
  { root, command = 'sync', offline = false, dryRun = false, port },
  api,
) {
  if (!['sync', 'view', 'serve', 'refresh', 'render'].includes(command)) {
    throw new Error('Use sync, view, serve, refresh, or render');
  }
  if (dryRun && command === 'serve') throw new Error('Serve does not support dry-run');
  let analytics = null;
  const transformHtml = (html, roadmap) => transformContentCalendarHtml(html, roadmap, analytics);
  const refresh = async () => {
    try {
      analytics = JSON.parse(
        await readFile(join(root, '.roadmap/sources/content-analytics.json'), 'utf8'),
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      analytics = null;
    }
    return api.runSync({
      root,
      mode: command === 'render' ? 'render' : 'sync',
      offline,
      dryRun,
      transformHtml,
    });
  };
  if (command === 'serve')
    return api.startLocalServer({
      root,
      ...(port === undefined ? {} : { port }),
      transformHtml,
      refresh,
    });
  return refresh();
}
