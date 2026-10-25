# RMP Roadmap

Revision: 24 | Schema: 1.0.0
Selected format: Now / Next / Later
Rationale: Horizon clarity is useful without unsupported date precision.

## Strategic anchor

- **Statuses are contextual to the view one is looking at** (proposed; medium confidence)
- **Roadmap evidence connects across tools and repositories** (active; medium confidence)
- **Roadmap outcomes can launch their next delivery workflow** (proposed; medium confidence)
- **Teams collaborate without weakening roadmap trust** (active; medium confidence)

## Current focus

- **Offline-first RMP toolkit** (completed; high confidence)
- **Notion MVP: Keep Blogging’s editorial roadmap current** (active; medium confidence)
- **Phase 6: Connected evidence — Notion first, GitHub follows** (active; medium confidence)
- **MVP package and critical journeys are verified** (completed; high confidence)
- **N1: Preview migration without losing post IDs or curation** (completed; medium confidence)
- **Notion reference connector passes live reliability and provenance gates** (proposed; medium confidence)
- **Cross-view status semantics and controls** (proposed; medium confidence)
- **Phase 7: Hosted collaboration and multi-user editing** (proposed; low confidence)
- **Phase 9: Signed and verifiable transition receipts** (proposed; medium confidence)
- **Every roadmap view has tested status rules and presentation criteria** (proposed; medium confidence)
- **N2: Read complete Notion snapshots securely** (completed; medium confidence)
- **N3: Map editorial statuses and preserve the two-post Now queue** (completed; medium confidence)
- **N4: Refresh safely with last-good data and stale notices** (completed; medium confidence)
- **N5: Preserve Blogging views on every sync and save** (active; medium confidence)
- **N6: Validate the live Blogging workflow before cutover** (proposed; medium confidence)
- **NS: Verify credential safety and ongoing dependency checks** (proposed; medium confidence)
- **A multi-user pilot resolves concurrent proposals without state divergence** (proposed; low confidence)
- **Threat model and cross-machine verification format are approved** (proposed; medium confidence)
- **GitHub: Keep team release and deployment status current** (proposed; low confidence)
- **GitHub: Validate live release/deployment evidence in a team repository** (proposed; low confidence)
- **GitHub: Define release/deployment mapping and select a team pilot** (proposed; low confidence)

## Outcomes

- **Statuses are contextual to the view one is looking at** (proposed; medium confidence)
- **Roadmap evidence connects across tools and repositories** (active; medium confidence)
- **Roadmap outcomes can launch their next delivery workflow** (proposed; medium confidence)
- **Teams collaborate without weakening roadmap trust** (active; medium confidence)

## Releases

- **Phase 1: Canonical contracts and protocol assets** (completed; high confidence; Published: 2026-09-22)
- **Phase 6: Connected evidence preview** (proposed; medium confidence)
- **Phase 7: Collaboration preview** (proposed; low confidence)
- **Phase 8: Portfolio preview** (proposed; low confidence)
- **Phase 9: Verifiable history preview** (proposed; medium confidence)
- **Phase 10: Bidirectional synchronization preview** (blocked; low confidence)

## Blockers

No blockers are recorded.

## Recommendations

No open recommendations.

## Evidence

- Phases 0-5 are marked complete and establish the tested offline-first toolkit baseline. (deterministic; implementation plan)
- Notion N1 source contracts and migration-preview implementation exist locally with behavioral tests. (deterministic; Local implementation and tests)
- N1 complete: 204 unit/integration tests, eight E2E tests, lint, format, types, build and global/new-module coverage gates pass. No live provider or Blogging migration performed. (deterministic; Verified local quality gates)
- Read-only bounded Notion client and snapshot collection implemented locally with behavioral tests. (deterministic; N2 implementation and verified local test results)
- N2 verified: 259 tests, eight E2E, format/lint/types/build, global coverage and both new modules exceed all 80% gates. No live provider or Blogging cutover claimed. (deterministic; N2 implementation and verified local test results)
- N3 pure editorial projection, source-mirror authority and append-only source audit are implemented locally. (deterministic; N3 implementation and verified local test results)
- N3 verified: 298 tests, eight E2E tests, lint, format, types, build and all global/new-module coverage gates pass. Live refresh and Blogging cutover remain pending. (deterministic; N3 implementation and verified local test results)
- N4 source-refresh orchestration, last-good fallback, process locks and transaction recovery are implemented locally. (deterministic; N4 implementation and verified local test results)
- N4 verified: 333 tests, eight E2E tests, lint, format, types, build and global/new-module coverage gates pass. Blogging presentation, live pilot and security controls remain separate phases. (deterministic; N4 implementation and verified local test results)
- N5 presentation pipeline and Blogging wrapper implemented; 345 tests, nine E2E and code/coverage gates pass. Actual Blogging visual acceptance blocked by browser URL policy; live migration remains pending. (deterministic; Local implementation and verified automated tests)
- Phase 1 canonical contracts and protocol assets were included in the first complete RMP implementation pushed to main. (deterministic; Git commit on origin/main)
- The design defers provider authentication, hosted collaboration, portfolio aggregation, signed receipts, and bidirectional provider writes. (strategic; design document)
- User selected Notion first for the existing Blogging workflow; GitHub follows for team release/deployment status. Provider work is planned, not implemented. Roadmap detail added at user request. (strategic; User-approved provider sequence and Notion implementation plan)
- RMP now renders delivery as a horizontal output schedule and releases as an evidence-backed chronology, enabling its own post-MVP roadmap to use the protocol. (deterministic; Git commit)

## Validation needs

- low uncertainty

