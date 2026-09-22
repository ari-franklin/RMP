# Roadmap Maintenance Protocol Toolkit Implementation Plan

> Execute with the `superbuild` skill. Follow red-green-refactor for every
> production behavior and stop at each phase quality gate.
>
> Generated: 2026-09-20
> Status: Approved for execution
> Source design: `docs/design.md`

**Goal:** Build an offline-first TypeScript/npm toolkit that installs RMP into a
repository, maintains one evidence-backed roadmap state, and renders synchronized
outcome, delivery, and release views for agents and humans.

**Architecture:** A thin CLI calls a provider-neutral evidence pipeline and a
pure roadmap decision engine. All writes pass through a repository-scoped
transaction that validates canonical JSON, transition receipts, Markdown, and
standalone HTML before replacing known-good artifacts.

**Tech stack:** Node.js 20+, TypeScript ESM, npm, JSON Schema 2020-12 with Ajv,
Vitest 4, Playwright, ESLint flat config, and Prettier.

## Executive Summary

### Goals

- Install `RMP.md`, starter state, configuration, history, and generated views.
- Preview and request approval for the minimal `AGENTS.md` activation clause.
- Normalize repo-local and Git evidence without network access.
- Automatically apply strongly supported execution and outcome transitions.
- Persist weaker or strategic changes as reviewable recommendations.
- Generate consistent outcome, delivery, release, dependency, and history views.
- Select and explain an appropriate Mr Roadmap pattern for each rendered view.
- Guarantee repository-bound paths and recoverable multi-artifact updates.

### Non-Goals

- Live GitHub, GitLab, Jira, Linear, deployment, or analytics integrations.
- Hosted collaboration, bidirectional provider writes, or credential storage.
- Cross-repository portfolio aggregation.
- Treating commits alone as completion evidence.
- Claiming an outcome from delivery or deployment evidence alone.

### Key Decisions

| Decision | Rationale | Alternatives |
| --- | --- | --- |
| TypeScript CLI distributed through npm | Portable, typed contracts, strong JSON/HTML ecosystem | Python package, shell-only protocol |
| Node built-ins for CLI parsing and prompting | Keeps runtime dependency surface small | Commander, Inquirer |
| JSON Schema 2020-12 plus TypeScript types | Portable external contract plus compile-time safety | TypeScript-only validation |
| One canonical state with projections | Prevents incompatible outcome, delivery, and release roadmaps | Separate roadmap files |
| Conservative policy defaults | Automation changes facts; strategy remains reviewable | Fully autonomous reprioritization |
| Staged file transaction with rollback | Keeps state, history, and views on one revision | Independent direct writes |
| Mr Roadmap format registry with auto or pinned selection | Matches presentation to audience, horizon, uncertainty, and decision without changing canonical meaning | One fixed board or timeline |

### Phase Overview

| Phase | Name | Depends On | Parallel With | Estimate | Status |
| --- | --- | --- | --- | ---: | --- |
| 0 | Project bootstrap and CI | - | - | 5 | Complete |
| 1 | Canonical contracts and protocol assets | 0 | - | 8 | Complete |
| 2A | Safe storage and append-only history | 1 | 2B, 2C | 8 | Complete |
| 2B | Repository installer and AGENTS activation | 1 | 2A, 2C | 5 | Complete |
| 2C | Format selection, projections, and Markdown | 1 | 2A, 2B | 8 | Complete |
| 3A | Local/Git evidence and adapter SDK | 1 | 3B, 3C | 8 | Complete |
| 3B | Authority, transitions, and reconciliation | 1 | 3A, 3C | 8 | Complete |
| 3C | Standalone interactive HTML renderer | 2C | 3A, 3B | 8 | Complete |
| 4 | Transactional orchestration and CLI | 2A-3C | - | 8 | Complete |
| 5 | E2E proof, packaging, and documentation | 4 | - | 8 | Complete |

**Total estimate:** 74 points. No phase exceeds 8 points.

## Technology Detection

The repository is greenfield. At planning time it contains only
`docs/design.md`; it has no `package.json`, `AGENTS.md`, source, tests, quality
tools, CI, or Git metadata. Phase 0 is mandatory. Refactor confidence is **LOW**:
there is no implementation to refactor.

