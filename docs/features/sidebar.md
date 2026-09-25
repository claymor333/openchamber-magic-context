# Sidebar

The Sidebar tab summarizes live context and memory metadata for the active OpenCode session. The panel talks only to the extension's authenticated local service; Magic Context RPC, database, path, and compatibility details stay inside service-side providers.

## What it shows

- Current context usage, token-component breakdown, compartment/memory/note/queued-operation counts, and current Historian/Dreamer/transform state from the compatible Magic Context `sidebar-snapshot` and `status-detail` RPC methods.
- Saved context usage and durable counts from the Magic Context database when live RPC is unavailable. Counts are session-scoped when the supported schema has a `session_id` column and a session is selected; otherwise a count may cover the table. Soft-deleted rows are excluded when the schema has `deleted_at`.
- Latest input-token and cache-read/cache-write metadata from the active OpenCode session's database row.
- Active session title, or an explicit no-session state. Cache samples are not queried across every session when no session is selected.

The panel never reads or displays memory contents. When an RPC method or response field is unavailable, the corresponding value stays unavailable or falls back to durable database data; the extension does not estimate live values. RPC state and each source's availability, capabilities, observation time, and freshness are visible in the panel.

## Refresh and failure behavior

Snapshots refresh on first load, on manual refresh, after session/project changes, and every 15 seconds while the panel is visible. Polling pauses while the document is hidden. Event deltas use a separate cursor endpoint and are polled every 3 seconds only while the Diagnostics tab is open.

Each provider reports ready, partial, missing, unsupported, error, or not-yet-observed state plus freshness and supported capabilities. Missing, failed, or changed response shapes never masquerade as authoritative empty data. The panel retains last-good values when reads fail and labels reused values stale until a later refresh succeeds.

## Data and privacy

The service reads the Magic Context and OpenCode SQLite databases read-only. It returns counts and token metadata only. The live RPC credential remains service-side, RPC calls are restricted to two hard-coded read-only methods, and the panel cannot supply database paths or arbitrary RPC destinations. It does not return conversation text, memory contents, RPC free-form strings, or raw log lines. See the [README](../../README.md) for default paths and explicit non-default path configuration.

The service runs on the OpenChamber server host. The SDK's current project directory and session ID are validated and used only to scope project RPC discovery and session data; the service does not open the project directory as a file path. With a remote OpenChamber server, data belongs to that server's user and machine, not the browser device.

The RPC, database schemas, and field names are private Magic Context interfaces. Compatibility is probed and validated but cannot be guaranteed across Magic Context updates. The installed guest remains independent of the OpenChamber monorepo and uses only the published SDK.
