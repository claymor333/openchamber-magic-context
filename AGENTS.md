# Agent Guide

## Repository boundary

- This is the standalone Magic Context extension. Keep its source, tests, manifest, and generated bundles here; do not register or import it from the OpenChamber monorepo.
- Use the published `@openchamber/sdk` contract. Treat changes to that SDK or to Magic Context itself as separate work requiring explicit authorization.
- Do not create or update pull requests for this repository unless the user explicitly asks.

## Workflow

1. Identify the affected feature and read its `docs/features/<feature>.md`. A feature is a cohesive capability or contract that changes what a user or extension can do, see, configure, or rely on. This includes views, actions, settings, data sources, integrations, defaults, and meaningful changes to behavior or limits. Refactors, test-only changes, and performance fixes that preserve documented behavior are not features.
2. For a new feature, create its dedicated living document in `docs/features/` as part of the same change. For an existing feature, update its document in the same change whenever behavior, data sources, limits, or configuration change, or another implementation change makes it inaccurate. Improvements use the existing page unless they form a distinct capability.
3. Read `README.md` before changing install, runtime, privacy, or packaging behavior. `PLAN.md` records the original database/log-only design; use it as historical context, not as current design requirements.
4. Ask before choosing new user-facing behavior, defaults, permissions, or workflows when reasonable alternatives exist.
5. After implementation, update generated bundles and docs, run focused validation, and report anything you could not validate. Do not call feature work complete until the feature document matches the implementation.

## Compatibility boundary

- Keep Magic Context-specific RPC, database, log, path, and version assumptions inside service-side adapters. Keep the panel dependent only on extension-owned, validated DTOs.
- Treat private RPCs and storage schemas as unstable. Discover supported capabilities, validate every response, and handle unsupported or changed shapes as unavailable/partial data rather than empty success or guessed values.
- Keep credentials in the service. Bind local integrations to loopback, validate the discovered Magic Context instance before use, and allowlist read-only operations. Never expose tokens to the panel or accept arbitrary RPC methods, paths, or URLs from it.
- Keep diagnostics metadata-only: parse and allowlist fields before display, never forward raw logs, conversation text, or memory contents, and keep all reads bounded and read-only.
- Make event collection incremental and bounded. Define cursor, deduplication, restart, rotation, and gap behavior; do not create an unbounded duplicate history. Refresh only while the panel needs the data.
- Represent source, freshness, and availability explicitly. A failed read must not erase the last good result or masquerade as authoritative empty data.
- The service runs on the OpenChamber server host with that process user's filesystem access and no OS sandbox. Preserve the same-host limitation and require explicit configuration for non-default paths.

## Implementation and validation

- Panel copy lives in `panel/main.ts`. Keep translation keys complete across its locales when adding or changing user-facing text.
- Keep source and generated bundles in sync. Use `package.json` as the source for build and validation commands; run `bun run verify` after implementation changes.
- Add focused tests for compatibility, authorization, bounds, and failure/fallback behavior. Use isolated fixtures; never modify live Magic Context or OpenCode databases during development or tests.
- For panel or host-service behavior changes, install the local folder in OpenChamber and exercise the affected flow when a test host is available. State clearly when live validation was not possible.
- Update `README.md` when install, runtime, or package-level behavior changes.
