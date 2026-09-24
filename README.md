# Magic Context for OpenChamber

A standalone OpenChamber extension that brings a compact Magic Context sidebar and read-only cache and log diagnostics to the right-hand rail.

This repository is independent of the OpenChamber application monorepo. It builds against the published `@openchamber/sdk` contract and includes the generated panel and service bundles that OpenChamber installs; it does not require an OpenChamber source checkout or built-in extension registry entry.

## Install

In OpenChamber, open **Settings → Extensions**, enter this Git URL, then choose **Add**:

```text
https://github.com/claymor333/openchamber-magic-context.git
```

Review the service permission prompt before enabling it. A service runs on the OpenChamber server with that user's operating-system access and no OS sandbox. On a remote OpenChamber server, diagnostics read that server's files, not files on the browser device.

The extension supports OpenChamber web and desktop. VS Code and mobile do not load guest extensions yet.

## What it shows

- Current session context usage when the persisted Magic Context database has it.
- Session-scoped memory, compartment, note, and queued-operation counts.
- Cache token metrics from OpenCode's message database and relevant cache-decision records.
- Bounded, metadata-only Magic Context log events.

Magic Context's live component breakdown and Historian/Dreamer activity come from a private plugin RPC. The public SDK does not expose it, so this extension labels those values unavailable instead of guessing. This is not a live OpenCode event stream: logs and database metrics are refreshed snapshots.

The service uses the default paths from the local `mcdash` alias:

- `~/.local/share/cortexkit/magic-context/context.db`
- `~/.local/share/opencode/opencode.db`
- `${TMPDIR}/opencode/magic-context/magic-context.log`

It does not start the Dashboard binary, call its HTTP server, execute shell commands, modify either database, or return conversation text, memory contents, or raw log lines. SQLite is opened read-only. If `node:sqlite` is unavailable in the server's Node runtime, database sections are marked unavailable and log diagnostics can still work.

## Development

Requirements: Bun, Node.js 22.5 or newer, and an OpenChamber instance that supports the public SDK.

```bash
bun install
bun run build
bun run type-check
bun run test
```

OpenChamber does not build extension source during installation. Commit the generated `panel/main.js` and `service/main.js` bundles with source changes. To test edits locally, use **Settings → Extensions → Add** with this checkout's absolute folder path. Folder installs run from the selected folder; Git installs are copied into OpenChamber's data directory. Bump the package version when publishing a Git update.
