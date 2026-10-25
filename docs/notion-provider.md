# Notion content workflow

The Notion adapter reads one explicitly configured data source. It never writes to
Notion or publication files. The live Blogging migration and acceptance pilot are
still pending N6; do not claim that local implementation proves live freshness.

## Local entry point

Blogging uses `node .roadmap/sync.mjs <command>` with the neighboring RMP checkout
built (`npm run build` in RMP). No pull inside Blogging is needed. Updating another
machine requires pulling/building RMP and installing the local wrapper there.
The portable presentation and orchestration templates live in RMP's `templates/`.
Only synthetic post data appears in RMP tests.

- `sync` or `refresh`: collect configured sources and render the calendar.
- `view`: refresh once and print the exact HTML URL to open in Codex.
- `serve`: refresh once before listening, then serve the calendar on localhost.
  Browser saves use the same presentation. **Refresh source** performs one explicit
  refresh; page loads, health checks, and asset requests do not fetch Notion.
- `render`: rebuild presentation from local data without contacting Notion.
- `--offline`: avoid provider credentials and network calls, retaining an explicit
  offline notice. Static HTML never refreshes itself.
- `--dry-run`: preview sync/render changes without writes; unavailable with serve.

Each refresh preserves Themes, Posts (Kanban), Releases (Published), analytics,
and hidden default panels. Tabs and filters use repository-scoped preferences
independent of roadmap revision. Only explicitly published posts appear in
Published; completed infrastructure milestones do not. Unassigned posts remain
visible under Unassigned. Existing publication dates and source dates are retained.

The presentation callback is trusted application code passed to `runSync`,
`startLocalServer`, and `saveRoadmapChanges`. It runs before the transaction commits.
Repository JSON cannot select scripts or execute shell commands. Source health is
inserted after the transform so it remains above the calendar even after saves.
If the transform fails, the transaction does not replace the existing roadmap.

## Source setup and failures

Bind the source, properties, and status options by ID through the N1 migration
preview before enabling live cutover. Preserve Now selection, aliases, curation,
and theme relationships. Drafting fills at most two Now slots; overflow and
outlining go Next, ideas Later, and publication goes Done.

Online credentials are read from `RMP_NOTION_TOKEN`, `NOTION_TOKEN`, then
`NOTION_API_KEY`. Keep these outside the repository and browser. Responses and
pagination are bounded; failed or incomplete collection retains the last good
source snapshot with a visible notice. A missing legacy configuration is an
uninitialized source, not a successful refresh. Offline mode explicitly reports
that no refresh was attempted.

Blogging's old ingestion scripts remain for rollback until the N6 pilot succeeds.
Do not combine them with the new transaction pipeline. The original presentation
script and maintenance instructions are backed up locally under
`.roadmap/legacy-n5/`. NS adds the ongoing dependency/security controls before N6.
