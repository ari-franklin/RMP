# Roadmap Maintenance Protocol: Design

## Status

Implemented for MVP verification.

## Summary

The Roadmap Maintenance Protocol (RMP) is a portable repository-level system
that keeps roadmaps aligned with planning, delivery, release, deployment, and
measured-outcome evidence.

RMP treats roadmap maintenance as part of doing the work rather than as a
separate administrative task. Agents observe durable project signals, connect
them to roadmap items, make evidence-authorized state changes, propose changes
that require judgment, and regenerate consistent views for agents and humans.

Outcome, delivery, and release roadmaps are projections of one canonical
roadmap state. They are not separate sources of truth.

## Goals

- Keep roadmap status current as normal planning and delivery work happens.
- Give agents enough context to orient themselves and make coherent decisions.
- Give humans readable Markdown and interactive HTML views of the same state.
- Connect outputs and releases to the outcomes they are intended to influence.
- Allow automatic progression when strong, auditable evidence supports it.
- Preserve human control over unsupported or strategic changes.
- Support external evidence providers through a stable adapter contract.
- Remain useful in a repository with no hosted service or external integration.

## Non-Goals

- Replace issue trackers, deployment systems, analytics tools, or planning
  systems.
- Treat commit activity alone as proof of completion or customer impact.
- Turn every backlog item into a roadmap item.
- Manufacture exact dates, commitments, or outcome claims from weak evidence.
- Allow visual edits to silently diverge from canonical roadmap state.
- Require a particular product-development methodology.

## Design Principles

### One state, multiple views

Outcomes, deliverables, milestones, releases, dependencies, evidence, and
decisions live in one model. Each roadmap view selects and presents the parts
needed for a particular decision.

### Evidence before movement

Every automatic transition must cite concrete evidence and the rule that
authorized it. The protocol distinguishes execution evidence from outcome
evidence: a deployment can complete a deliverable without proving that the
desired user or business outcome occurred.

### Automation with bounded authority

Agents may update factual execution state when evidence is strong. They may
recommend strategic changes, but should not quietly invent commitments or
priorities.

### Small, reviewable changes

RMP prefers targeted state transitions over broad roadmap rewrites. Every
transition leaves an audit receipt and can be reviewed or reversed.

### Repository-first portability

The core protocol, state, views, and history work locally. External providers
extend the evidence available to RMP but are not required for basic operation.

## Repository Contract

The recommended installation is:

```text
AGENTS.md                         # Minimal RMP activation clause
RMP.md                            # Complete repository protocol
ROADMAP.md                        # Generated human and agent summary
.roadmap/
  roadmap.json                   # Canonical roadmap state
  schema.json                    # State validation contract
  config.json                    # Authority, views, and adapter configuration
  history.jsonl                  # Append-only transition receipts
  roadmap.html                   # Generated interactive visual artifact
  adapters/
    README.md                    # Adapter interface and installation guidance
```

### AGENTS.md activation

Agents do not universally discover arbitrary Markdown files. `AGENTS.md`
therefore carries a concise activation clause while `RMP.md` owns the complete
protocol.

```markdown
## Roadmap maintenance

Follow [RMP.md](./RMP.md) before finishing work that changes plans, delivery
state, releases, deployments, or measured outcomes.
```

Installation must preserve existing repository instructions, add the clause
only when absent, support a customized protocol path, and verify that the link
resolves. Updating `RMP.md` should not require repeatedly editing `AGENTS.md`.

### Installation prompt

During interactive installation, RMP inspects the repository and handles the
activation clause as follows:

- If `AGENTS.md` exists without an RMP activation clause, show the exact
  proposed addition and placement, then ask the user to approve the update.
- If `AGENTS.md` does not exist, offer to create a minimal file containing the
  activation clause.
- If a valid RMP activation clause already exists, report that activation is
  configured and make no change.
- If an RMP reference exists but is broken or ambiguous, explain the problem
  and propose a repair rather than adding a duplicate clause.
- If the user declines, finish installing the other RMP assets and clearly
  report that automatic agent awareness is not yet enabled.