| Tool | Selected baseline | Purpose |
| --- | --- | --- |
| Node.js | `>=20` | ESM runtime, filesystem, process, prompt, and CLI APIs |
| TypeScript | `^6` | Strict static types and declarations |
| Ajv + ajv-formats | current compatible majors | JSON Schema 2020-12 validation |
| Vitest | `^5` | Unit/integration tests and V8 coverage |
| Playwright | current compatible major | HTML interaction/accessibility smoke tests |
| ESLint + typescript-eslint | current compatible majors | Static analysis |
| Prettier | current compatible major | Deterministic formatting |

## Requirements And Acceptance Criteria

| ID | Acceptance criterion |
| --- | --- |
| AC-1 | `rmp init` installs valid assets into an empty fixture repository. |
| AC-2 | Existing `AGENTS.md` content is preserved and the RMP clause is previewed before interactive approval. |
| AC-3 | Non-interactive installation never changes `AGENTS.md` without `--accept-agents-update`. |
| AC-4 | Repeated installation produces no duplicate clause or unnecessary file change. |
| AC-5 | One canonical state represents linked outcomes, deliverables, milestones, releases, dependencies, evidence, and recommendations. |
| AC-6 | A completed build phase can advance a linked delivery item with a receipt. |
| AC-7 | A deployment can complete a release milestone without completing the linked outcome. |
| AC-8 | Weak, ambiguous, or strategic evidence creates a recommendation instead of a state transition. |
| AC-9 | Failed validation or rendering leaves all prior artifacts unchanged. |
| AC-10 | `ROADMAP.md` and `roadmap.html` are deterministic projections of the same state revision. |
| AC-11 | Release view distinguishes committed dates, forecasts, windows, and confidence. |
| AC-12 | The package works offline on macOS, Linux, and Windows with no credential storage. |
| AC-13 | New production code meets 80% line, branch, function, and statement coverage. |
| AC-14 | RMP recommends a Mr Roadmap pattern with rationale and falls back safely when required evidence is missing. |

### Interview Decisions

| Question | Answer | Plan implication |
| --- | --- | --- |
| MVP versus v2 | Narrow toolkit confirmed; live providers deferred | Build adapter contract and fake adapter, not hosted adapters |
| Technology | TypeScript/npm recommendation accepted | ESM CLI package with Node 20+ |
| Security/portability | Offline, no secrets, safe paths, atomic writes, three OS families | Dedicated path and transaction tests plus CI matrix |
| Testing | 80% with unit, integration, and E2E | Vitest thresholds and critical CLI/HTML journeys |

## Research And Existing Patterns

Current primary guidance supports strict TypeScript, Node promise filesystem
APIs with explicit coordination for concurrent writes, npm `bin`/`files` package
metadata, JSON Schema 2020-12, and Vitest V8 coverage with explicit `include`
and thresholds.

Reusable local patterns:

| Source | Reuse |
| --- | --- |
| `asteroid-belt/autorocket/AGENTS.md` | Always-on triggers, lane/status vocabulary, evidence expectation |
| `asteroid-belt/asteroids/teach/teach-roadmapper/src/cli.ts` | TypeScript CLI, schema validation, deterministic JSON/HTML export, Vitest/Playwright shape |
| `_archive/focus-first-roadmap/app/src/data.ts` | Outcome-to-work lineage concepts only; do not reuse CSV/browser storage |

No reusable installer, evidence authority engine, append-only receipt model,
cross-platform transaction, release projection, or provider-neutral adapter was
found.

## Architecture

### System Context

```text
Human or repo agent
        |
        v
     rmp CLI --------------------------+
        |                              |
        v                              v
Local/Git adapters -> normalized evidence -> authority/reconciliation engine
                                              |
                         +--------------------+------------------+
                         v                                       v
                automatic transitions                    recommendations
                         +--------------------+------------------+
                                              v
                              staged repository transaction
                                              |
                  +---------------------------+------------------------+
                  v              v            v            v           v
             roadmap.json   history.jsonl  ROADMAP.md  roadmap.html  diagnostics
```

### Components

