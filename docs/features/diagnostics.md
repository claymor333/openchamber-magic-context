# Diagnostics

The Diagnostics tab shows bounded provider-reported cache samples, current transform status, and incremental Magic Context log metadata. It is not a complete event stream.

## Cache and transform data

The service reads at most the latest 50 assistant-message usage rows from the OpenCode database, scoped to the active session. It shows timestamp, input tokens, cache-read/cache-write tokens, and a ratio derived from provider-reported values. A matching `transform_decisions` row may add a normalized decision cause. With no active session, it does not query cache samples across all sessions.

The live RPC adapter may show current transform failure presence, recomp progress, cache TTL/remaining time, and Historian/Dreamer activity. Free-form RPC strings—including error details, progress messages, paths, and model/configuration data—are dropped before constructing the panel DTO. Durable decision rows and provider usage samples do not describe every internal pass; missing data is not inferred.

## Incremental log events

The optional log provider scans at most 64 KiB per poll, bootstraps from a bounded 256 KiB tail, and keeps at most 500 sanitized events in memory. Each response contains at most 100 events and an opaque cursor. Deduplication uses a hash of normalized metadata; the cursor map is bounded and is not persisted. The provider handles incomplete lines and reports initial-tail, backpressure, rotation, truncation, retention, expired-cursor, unavailable-source, and unsupported-format gaps.

Only an allowlisted category, level, timestamp, parsed token counts, and a stable opaque event ID reach the panel. Known Rust `rust pass:` lines are classified as transform metadata, but their full `mc_pass_trace` store is not read. Raw log lines never leave the service. The format parser is best-effort; unknown log formats become partial availability rather than an authoritative empty result. Restarting the service expires cursors and may leave a visible gap. No second unbounded history is written.

## Refresh and availability

Snapshots refresh every 15 seconds while the panel is visible. Log deltas poll every 3 seconds only while the Diagnostics tab is open; hidden panels stop polling. Manual refresh is also available. Each source reports availability, capabilities, observation time, and freshness. Failed reads preserve last-good values as stale; missing databases, unsupported SQLite runtimes, RPC/schema changes, and log gaps are not reported as successful empty data.

The extension uses only the fixed read-only Magic Context RPC methods `sidebar-snapshot` and `status-detail`. The RPC, database schema, and log format are private Magic Context interfaces and may change. Rust mode's separate `mc_pass_trace` module store is not read here; a validated read-only adapter for it is follow-up work. Durable TypeScript transform-decision rows also omit some defer/cache-hit passes. Complete cross-mode pass coverage would need a bounded Magic Context producer event contract, which this extension does not modify.

The service does not launch the Magic Context Dashboard, call its HTTP server, execute shell commands, or write to either database. See the [README](../../README.md) for server-side path configuration, Node.js requirements, and the same-host limitation.
