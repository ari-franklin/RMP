# RMP Adapter Contract

An adapter identifies its provider and version and emits normalized evidence
with immutable source references when available. It may normalize timestamps,
actors, repository references, deployments, releases, work items, and
measurements. It must not write canonical roadmap state or decide strategy.

Adapters should fail without changing repository data when credentials or
services are unavailable. The RMP engine owns matching, authority decisions,
validation, transitions, and rendering.