| Component | Responsibility |
| --- | --- |
| `src/commands/*` | Parse CLI options and translate results to human/JSON output and exit codes |
| `src/types/*`, `schemas/*` | Versioned public model and validation contracts |
| `src/adapters/*` | Collect provider data and emit normalized evidence only |
| `src/core/*` | Match evidence, evaluate authority, transition state, and recommend |
| `src/storage/*`, `src/history/*` | Repo-bound reads, staged writes, rollback, and receipts |
| `src/renderers/*` | Shared projections plus deterministic Markdown and standalone HTML |
| `src/formats/*` | Mr Roadmap pattern registry, suitability rules, rationale, and fallback selection |
| `src/install/*` | Idempotent installation and authorized `AGENTS.md` change |

### CLI Contract

```text
rmp init [--root PATH] [--non-interactive] [--accept-agents-update] [--json]
rmp validate [--root PATH] [--json]
rmp collect [--root PATH] [--json]
rmp reconcile [--root PATH] [--dry-run] [--json]
rmp render [--root PATH] [--format all|markdown|html] [--json]
rmp sync [--root PATH] [--dry-run] [--json]
```

Exit codes: `0` success, `1` validation/operational failure, `2` invalid usage.
Structured output never mixes human prose into JSON mode.

### Canonical Relationships

```text
Outcome --supportedBy--> Initiative/Deliverable --includedIn--> Release
   |                            |                         |
 measuredBy                  provenBy                 gatedBy
   |                            |                         |
 Metric signal                Evidence                Milestone
```

Delivery completion never traverses this graph as automatic outcome completion.

### Transaction Semantics

1. Resolve and validate all target paths beneath the repository root.
2. Read current revision and calculate intended state, receipt, and views.
3. Write every candidate artifact to a unique staging directory in the repo.
4. Validate candidate schemas, history ordering, and embedded view revision.
5. Move current files to transaction-local backups, then rename staged files.
6. On failure, restore backups and report diagnostics; on success, remove staging.
7. Recover or quarantine an interrupted transaction on the next invocation.

## Implementation Phases

Every task below uses the same mandatory cycle: write the named failing tests,
run the exact red command, implement only the listed contract, run the green
command plus the full suite, refactor while green, and stage only listed files.

### Phase 0: Project Bootstrap And CI (5 points)

**Task: Bootstrap the publishable TypeScript CLI**

**Files:** Create `package.json`, `package-lock.json`, `tsconfig.json`,
`tsconfig.build.json`, `eslint.config.js`, `.prettierrc.json`,
`.prettierignore`, `.gitignore`, `vitest.config.ts`, `src/cli.ts`,
`src/index.ts`, `tests/smoke/package.test.ts`, `.github/workflows/ci.yml`.

**Step 1: Write the failing test**

```ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('package bootstrap', () => {
  it('builds an executable CLI that reports its version', () => {
    execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
    const output = execFileSync(process.execPath, ['dist/cli.js', '--version'], { encoding: 'utf8' });
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

**Step 2: Verify red**

- Command: `npx vitest run tests/smoke/package.test.ts`
- Expected: FAIL because `package.json`/`dist/cli.js` does not exist.

**Step 3: Minimal implementation**

- Configure ESM, `bin.rmp = dist/cli.js`, `files = [dist, schemas, templates]`,
  Node `>=20`, strict TypeScript, and scripts for build, lint, format,
  typecheck, test, coverage, and package checking.
- Use `node:util.parseArgs`; initially support only `--version` and `--help`.
- Configure Vitest V8 thresholds of 80 for lines, branches, functions, and
  statements, explicitly including `src/**/*.ts`.
- CI runs Node 20, 22, and 24 on Linux plus a final Windows/macOS smoke matrix.

**Step 4: Verify green**

- Command: `npm run format && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm pack --dry-run`
- Expected: exit 0; smoke and unit tests pass; coverage thresholds pass; package
  listing contains only available paths from the `dist`, `schemas`, and
  `templates` allowlist. Phase 0 packages `dist`; Phase 1 adds the asset paths.

**Step 5: Stage**

`git add package.json package-lock.json tsconfig*.json eslint.config.js .prettier* .gitignore vitest.config.ts src tests/smoke .github/workflows/ci.yml`

**Definition of Done:** formatter, linter, type checker, tests, coverage, build,
and package dry run all pass with no warnings.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `chore(tooling): bootstrap the RMP TypeScript CLI`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 0 complete, TypeScript/npm CLI and CI configured, Phase 1 defines canonical contracts and protocol assets`**

