# Standalone Magic Context Bridge — Implementation Plan

## Scope and current baseline

Keep the extension in this repository as a normal external OpenChamber guest,
built only against the published `@openchamber/sdk`. The existing standalone
sidebar, SQLite cache diagnostics, metadata-only log parser, feature documents,
and generated guest bundles are the migration baseline from OpenChamber commit
`ddeaa1453`; do not restore its built-in registry integration. The old
`/tmp/opencode/openchamber-magic-context` worktree is no longer present, but its
commit remains available in the OpenChamber Git object database.

The GitHub destination already exists as `claymor333/openchamber-magic-context`
and currently contains the same initial standalone baseline, but is private.
Preserve its history and existing content. Make it public only after the
standalone implementation has been built, verified, pushed, and checked against
the destination. Do not create or modify a pull request. Delete the old pushed
OpenChamber feature branch only after those transfer and verification checks
pass.

## Design

1. **Keep adapters in the service.** Split the service data access into
   replaceable providers for Magic Context's live RPC, the read-only Magic
   Context database, the read-only OpenCode usage database, and an optional
   incremental log tail. The panel may call only extension-owned service routes;
   it never chooses an RPC method, remote URL, database path, or log path.
2. **Discover and authenticate RPC conservatively.** Resolve the project-scoped
   `rpc/<project-hash>/port-*.json` files from the configured Magic Context
   storage directory. Parse a bounded set of records, select a live candidate,
   verify `/health` (`pid`, and `instance_id` when present), then send the
   private bearer token only to loopback. Keep the RPC method set fixed to
   `sidebar-snapshot` and `status-detail`; use bounded timeouts and response
   validation. Treat missing methods, changed shapes, identity mismatches, and
   unsupported fields as unavailable or partial, never as empty success.
3. **Use explicit server-side path configuration.** Default to the documented
   per-user Magic Context storage, OpenCode database, and log locations. For
   non-default locations, read only a fixed extension-owned configuration file
   under the OpenChamber user's config directory; validate absolute paths and
   path lengths there. Do not rely on arbitrary host environment variables or
   let panel requests override configured paths. The current project directory
   and session identifier come from the SDK host context and are validated as
   request identifiers before project-hash/RPC use.
4. **Normalize data into versioned DTOs.** Define extension-owned snapshot and
   event schemas in `shared.ts`. Each source reports its identity, observation
   time, freshness, state (`ready`, `partial`, `missing`, `unsupported`, or
   `error`), and discovered capabilities. Include only allowlisted finite
   numbers, booleans, enums, timestamps, and counts in the panel DTO. Never
   forward free-form RPC strings, memory/conversation contents, raw logs, or
   private credentials. Preserve last-good values with an explicit stale/error
   state.
5. **Make event reads bounded and incremental.** Keep an in-memory bounded log
   tail with an opaque cursor, stable event deduplication, partial-line handling,
   backpressure, and explicit rotation/truncation/retention/gap indicators.
   Never persist a second event history. Poll events more often than snapshots,
   and only while the panel document is active. Cache/transform database samples
   remain bounded snapshot diagnostics rather than a claimed complete event
   stream.
6. **Keep the panel SDK-only.** Render validated DTOs for the current sidebar,
   cache/token samples, and transform status/events. Explain source freshness,
   compatibility limitations, same-host behavior, and unavailable data rather
   than guessing. Do not add monorepo imports, registries, SDK APIs, or producer
   changes.

## Implementation sequence

1. Add provider DTOs, compatibility result types, fixed service routes, and
   server-side configuration/path validation.
2. Implement and test RPC discovery, health identity checks, route allowlisting,
   and response-shape capability probing.
3. Adapt the existing SQLite readers to return source/freshness/capability
   metadata without widening reads or losing their read-only behavior.
4. Implement the bounded cursor-based log-tail provider and update panel polling
   so event deltas are faster than snapshots and stop while hidden.
5. Update the sidebar and diagnostics panel plus
   `docs/features/sidebar.md`, `docs/features/diagnostics.md`, and `README.md`
   to match the new compatibility bridge and its privacy/runtime contract.
6. Add isolated fixtures for discovery, auth, schema drift, source failures,
   cursor duplicates/gaps, rotation, retention, and stale-value behavior. Run
   `bun run verify`, then perform an OpenChamber external-folder smoke test if
   the local instance supports it; report iframe/visual limits accurately.
7. Inspect the exact outgoing changes and destination, push the standalone
   repository without overwriting unrelated content, verify the pushed build,
   make the requested existing repository public, and only then delete
   `origin/feature/magic-context-sidebar-pr`. Never create or update a PR.

## Known compatibility limits

The Magic Context RPC, its per-process discovery files, and database schemas
are private interfaces. This bridge can validate tested versions and degrade
visibly, but cannot promise update-proof compatibility. Current RPC snapshots
are not a general event stream; durable `transform_decisions` rows omit some
defer/cache-hit passes, and process-local Historian/Dreamer activity can vanish
between polls. Rust mode's separate `mc_pass_trace` module store is not read by
this package; known `rust pass:` log lines are reduced to safe metadata, and a
validated read-only provider for that private store is follow-up work. Existing
logs are buffered plain text, so the parser remains best-effort and can report
gaps or miss short-lived events. Complete cross-mode pass coverage would
require a bounded producer event contract in Magic Context, which is explicitly
outside this task.
