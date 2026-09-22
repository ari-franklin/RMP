import { expect, test } from '@playwright/test';

import type { Roadmap } from '../../src/types/index.js';
import { renderHtml } from '../../src/renderers/html.js';

const state: Roadmap = {
  schemaVersion: '1.0.0',
  revision: 4,
  title: 'Offline roadmap',
  items: [
    {
      id: 'out-adoption',
      kind: 'outcome',
      title: 'Increase adoption',
      status: 'active',
      horizon: 'now',
      commitment: 'planned',
      confidence: 'medium',
      signal: { metric: 'weekly active repositories', target: 10, unit: 'repositories' },
      measurements: [],
      extensions: {},
    },
    {
      id: 'del-html',
      kind: 'deliverable',
      title: 'Standalone HTML',
      status: 'active',
      horizon: 'now',
      commitment: 'committed',
      confidence: 'high',
      extensions: {},
    },
  ],
  relationships: [{ from: 'del-html', to: 'out-adoption', type: 'supports' }],
  evidence: [],
  recommendations: [],
  extensions: {},
};

test('supports offline keyboard navigation, filtering, reset, and proposal export', async ({
  page,
}) => {
  let requests = 0;
  await page.route('**/*', async (route) => {
    requests += 1;
    await route.abort();
  });
  await page.setContent(renderHtml(state));

  const outcomeTab = page.getByRole('tab', { name: 'Outcomes' });
  await outcomeTab.focus();
  await outcomeTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Delivery' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('completed');
  await expect(page.locator('[role="tabpanel"]:not([hidden]) [data-item]:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset local view' }).click();
  await expect(page.locator('[role="tabpanel"]:not([hidden]) [data-item]:visible')).toHaveCount(2);

  await page.getByRole('button', { name: 'Export recommendation proposal' }).click();
  const download = page.locator('a[download]');
  expect(await download.getAttribute('href')).toMatch(/^blob:/);
  expect(requests).toBe(0);
});

test('stacks without horizontal overflow on mobile and exposes print styles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(renderHtml(state));

  expect(
    await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth'),
  ).toBe(true);
  expect(
    await page.evaluate<boolean>("document.documentElement.innerHTML.includes('@media print')"),
  ).toBe(true);
});