### Phase 1: Canonical Contracts And Protocol Assets (8 points)

**Task: Define versioned domain, schemas, defaults, and installed protocol**

**Files:** Create `src/types/*.ts`, `src/schemas/index.ts`,
`src/config/{defaults,load,index}.ts`, `schemas/*.schema.json`,
`templates/{RMP.md,AGENTS.clause.md,config.json,roadmap.json,history.jsonl}`,
`templates/adapters/README.md`, and tests under `tests/unit/{schemas,config}`.

**Step 1: Write failing tests**

- Validate a starter roadmap containing linked outcome, deliverable, milestone,
  and release records.
- Reject duplicate IDs, dangling relationships, invalid state versions,
  unqualified exact dates, and completion claims without the required signal.
- Verify conservative defaults allow deterministic/corroborated execution
  transitions, measured outcome transitions, and recommendation-only strategy.
- Verify the installed `RMP.md` contains triggers, authority boundaries,
  evidence receipts, and final-response expectations.

**Step 2: Verify red**

- Command: `npx vitest run tests/unit/schemas tests/unit/config`
- Expected: FAIL with missing schema/config modules.

**Step 3: Minimal implementation**

- Use schema version `1.0.0` and stable string IDs with prefixes: `out-`,
  `del-`, `mil-`, `rel-`, `ev-`, `tr-`, `rec-`.
- Define roadmap item discriminators, relationships, horizons, status,
  commitment, confidence, schedule precision, evidence, recommendations, and
  receipts in both JSON Schema 2020-12 and exported TypeScript types.
- Compile schemas with `Ajv2020`; add formats explicitly; return structured
  diagnostics with JSON pointers instead of throwing raw validator errors.
- Keep `extensions` as namespaced JSON objects; reject unknown top-level fields.
- Make templates valid examples, not placeholders.

**Step 4: Verify green**

- Command: `npm run test -- tests/unit/schemas tests/unit/config && npm run typecheck`
- Expected: all schema/config tests pass and TypeScript exits 0.

**Step 5: Stage**

`git add src/types src/schemas src/config schemas templates tests/unit/schemas tests/unit/config`

**Definition of Done:** schemas validate every template; public types compile;
unknown or inconsistent data fails with actionable diagnostics; all quality
gates pass and new-code coverage is at least 80%.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(schema): define the canonical RMP contracts`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 1 complete, schema v1 and protocol templates created, Phases 2A-2C and 3A-3B build against stable contracts`**

### Phase 2A: Safe Storage And Append-Only History (8 points)

**Task: Implement repo-scoped storage, receipts, and recoverable transactions**

**Files:** Create `src/utils/{paths,files,json,time,ids}.ts`,
`src/storage/{repository,transaction,index}.ts`,
`src/history/{receipts,index}.ts`, and corresponding unit tests.

**Step 1:** Write failing tests for `..` traversal, symlink escape, Windows/POSIX
separators, stable JSON ordering, receipt deduplication, append-only ordering,
successful multi-file replacement, validation failure, mid-commit failure,
rollback, and interrupted-transaction recovery.

**Step 2:** Run `npx vitest run tests/unit/utils tests/unit/storage tests/unit/history`.
Expected: FAIL because storage/history modules are missing.

**Step 3:** Implement realpath-based containment checks; injected filesystem and
clock ports; canonical JSON serialization; SHA-256 content IDs; newline-delimited
receipts; staging, backup, rename, rollback, and recovery manifests. Serialize
writes per repository root and never follow an unapproved target symlink.

**Step 4:** Run `npm run test -- tests/unit/utils tests/unit/storage tests/unit/history && npm run typecheck`.
Expected: all targeted tests pass; full suite remains green.

**Step 5:** `git add src/utils src/storage src/history tests/unit/utils tests/unit/storage tests/unit/history`

