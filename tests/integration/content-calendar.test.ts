import { expect, it } from 'vitest';
import { renderHtml } from '../../src/renderers/html.js';
import { item, roadmap } from '../unit/core/helpers.js';
import { transformContentCalendarHtml as transform } from '../helpers/content-calendar.js';

it('preserves custom tabs and badges while excluding unrelated completed work from Published', () => {
  const state = roadmap({
    items: [
      item({
        id: 'mil-post',
        title: 'Public example',
        kind: 'milestone',
        status: 'completed',
        extensions: { 'content/workflow': { stage: 'publish', source: 'notion:writing-ideas' } },
      }),
      item({ id: 'mil-internal', title: 'Internal task', kind: 'milestone', status: 'completed' }),
      item({
        id: 'mil-draft',
        title: 'Draft example',
        kind: 'milestone',
        extensions: { 'content/workflow': { stage: 'draft', source: 'notion:writing-ideas' } },
      }),
    ],
  });
  const html = transform(renderHtml(state), state, {
    posts: [{ title: 'Public example', ga: { views: 42 } }],
  });
  expect(html).toContain('Posts (Kanban)');
  expect(html).toContain('Themes');
  expect(html).toContain('42 views');
  expect(html).toContain('data-content-calendar-hidden');
  const published =
    html.split('<section id="view-release"')[1]?.split('<section id="view-dependency"')[0] ?? '';
  expect(published).toContain('Public example');
  expect(published).not.toContain('Internal task');
  const kanban =
    html.split('<section id="view-outcome"')[1]?.split('<section id="view-release"')[0] ?? '';
  expect(kanban).toContain('Draft example');
  expect(kanban).not.toContain('Public example');
  expect(html).toContain('Unassigned');
});

it('groups curated and unassigned posts, preserves dates and escapes analytics labels', () => {
  const state = roadmap({
    items: [
      item({ id: 'del-theme', kind: 'deliverable', title: 'Editorial theme' }),
      item({ id: 'del-empty', kind: 'deliverable', title: 'Empty theme' }),
      ...['now', 'next', 'later'].map((horizon, n) =>
        item({
          id: `mil-${String(n)}`,
          kind: 'milestone',
          title: `Draft ${String(n)}`,
          horizon: horizon as 'now' | 'next' | 'later',
          description: '',
          extensions: {
            'content/workflow': {
              source: 'notion:writing-ideas',
              notionStatus: 'drafting',
              format: 'essay',
            },
          },
        }),
      ),
      item({
        id: 'mil-published',
        kind: 'milestone',
        title: 'Published one',
        status: 'completed',
        schedule: { precision: 'exact', date: '2026-10-10', evidenceIds: [] },
        extensions: { 'content/workflow': { published: true, postId: '123.example' } },
      }),
      item({
        id: 'mil-old',
        kind: 'milestone',
        title: 'Legacy published',
        description: 'Published 2026-10-01.',
        extensions: { 'content/workflow': { notionStatus: 'published', postId: '456.old' } },
      }),
      item({ id: 'mil-other', kind: 'milestone', title: 'Post without metadata' }),
    ],
    relationships: [
      { from: 'mil-0', to: 'del-theme', type: 'delivers' },
      { from: 'mil-1', to: 'del-theme', type: 'delivers' },
      { from: 'mil-2', to: 'del-theme', type: 'delivers' },
      { from: 'mil-published', to: 'del-theme', type: 'delivers' },
      { from: 'mil-other', to: 'del-theme', type: 'delivers' },
      { from: 'mil-old', to: 'del-empty', type: 'supports' },
    ],
  });
  const analytics = {
    period: { startDate: '2026-10-01', endDate: '2026-10-25' },
    tags: { available: true },
    posts: [
      {
        slug: 'example',
        numericId: '123',
        title: 'Published one',
        tags: ['<script>bad</script>'],
        ga: { views: 100, activeUsers: 10, averageEngagementSeconds: 121 },
      },
      {
        slug: 'alternate',
        numericId: '456',
        title: 'Old post',
        ga: { views: 20, activeUsers: 2, averageEngagementSeconds: 32 },
      },
    ],
  };
  const html = transform(renderHtml(state), state, analytics);
  expect(html).toContain('Oct 10, 2026');
  expect(html).toContain('Oct 1, 2026');
  expect(html).toContain('2m 1s avg');
  expect(html).toContain('32s avg');
  expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
  expect(html).not.toContain('<script>bad</script>');
  expect(html).toContain('Unassigned');
  const repeated = transform(html, state, analytics);
  expect(repeated.match(/<style data-content-calendar-styles>/g)).toHaveLength(1);
});