The prompt must preserve all existing instructions and present a reviewable
diff before writing. In non-interactive environments, the installer must not
modify `AGENTS.md` unless an explicit option authorizes the change. Repeated
installation must be idempotent.

## Canonical Model

The canonical state should represent the following concepts without requiring
every repository to use all of them:

- Strategic anchors and objectives
- Outcomes and measurable signals
- Opportunities, bets, and initiatives
- Deliverables and workstreams
- Milestones and completion criteria
- Releases and readiness gates
- Horizons, lanes, and execution status
- Dependencies and blockers
- Risks and assumptions
- Evidence and source provenance
- Decisions and approvals
- Confidence and commitment
- Transition history

Every roadmap item should have a stable identifier. Relationships should make
it possible to trace a release or deliverable to the outcomes it is intended to
support and to distinguish expected impact from observed impact.

## Roadmap Views

### Outcome view

Shows desired user, product, or business change; current and target signals;
supporting bets; evidence strength; confidence; and unresolved validation.

### Delivery view

Shows active, upcoming, later, blocked, deferred, and completed work. A
Now/Next/Later board is the default presentation when precise scheduling is not
supported.

### Release view

Shows releases, included capabilities, milestones, readiness gates,
dependencies, forecast windows, and confidence. It may use a Gantt-like view
when sequencing and timing evidence justify one.

A release view must distinguish:

- Committed dates from forecasts
- Exact dates from broad planning windows
- Baseline plans from current forecasts
- Delivery completion from outcome achievement

### Dependency view

Shows work sequencing, external dependencies, blockers, and critical paths
without implying unsupported delivery precision.

### Evidence and history view

Explains why state changed, which sources were used, what rule authorized the
change, and whether the transition was automatic or approved.

### Format selection

RMP uses the format-selection guidance from Mr Roadmap to choose how each
roadmap should be presented. Selection considers the intended audience,
horizon, decision supported, use case, uncertainty, evidence strength,
commitment model, dependencies, and available schedule precision.

Supported patterns include:

- Outcome lanes
- Now / Next / Later
- Strategy choice matrix
- Milestones and markers
- Opportunity / solution tree
- Portfolio bets grid
- Quarterly or annual lanes
- Dashboard summary
- Gantt-like release view when schedule evidence supports it

The selector returns the recommended format, its rationale, unmet data needs,
and safe fallback. A repository may use automatic selection, explicitly pin a
format, or configure several named views. Automatic selection changes only the
projection, never canonical roadmap meaning or strategic priority.

When evidence is too weak for the preferred pattern, RMP must render a
provisional roadmap plus visible validation needs rather than create false
precision. The HTML renderer must preserve Mr Roadmap's evidence, outcome,
uncertainty, prioritization, dependency, learning, risk, specificity, and
integrity gates.

## Evidence And Authority

RMP evaluates evidence before changing canonical state.

| Evidence class | Examples | Default authority |
| --- | --- | --- |
| Deterministic | Accepted build phase, passing completion gate, release tag, successful deployment | Update execution state automatically |
| Corroborated | Completed plan plus merged implementation plus passing checks | Update automatically and record the combined evidence |
| Observed outcome | Defined metric reaches its success condition with sufficient measurement | Update outcome progress automatically |
| Inferred | Commit activity, partial implementation, stale plan, likely blocker | Recommend a change |
| Strategic | New priority, changed outcome, reordered bet, newly proposed work | Require approval unless an explicit policy delegates authority |

Repositories may tighten these defaults. They should not silently broaden them
without recording the policy change.

### Transition receipt

Every automatic or approved transition records:

- Roadmap item identifier
- Previous and new state
- Timestamp
- Evidence references
- Evidence class
- Authorizing rule
- Actor or adapter
- Automatic or approved disposition
- Optional rationale
- Reversal or supersession reference when applicable

## Operating Loop

RMP supports three complementary monitoring modes.

### Task-close monitoring

Before finishing meaningful planning, implementation, release, deployment, or
measurement work, an agent checks whether roadmap state should change. If RMP
changes the roadmap, the agent mentions the affected artifacts in its final
response.

### Event monitoring

Repository, CI, release, deployment, and measurement events can trigger
deterministic evaluation. Events are normalized by adapters before they are
matched to roadmap items.