**Definition of Done:** cross-platform path tests pass; a simulated failure at
each transaction step restores the last known-good revision; duplicate receipts
are harmless; all standard quality gates and 80% coverage pass.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(storage): add safe transactional roadmap writes`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 2A complete, repo-scoped storage and receipt transaction available, Phase 4 will orchestrate it`**

### Phase 2B: Repository Installer And AGENTS Activation (5 points)

**Task: Install RMP idempotently with explicit AGENTS.md authorization**

**Files:** Create `src/install/{agents-md,diff,install,index}.ts`, fixture repos,
and `tests/unit/install/agents-md.test.ts`, `tests/integration/init.test.ts`.

**Step 1:** Write failing tests for absent, existing, activated, customized,
broken, ambiguous, declined, non-interactive, and explicitly authorized
`AGENTS.md` cases. Assert exact preservation and second-run no-op behavior.

**Step 2:** Run `npx vitest run tests/unit/install tests/integration/init.test.ts`.
Expected: FAIL because installer modules are missing.

**Step 3:** Implement clause detection by resolved RMP link and normalized
heading/content; generate a reviewable unified preview; ask through an injected
prompt port; never edit in non-interactive mode without
`acceptAgentsUpdate: true`; install remaining assets after a decline and return
an `agentAwareness: disabled` diagnostic.

**Step 4:** Run `npm run test -- tests/unit/install tests/integration/init.test.ts`.
Expected: all installer cases pass and snapshots preserve original instructions.

**Step 5:** `git add src/install tests/unit/install tests/integration/init.test.ts tests/fixtures`

**Definition of Done:** install is idempotent; no unapproved instruction edit is
possible; broken references produce repair proposals rather than duplicates;
all quality gates and coverage pass.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(install): add authorized RMP repository setup`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 2B complete, installer and AGENTS activation flow tested, Phase 4 exposes rmp init`**

### Phase 2C: Format Selection, Shared Projections, And Markdown (8 points)

**Task: Select fitting Mr Roadmap patterns and derive synchronized views**

**Files:** Create `src/formats/{types,registry,select-format,index}.ts`,
`src/renderers/{view-model,markdown,index}.ts`, and unit tests.

**Step 1:** Write failing tests proving one state revision yields outcome,
delivery, release, dependency, and history projections; delivery completion does
not complete an outcome; release schedules label forecast versus committed;
Markdown is deterministic and avoids backlog dumping. Add a format matrix that
selects outcome lanes for measured outcomes, Now/Next/Later for horizon clarity,
strategy choice for explicit alternatives, milestones for observable markers,
opportunity trees for discovery lineage, portfolio bets for investment balance,
quarterly lanes for supported planning windows, dashboards for cross-team
visibility, and Gantt-like release views only when scope, dates, and dependencies
have sufficient precision. Test explicit overrides, missing-input diagnostics,
and safe fallbacks.

**Step 2:** Run `npx vitest run tests/unit/formats tests/unit/renderers/view-model.test.ts tests/unit/renderers/markdown.test.ts`.
Expected: FAIL because format selection and renderers are missing.

**Step 3:** Implement a pure format registry whose rules consume audience,
horizon, decision supported, use case, evidence, commitment, uncertainty,
dependencies, and schedule precision. Return the selected format, rationale,
missing inputs, and fallback without mutating canonical state. Implement pure
projection functions with stable ordering and a Markdown renderer showing the
format rationale, strategic anchor, current focus, outcomes, releases, blockers,
recommendations, evidence, validation needs, and revision metadata. Apply Mr
Roadmap's evidence, outcome, uncertainty, format, prioritization, dependency,
learning, risk, specificity, and integrity gates before rendering.

**Step 4:** Run `npm run test -- tests/unit/formats tests/unit/renderers/view-model.test.ts tests/unit/renderers/markdown.test.ts`.
Expected: format matrix, fallback, projection, and Markdown tests pass.

**Step 5:** `git add src/formats src/renderers tests/unit/formats tests/unit/renderers`

