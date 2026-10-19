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

test('supports offline keyboard navigation and filtering', async ({ page }) => {
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

  await outcomeTab.click();
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('completed');
  await expect(page.locator('[role="tabpanel"]:not([hidden]) [data-item]:visible')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('all');
  await expect(page.locator('[role="tabpanel"]:not([hidden]) [data-item]:visible')).toHaveCount(1);

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

test('keeps view preferences across revisions without replaying stale drafts', async ({ page }) => {
  let revision = 4;
  await page.route('http://rmp.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: renderHtml({ ...state, revision }, { stateScope: 'repo-a' }),
    }),
  );
  await page.goto('http://rmp.test/');
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit first delivery window' }).fill('Unsaved draft');
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('active');
  await page.getByRole('combobox', { name: 'Filter by horizon' }).selectOption('now');
  revision += 1;
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Delivery', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toHaveValue('active');
  await expect(page.getByRole('combobox', { name: 'Filter by horizon' })).toHaveValue('now');
  await expect(page.getByRole('textbox', { name: 'Edit first delivery window' })).toHaveText(
    '30 days',
  );
  await expect(page.getByRole('button', { name: 'Save roadmap', exact: true })).toBeDisabled();
});

test('isolates preferences between repositories served at the same URL', async ({ page }) => {
  let scope = 'repo-a';
  await page.route('http://rmp.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: renderHtml(state, { stateScope: scope, defaultView: 'outcome' }),
    }),
  );
  await page.goto('http://rmp.test/');
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  scope = 'repo-b';
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Outcomes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  scope = 'repo-a';
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Delivery', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('saving a draft keeps tab and filter preferences after reload', async ({ page }) => {
  let revision = 4;
  await page.route('http://rmp.test/**', async (route) => {
    if (route.request().method() === 'POST') {
      revision += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, revision }),
      });
    } else {
      await route.fulfill({
        contentType: 'text/html',
        body: renderHtml({ ...state, revision }, { stateScope: 'repo-save' }),
      });
    }
  });
  await page.goto('http://rmp.test/');
  await page.getByRole('tab', { name: 'Delivery', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('active');
  await page.getByRole('textbox', { name: 'Edit first delivery window' }).fill('This week');
  await page.getByRole('textbox', { name: 'Edit first delivery window' }).press('Enter');
  await page.getByRole('button', { name: 'Save roadmap', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-revision', '5');
  await expect(page.getByRole('tab', { name: 'Delivery', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('combobox', { name: 'Filter by status' })).toHaveValue('active');
  await expect(page.getByRole('button', { name: 'Save roadmap', exact: true })).toBeDisabled();
});