### Reconciliation monitoring

A scheduled or manually invoked steward detects drift, including completed
plans still marked active, deployed work still marked pending, stale evidence,
broken references, conflicting views, and outcome claims without measurements.

The shared loop is:

```text
Observe signals
  -> normalize evidence
  -> match roadmap items
  -> evaluate authority
  -> update or recommend
  -> validate canonical state
  -> regenerate views
  -> append transition receipt
```

State updates, transition receipts, and generated views form one logical
operation. The toolkit should stage and validate all outputs before replacing
the last known-good files. A rendering or validation failure must not leave
canonical state and its views reporting different roadmap versions.

## Recommendations

Recommendations are first-class records, not prose that can be lost in an
agent response. A recommendation includes the proposed transition, supporting
and conflicting evidence, confidence, rationale, and required approver or
decision. Accepted recommendations become ordinary transitions; rejected or
superseded recommendations remain in history.

## Adapter Contract

Adapters translate provider-specific data into normalized RMP evidence. The
initial architecture should support providers such as Git, GitHub, GitLab,
Jira, Linear, CI systems, deployment platforms, and analytics services.

An adapter should:

- Identify its provider and version.
- Report the source event and immutable source reference when available.
- Normalize timestamps, actors, repositories, branches, work-item references,
  deployments, releases, and measurements.
- State its evidence class without deciding roadmap strategy.
- Avoid writing canonical roadmap state directly.
- Handle unavailable credentials or services without corrupting local state.

The RMP engine owns evidence matching, authority evaluation, transitions,
validation, and rendering.

## Human And Agent Experience

`ROADMAP.md` is a concise, deterministic projection optimized for repository
reading and agent context. It should explain current focus, meaningful progress,
blockers, upcoming decisions, and relevant evidence without dumping the entire
backlog.

`.roadmap/roadmap.html` is a self-contained interactive document with view tabs
for outcomes, delivery, releases, dependencies, and evidence/history. It should
support filtering, evidence expansion, and proposed edits. Interactive changes
must produce structured proposals or validated state changes rather than
private browser-only truth.

Each tab uses the selected Mr Roadmap visual pattern instead of forcing every
view into the same board or timeline. The artifact states the selected format
and rationale, and falls back to a simpler pattern when required framing or
schedule evidence is absent.

The HTML view must remain readable offline, responsive, accessible, and useful
when printed. Exact dates and Gantt bars appear only where the underlying state
supports them.

## First Release

The first release is a narrow protocol toolkit containing:

- The complete `RMP.md` protocol
- An idempotent `AGENTS.md` installer
- A versioned canonical schema
- Example configuration and roadmap state
- Validation of state, evidence references, and view consistency
- Repo-local and Git evidence collection
- Deterministic `ROADMAP.md` generation
- Deterministic standalone HTML generation
- Append-only transition history
- A documented adapter interface

GitHub, GitLab, Jira, Linear, deployment, and analytics integrations are
planned adapters rather than first-release requirements.

## Quality And Safety Gates

An RMP update is valid only when:

- The canonical state conforms to its schema.
- Every automatic transition cites evidence and an authorizing rule.
- Delivery completion is not represented as outcome achievement without an
  outcome measurement.
- Generated views agree with canonical state.
- Uncertainty, confidence, and commitment are visible.
- Exact dates and timeline precision are supported by source evidence.
- Strategic changes without delegated authority remain recommendations.
- Existing repository instructions are preserved during installation.
- History remains append-only except through an explicit repair procedure.

## Success Criteria

The initial system is successful when a repository can install RMP, create or
adopt canonical roadmap state, complete a planned phase, detect the completion
from local evidence, advance the matching delivery item, record why it moved,
and regenerate synchronized Markdown and HTML views without manual roadmap
editing.

A second success case should demonstrate that a deployment completes a release
milestone while leaving the related outcome open until its measurement is
observed.

## Deferred Decisions

- Provider-specific authentication and synchronization behavior
- Hosted collaboration or multi-user editing
- Organization-wide portfolio aggregation across repositories
- Policy for signing or cryptographically verifying transition receipts
- Bidirectional writes to external planning providers