**Definition of Done:** every view carries the same revision; schedule precision
and uncertainty remain visible; every automatic format has an inspectable
rationale; a pinned format is honored unless it would violate integrity; Mr
Roadmap quality gates and deterministic snapshots pass.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(formats): select and project fitting roadmap views`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 2C complete, Mr Roadmap format registry plus shared view model and ROADMAP.md ready, Phase 3C renders each HTML pattern`**

### Phase 3A: Local/Git Evidence And Adapter SDK (8 points)

**Task: Normalize offline evidence behind a provider-neutral contract**

**Files:** Create `src/adapters/{types,registry,local,git-client,git,index}.ts`,
test helpers, a fake adapter, and unit/integration tests.

**Step 1:** Write failing tests for explicit plan completion markers, release
files, measurements, branches, merges, tags, changed files, non-Git repos,
ambiguous item matching, duplicate events, adapter errors, and fake-provider
pagination/capability metadata.

**Step 2:** Run `npx vitest run tests/unit/adapters tests/integration/git-evidence.test.ts`.
Expected: FAIL because adapter modules are missing.

**Step 3:** Define adapter identity/version/capabilities, cursor, collection
context, normalized evidence, provenance, and isolated diagnostics. Invoke Git
with argument arrays and no shell. Commits alone are `inferred`; signed or
explicit completion markers, merged plans plus checks, tags, and measurement
records can contribute stronger evidence according to policy.

**Step 4:** Run `npm run test -- tests/unit/adapters tests/integration/git-evidence.test.ts`.
Expected: adapters normalize deterministic fixtures and isolate errors.

**Step 5:** `git add src/adapters tests/unit/adapters tests/integration/git-evidence.test.ts tests/helpers tests/fixtures`

**Definition of Done:** no network is required; Git arguments are injection-safe;
events deduplicate by immutable provenance; fake adapter proves provider
neutrality; all quality gates and coverage pass.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(adapters): collect local and Git roadmap evidence`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 3A complete, normalized adapter SDK plus local/Git evidence ready, Phase 4 wires collection into sync`**

### Phase 3B: Authority, Transitions, And Reconciliation (8 points)

**Task: Decide and explain automatic changes versus recommendations**

**Files:** Create `src/core/{match-evidence,evaluate-authority,apply-transition,create-recommendation,reconcile,validate-consistency,index}.ts` and tests.

**Step 1:** Write failing matrix tests for all evidence classes and state moves,
including conflicts, stale signals, blockers, reversal/supersession, duplicate
processing, strategic changes, delivery-versus-outcome separation, and measured
outcome success.

**Step 2:** Run `npx vitest run tests/unit/core`.
Expected: FAIL because decision engine modules are missing.

**Step 3:** Implement explicit-reference matching first, unique source-link
matching second, and recommendation-only fuzzy/ambiguous handling. Evaluate
repository policy before default policy. Return pure proposed mutations and
receipts; never write files. Reject illegal transitions and record conflicting
evidence in recommendations.

**Step 4:** Run `npm run test -- tests/unit/core && npm run typecheck`.
Expected: authority matrix and invariants pass with no state mutation on errors.

**Step 5:** `git add src/core tests/unit/core`

**Definition of Done:** every automatic transition identifies evidence and rule;
strategic or ambiguous changes remain recommendations; outcome claims require
outcome signals; all quality gates and coverage pass.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(engine): reconcile evidence-backed roadmap state`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 3B complete, pure authority and reconciliation engine ready, Phase 4 adds transactional orchestration`**

### Phase 3C: Standalone Interactive HTML Renderer (8 points)

**Task: Render an offline human roadmap from the shared projection**

**Files:** Create `src/renderers/html.ts`, embedded CSS/JS modules or templates,
`tests/unit/renderers/html.test.ts`, and `tests/e2e/html.spec.ts`.

**Step 1:** Write failing tests for outcome, delivery, release/Gantt,
dependencies, and evidence/history tabs; committed/forecast distinction;
responsive wrapping; keyboard navigation; collapsible evidence; filters; print
styles; no external requests; proposal export; resettable local UI state; and
pattern-specific layouts for Now/Next/Later, outcome lanes, strategy choices,
milestones, opportunity trees, portfolio bets, quarterly lanes, and dashboards.

**Step 2:** Run `npx vitest run tests/unit/renderers/html.test.ts && npx playwright test tests/e2e/html.spec.ts`.
Expected: FAIL because HTML output does not exist.

