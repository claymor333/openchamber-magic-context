# Magic Context for OpenChamber

A standalone OpenChamber guest extension with a current-session Magic Context sidebar and read-only cache/transform diagnostics.

This repository is independent of the OpenChamber application monorepo. It builds only against the published `@openchamber/sdk` contract and includes the generated panel and service bundles OpenChamber installs. It has no built-in registry entry, monorepo-relative imports, or SDK changes.

## Install

In OpenChamber, open **Settings → Extensions**, enter this Git URL, then choose **Add**:

```text
https://github.com/claymor333/openchamber-magic-context.git
```

Review the service permission prompt before enabling it. The service runs on the OpenChamber server with that user's filesystem access and no OS sandbox. With a remote OpenChamber server, the extension reads files on that server, not on the browser device.

External guest extensions currently load in OpenChamber web and desktop. VS Code and mobile do not load guest extensions yet.

The extension supports OpenChamber web and desktop. VS Code and mobile do not load guest extensions yet.

## What it shows

- Current-session token usage, component breakdown, memory counts, and Historian/Dreamer/transform state from Magic Context's local RPC when a compatible running instance is available.
- A read-only database fallback for saved usage and bounded memory/compartment/note/queued-operation counts.
- Up to 50 recent assistant usage samples from the active OpenCode session, including provider-reported cache-read/cache-write tokens and a normalized matching transform-decision cause.
- Incremental, bounded Magic Context log events containing only allowlisted category/level/time/token metadata.

Source state, last observation, freshness, and compatibility capabilities are reported separately. A failed or unsupported provider does not turn into successful empty data, and the panel keeps last-good values with an explicit stale/error indicator. Details are in [`docs/features/sidebar.md`](docs/features/sidebar.md) and [`docs/features/diagnostics.md`](docs/features/diagnostics.md).

## Compatibility and privacy

Magic Context's RPC routes, discovery files, database schemas, and log formats are private interfaces, not a compatibility guarantee. The service probes the supported RPC methods, verifies the loopback server's process/instance identity, validates response shapes, and visibly degrades when a method or field is missing. This is tested compatibility, not an update-proof contract.

The panel can call only the extension's fixed `/snapshot` and `/events` service routes. The service has a hard-coded read-only RPC allowlist (`sidebar-snapshot` and `status-detail`); it never accepts a panel-selected RPC method, URL, database path, or log path. RPC credentials stay in the service. The panel receives extension-owned validated DTOs, not tokens, raw logs, conversation text, or memory contents.

This is not a complete OpenCode or Magic Context event stream. Cache samples are provider-reported snapshots. Durable transform-decision rows omit some defer/cache-hit passes; Rust mode's separate `mc_pass_trace` store is not read by this package, although known `rust pass:` log lines are normalized to metadata; and process-local Historian/Dreamer activity can change between polls. Log parsing is best-effort and reports detected gaps, rotation, truncation, retention, and backpressure; short-lived or unknown-format records may be missed. A tested read-only Rust module-store adapter is separate follow-up work. Complete TypeScript/Rust pass coverage would require a bounded producer event contract from Magic Context, which this project does not modify.

The service does not start the Dashboard binary, call its HTTP server, execute shell commands, or write to either database. SQLite is opened read-only. If `node:sqlite` is unavailable in the server runtime, database providers are marked unsupported while the RPC/log providers can still operate.

## Paths and configuration

By default the service reads these paths on the OpenChamber server:

- Magic Context storage: `~/.local/share/cortexkit/magic-context` (`context.db` and project RPC discovery files below it)
- OpenCode database: `~/.local/share/opencode/opencode.db`
- Magic Context log: `${TMPDIR}/opencode/magic-context/magic-context.log`

For non-default locations, create this server-side file:

```text
~/.config/openchamber/extensions/openchamber-magic-context.json
```

It may contain only absolute paths using these keys:

```json
{
  "magicContextStorageDir": "/srv/user-data/cortexkit/magic-context",
  "openCodeDatabasePath": "/srv/user-data/opencode/opencode.db",
  "magicContextLogPath": "/var/tmp/opencode/magic-context/magic-context.log"
}
```

Omit keys that should keep their defaults. `magicContextStorageDir` must be the Magic Context storage directory containing `context.db` and `rpc/`. The extension does not assume arbitrary host environment variables are inherited by the service. A malformed config is reported unavailable instead of silently falling back to defaults; restart the extension service after changing it.

## Refresh and runtime

While the panel is visible, snapshots refresh every 15 seconds. The log cursor is polled every 3 seconds only while the Diagnostics tab is open. Polling pauses when the panel document is hidden. Event cursors and the parsed in-memory event ring are bounded and are not persisted as a second history.

Requirements: Bun for development, Node.js 22.5 or newer for SQLite diagnostics, and an OpenChamber instance supporting the published guest SDK/service contract.

```bash
bun install
bun run build
bun run type-check
bun run test
```

OpenChamber does not build extension source during installation. Commit the generated `panel/main.js` and `service/main.js` bundles with source changes. To test locally, use **Settings → Extensions → Add** with this checkout's absolute folder path. Folder installs run from the selected folder; Git installs are copied into OpenChamber's data directory. Bump the package version when publishing a Git update.
