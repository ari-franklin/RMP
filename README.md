# Roadmap Maintenance Protocol

**A repository-native roadmap system for AI builders and coding agents.**

Roadmap Maintenance Protocol (RMP) gives an agent working through `AGENTS.md` a durable answer to three questions:

1. What matters now?
2. How does this work connect to an outcome or release?
3. What evidence is strong enough to update the roadmap?

RMP is an offline-first CLI. It keeps one canonical roadmap in the repository, observes durable local and Git evidence, records auditable state transitions, and generates matching Markdown and standalone HTML views. There is no hosted account, hidden agent memory, credential store, or second source of truth.

## Why AI Builders Use RMP

Most agents can execute a task but lose the larger product thread between sessions. Plans become stale, completed work remains marked active, deployments get confused with outcomes, and each new agent has to reconstruct intent from scattered files.

RMP turns roadmap maintenance into part of the work:

```text
AGENTS.md activates RMP
        ↓
agent reads canonical roadmap state
        ↓
local plans, releases, measurements, and Git provide evidence
        ↓
authority rules apply factual transitions or propose review
        ↓
ROADMAP.md + roadmap.html + history stay on one revision
```

Strong execution evidence can update execution state automatically. Weak, ambiguous, or strategic evidence becomes a recommendation for a human instead. A deployment may complete a release without pretending the intended customer outcome has been achieved.

## Requirements

- Node.js 20 or newer
- npm
- Git is optional; local evidence works without it

RMP does not require a hosted service, network connection, account, or stored credentials at runtime.

## Quick Start From GitHub

```sh
npm install --save-dev github:ari-franklin/RMP
npx rmp init --non-interactive --accept-agents-update
npx rmp sync
```

Review the generated `ROADMAP.md` or open `.roadmap/roadmap.html` in a browser. Commit the canonical state, generated views, and transition history together.

After an npm release, installation becomes:

```sh
npm install --save-dev roadmap-maintenance-protocol
```

## What Gets Added To `AGENTS.md`

RMP keeps activation intentionally small:

```markdown
## Roadmap maintenance

Follow [RMP.md](./RMP.md) before finishing work that changes plans, delivery
state, releases, deployments, or measured outcomes.
```

The full operating protocol lives in `RMP.md`, so you can improve the protocol without repeatedly rewriting agent instructions. Existing `AGENTS.md` content is preserved. Interactive installation previews the exact addition; non-interactive installation requires `--accept-agents-update` before changing it.

## The Agent Workflow

At the beginning of meaningful work, the agent reads `AGENTS.md`, `RMP.md`, and the current roadmap. Before finishing work that changes plans, delivery, releases, deployments, or measured outcomes, it runs:

```sh
npx rmp sync --dry-run
npx rmp sync
```

RMP then:

1. Collects local and Git evidence.
2. Matches evidence to stable roadmap item IDs.
3. Evaluates the configured authority policy.
4. Applies supported transitions or creates recommendations.
5. Records append-only transition receipts.
6. Validates and atomically updates canonical state and both views.

## Commands

```text
rmp init [--root PATH] [--non-interactive] [--accept-agents-update] [--json]
rmp validate [--root PATH] [--json]
rmp collect [--root PATH] [--dry-run] [--json]
rmp reconcile [--root PATH] [--dry-run] [--json]
rmp render [--root PATH] [--format all|markdown|html] [--dry-run] [--json]
rmp sync [--root PATH] [--format all|markdown|html] [--dry-run] [--json]
```

`sync` collects evidence, applies authorized transitions, records receipts, validates the result, and atomically updates the selected views. `--dry-run` reports the exact changed paths without writing. `--json` emits one versioned machine-readable object and no prose.

Exit codes are `0` for success, `1` for an operational or validation failure, and `2` for invalid command usage.

## Repository Files

| Path                          | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `.roadmap/roadmap.json`       | Canonical roadmap state and revision             |
| `.roadmap/config.json`        | Authority policy, adapters, and view preferences |
| `.roadmap/history.jsonl`      | Append-only transition receipts                  |
| `.roadmap/schema.json`        | Installed state validation contract              |
| `.roadmap/roadmap.html`       | Generated standalone interactive view            |
| `.roadmap/adapters/README.md` | Local adapter record formats                     |
| `ROADMAP.md`                  | Generated readable roadmap summary               |
| `RMP.md`                      | Repository operating protocol                    |
| `AGENTS.md`                   | Minimal activation clause, when authorized       |

`roadmap.json` is the source of truth. Generated views must not be edited as independent roadmap state.

## Evidence And Authority

RMP applies deterministic, corroborated, and successful measured-outcome evidence automatically by default. Inferred, ambiguous, or strategic evidence becomes a recommendation instead of silently changing roadmap state. Every automatic transition records its item, previous and new status, evidence references, authority rule, source, and timestamp in `history.jsonl`.

Authority can be tightened in `.roadmap/config.json`. Treat policy changes as reviewed repository changes; do not broaden automation silently.

### Evidence that can move work

| Evidence                                                       | Default behavior                  |
| -------------------------------------------------------------- | --------------------------------- |
| Explicit completed plan, release record, successful deployment | Automatic execution transition    |
| Corroborated completion signals                                | Automatic transition with receipt |
| Successful outcome measurement                                 | Automatic outcome progress        |
| Commit activity or ambiguous linkage                           | Recommendation                    |
| Priority, scope, or strategy change                            | Recommendation requiring review   |

## Local Evidence

The built-in local adapter recognizes:

- Completed plans under `plans/**/*.md` containing `RMP-Item: <item-id>` and `RMP-Status: completed`
- Release records under `.roadmap/releases/*.json`
- Measurement records under `.roadmap/measurements/*.json`

The Git adapter adds local branch, merge, tag, commit, and changed-file signals when Git is available. See `.roadmap/adapters/README.md` after installation for record examples and the provider-neutral adapter contract.

## Recovery

Writes are staged and committed as one repository transaction. Validation or rendering failures leave prior artifacts unchanged. If a process is interrupted, rerun `rmp validate`, inspect `.roadmap/roadmap.json` and `.roadmap/history.jsonl`, then run `rmp sync --dry-run` before retrying `rmp sync`.

Version control remains the recovery mechanism for accepted roadmap changes. Review and commit canonical state, history, and generated views together.

## Design Guarantees

- **One state, multiple views:** Markdown and HTML carry the same canonical revision.
- **Evidence before movement:** automatic transitions cite their source and authority rule.
- **Bounded autonomy:** agents can update facts without inventing priorities or outcomes.
- **Atomic writes:** failed validation or rendering leaves prior artifacts unchanged.
- **Offline operation:** runtime behavior requires no service, account, or network.
- **Portable agent activation:** the protocol is discoverable through standard `AGENTS.md` instructions.

## Development

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
npm pack --dry-run
```

The E2E suite packs and installs RMP into temporary repositories using npm's offline mode, then exercises the installed CLI. Browser tests verify that the generated HTML remains self-contained and usable at desktop and mobile sizes.

## License

MIT