**Step 3:** Render one self-contained semantic HTML file using the Phase 2C
format registry and Mr Roadmap HTML patterns. Put the roadmap visualization
before long evidence prose and include title, audience, horizon, decision,
strategic anchor, baseline, legend, rationale, evidence, measures, risks,
assumptions, dependencies, open questions, next actions, deferrals, and
validation needs. Embed escaped view data, responsive/print CSS, and minimal
JavaScript. Browser interactions may filter, reorder locally, persist UI state,
reset it, or export recommendation JSON; they must never imply canonical state
changed. Use date-positioned bars only for sufficiently precise release data and
fall back to milestones otherwise.

**Step 4:** Run `npm run test -- tests/unit/renderers/html.test.ts && npm run test:e2e -- tests/e2e/html.spec.ts`.
Expected: unit tests and browser journeys pass with zero network requests.

**Step 5:** `git add src/renderers tests/unit/renderers/html.test.ts tests/e2e/html.spec.ts`

**Definition of Done:** HTML works offline at desktop/mobile viewports, remains
readable when printed, exposes uncertainty without color alone, exports valid
recommendations, and passes all quality gates and coverage.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(html): add interactive multi-view roadmap artifact`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 3C complete, standalone HTML supports all shared views and proposal export, Phase 4 integrates rendering`**

### Phase 4: Transactional Orchestration And CLI (8 points)

**Task: Connect commands to the complete evidence-to-artifact loop**

**Files:** Create `src/core/run-sync.ts`, `src/commands/*.ts`, update
`src/cli.ts`, `src/index.ts`, and add integration tests.

**Step 1:** Write failing tests for every command, option, JSON output, exit code,
dry run, invalid repository, validation failure, collect-only run, render-only
run, no-change sync, automatic transition, recommendation, and renderer failure.

**Step 2:** Run `npx vitest run tests/integration/cli.test.ts tests/integration/sync.test.ts`.
Expected: FAIL because commands/orchestrator are missing.

**Step 3:** Implement `runSync` as collect -> normalize -> match -> evaluate ->
reconcile -> stage state/receipts/recommendations/views -> validate -> commit.
Commands are dependency-injected wrappers. Dry run returns the exact proposed
changes without writing. JSON mode emits one versioned result object.

**Step 4:** Run `npm run test -- tests/integration && npm run typecheck`.
Expected: all command and sync scenarios pass; failure fixtures preserve hashes
of the previous artifacts.

**Step 5:** `git add src/core/run-sync.ts src/commands src/cli.ts src/index.ts tests/integration`

