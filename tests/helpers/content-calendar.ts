import type { Roadmap } from '../../src/types/index.js';
// The portable JavaScript template is also imported by Blogging's local wrapper.
const templatePath = '../../templates/content-calendar.mjs';
export const { transformContentCalendarHtml } = (await import(templatePath)) as {
  transformContentCalendarHtml: (html: string, roadmap: Roadmap, analytics?: unknown) => string;
};
