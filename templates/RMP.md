# Roadmap Maintenance Protocol

## Triggers

Apply this protocol before finishing work that changes plans, delivery state,
releases, deployments, or measured outcomes. Inspect `.roadmap/roadmap.json`
and `.roadmap/config.json` before proposing a roadmap change.

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

Report roadmap items changed, evidence used, receipts appended, views
regenerated, and recommendations awaiting a decision. If no transition was
authorized, state that clearly and preserve the existing roadmap.