**Definition of Done:** all documented commands and exit codes work; no-change
runs are idempotent; partial writes are impossible in injected failures; all
quality gates and coverage pass.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(cli): orchestrate transactional roadmap sync`

- [x] **CHECKPOINT: Run `/compact focus on: Phase 4 complete, all CLI commands and transactional sync integrated, Phase 5 proves user journeys and package readiness`**

### Phase 5: E2E Proof, Packaging, And Documentation (8 points)

**Task: Prove the MVP journeys and prepare the npm package**

**Files:** Create `README.md`, `LICENSE`, `tests/e2e/{cli,completed-phase,deployment-with-open-outcome}.test.ts`; update package metadata, design status, and CI.

**Step 1:** Write failing process-level tests that install the packed tarball into
temporary repositories and prove AC-1 through AC-13, especially completed-phase
automatic progression and deployment-with-open-outcome separation.

**Step 2:** Run `npm run build && npm pack && npm run test:e2e`.
Expected: FAIL until package assets, docs, and complete journeys are wired.

**Step 3:** Complete npm metadata and executable permissions; document quick
start, generated files, authority, recovery, adapters, and command examples;
add MIT license unless the owner selects another before execution; run CI across
the supported OS/Node matrix.

**Step 4:** Run `npm run format && npm run lint && npm run typecheck && npm run test:coverage && npm run test:e2e && npm run build && npm pack --dry-run`.
Expected: every command exits 0; coverage is at least 80%; packed CLI installs
and passes all critical journeys on supported platforms.

**Step 5:** `git add README.md LICENSE package.json package-lock.json docs tests/e2e .github/workflows/ci.yml`

**Definition of Done:** all acceptance criteria have executable evidence; docs
match commands; package contains no fixtures, secrets, temp transactions, or
coverage output; all quality gates pass with no warnings.

- [x] Code passes linter
- [x] Code passes formatter
- [x] Code passes type checker
- [x] All new tests pass
- [x] All existing tests pass
- [x] Test coverage >= 80% for new code
- [x] No new warnings introduced

**Phase commit message:** `feat(rmp): deliver the offline roadmap maintenance toolkit`

- [x] **CHECKPOINT: Run `/compact focus on: RMP MVP implementation complete, packed CLI and E2E journeys verified, ready for review and release`**

## Testing Strategy

| Layer | Approx. share | Focus |
| --- | ---: | --- |
| Unit | 80% | Schemas, format selection, authority matrix, matching, projections, paths, receipts, renderers |
| Integration | 15% | Fixture repository installation, Git collection, transactions, command orchestration |
| E2E | 5% | Packed CLI install, completed phase, deployment/open outcome, HTML interaction |

Tests assert public behavior and artifact contents, not internal call order.
Filesystem, clocks, prompts, and failure points are injected only where needed.
Snapshots are limited to stable generated artifacts and paired with semantic
assertions. Coverage includes unloaded `src/**/*.ts`, not only imported files.

## Risks, Assumptions, And Known Unknowns

| Item | Risk | Mitigation |
| --- | --- | --- |
| Cross-platform replacement behavior differs | High | Transaction manifest, same-directory staging, fault injection, Windows/macOS/Linux CI |
| Evidence links are ambiguous | High | Stable IDs and explicit links first; ambiguity becomes a recommendation |
| Schema and TypeScript drift | High | Validate shipped templates and maintain schema/type contract tests |
| HTML becomes a second source of truth | High | Read-only embedded revision; edits export recommendations only |
| Git activity is mistaken for completion | High | Classify commits as inferred unless corroborated by explicit completion evidence |
| Future providers distort adapter contract | Medium | Fake paginated adapter and capability metadata in v1 |
| Package name availability is unknown | Low | Resolve before publication; package metadata remains easy to rename |
| License selection | Low | Plan assumes MIT, confirm before Phase 5 publication work |

Assumptions: repositories use UTF-8 text; Git is optional; one process writes a
given repo at a time after lock acquisition; external adapters may eventually
be asynchronous, paginated, unavailable, or rate-limited.

## Research Sources

- TypeScript strict configuration: https://www.typescriptlang.org/tsconfig/strict
- TypeScript configuration reference: https://www.typescriptlang.org/tsconfig/
- Node filesystem API and concurrency warning: https://nodejs.org/api/fs.html
- Node CLI argument parser: https://nodejs.org/api/util.html#utilparseargsconfig
- npm package `bin`, `files`, and `engines`: https://docs.npmjs.com/cli/v11/configuring-npm/package-json/
- JSON Schema 2020-12: https://json-schema.org/draft/2020-12
- Ajv JSON Schema support: https://ajv.js.org/json-schema.html
- Vitest coverage and thresholds: https://vitest.dev/guide/coverage
- Vitest 4 Node requirements: https://vitest.dev/guide/migration.html
- Mr Roadmap workflow and quality gates: `/Users/arifranklin/.codex/skills/mr-roadmap/SKILL.md`
- Mr Roadmap HTML patterns: `/Users/arifranklin/.codex/skills/mr-roadmap/references/html-patterns.md`

## Execution Notes

- Initialize Git before Phase 0 so phase-level diffs are reviewable.
- Parallel phases must use separate agents with disjoint write sets. Coordinate
  shared exports only after each worker returns.
- Do not commit automatically. At each phase completion, report the listed
  conventional commit message and changed files for the user to commit.
- If a phase changes the approved architecture, update `docs/design.md` and this
  plan before continuing.

## Sign-Off

| Role | Status | Date |
| --- | --- | --- |
| Product owner | Approved requirements | 2026-09-20 |
| Plan author | Complete | 2026-09-20 |
| Implementation | Complete | 2026-09-21 |
