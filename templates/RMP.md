# Roadmap Maintenance Protocol

## Agent lifecycle

Run this protocol autonomously. Do not wait for a human to request roadmap
maintenance.

After one-time installation, humans do not run maintenance commands or approve
routine factual transitions. Human interaction is reserved for viewing the
roadmap, requesting specific roadmap work, and resolving genuine product or
strategy decisions surfaced by the agent.

At the start of every task:

1. Run `npx rmp sync` from the repository root.
2. Read `ROADMAP.md`, `.roadmap/roadmap.json`, and `.roadmap/config.json` before
   planning or editing.
3. Use the current roadmap to understand active work, dependencies, and open
   recommendations.

Before the final response after meaningful work:

1. Ensure durable evidence names the relevant roadmap item with
   `RMP-Item: <item-id>` when the relationship is known.
2. Run `npx rmp sync` again after tests and other verification finish.
3. Include resulting roadmap and receipt files with the work. Do not require a
   separate human-triggered sync.
4. Stay quiet when maintenance is a no-op. Mention only material roadmap
   changes, decisions that need human judgment, or failures the agent could not
   resolve. Never bypass a failure silently.

Use `npx rmp sync --dry-run` only to investigate expected changes. It is not a
required approval step because normal sync is validated and atomic.

## Presenting the roadmap

When a user asks to show, see, view, or open the roadmap:

1. Run `npx rmp sync` so the generated view is current.
2. Use the exact repository-relative path `.roadmap/roadmap.html`, including the
   leading-dot directory. Do not use ordinary workspace file listings or search
   by filename; those commonly omit hidden directories.
3. Verify that exact path exists, then open it in Codex using the file or
   artifact viewer.
4. Treat the visual roadmap as the primary response. Do not replace it with a
   prose summary unless the user asks for a summary.
5. If the environment cannot open HTML artifacts, provide a direct clickable
   path to `.roadmap/roadmap.html` and briefly explain the limitation.

When a user asks to summarize or explain the roadmap, respond in chat and open
the visual roadmap only when it would help or the user also asks to see it.

## Authority boundaries

Deterministic and corroborated execution evidence may update execution state.
Observed outcome evidence may update an outcome only when its defined metric
meets the success condition. Inferred or strategic evidence creates a
recommendation unless repository policy explicitly requires approval.

Never turn delivery completion into outcome completion, invent commitments, or
represent an unsupported date as exact.

## Evidence receipts

Every accepted transition must append a receipt to `.roadmap/history.jsonl`.
Record the item, previous and new status, timestamp, evidence references,
evidence class, authorizing rule, actor, disposition, and rationale. Do not
rewrite prior receipts during ordinary operation.

## Final response

When maintenance materially changes the roadmap, report the affected items,
evidence, receipts, and recommendations needing a decision. If maintenance is a
successful no-op, do not burden the human with an operational update. Preserve
the existing roadmap when no transition is authorized.
