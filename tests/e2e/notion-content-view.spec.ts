import { expect, test } from '@playwright/test';
import { renderHtml } from '../../src/renderers/html.js';
import { renderSourceNotice } from '../../src/core/source-health.js';
import { transformContentCalendarHtml } from '../helpers/content-calendar.js';
import { item, roadmap } from '../unit/core/helpers.js';

test('calendar retains tabs and filters across revisions, with a visible stale warning', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const state = roadmap({
    items: [
      item({
        id: 'mil-post',
        kind: 'milestone',
        title: 'Example post',
        extensions: { 'content/workflow': { source: 'notion:writing-ideas', stage: 'draft' } },
      }),
    ],
  });
  const html = () =>
    renderSourceNotice(
      transformContentCalendarHtml(renderHtml(state, { stateScope: 'calendar-test' }), state),
      {
        state: 'stale',
        lastSuccessfulAt: '2026-10-20T12:00:00Z',
        errorCode: 'transport',
        provider: 'notion',
      },
    );
  let requests = 0;
  await page.route('http://calendar.test/**', async (route) => {
    requests++;
    await route.fulfill({ contentType: 'text/html', body: html() });
  });
  await page.goto('http://calendar.test/');
  await expect(page.getByRole('tab', { name: 'Themes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Posts (Kanban)', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('proposed');
  expect(errors).toEqual([]);
  state.revision++;
  await page.reload();
  expect(errors).toEqual([]);
  await expect(page.getByRole('tab', { name: 'Posts (Kanban)', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toHaveValue('proposed');
  await expect(page.locator('[data-source-health="stale"]')).toBeVisible();
  const notice = await page.locator('[data-source-health]').boundingBox();
  const tabs = await page.getByRole('tablist').boundingBox();
  expect((notice?.y ?? 0) + (notice?.height ?? 0)).toBeLessThan(tabs?.y ?? 0);
  await expect(page.getByRole('tab', { name: 'Dependencies', exact: true })).toHaveCount(0);
  expect(requests).toBe(2);
  await page.evaluate(
    `Object.keys(localStorage).filter(key => key.startsWith('rmp-ui-preferences-v3-')).forEach(key => { const state = JSON.parse(localStorage.getItem(key)); state.tab = 'view-context'; localStorage.setItem(key, JSON.stringify(state)); });`,
  );
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Themes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
