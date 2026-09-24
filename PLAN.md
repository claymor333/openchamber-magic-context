# Magic Context OpenChamber extension

## Goal

Ship the Magic Context sidebar and read-only cache/log diagnostics as an independently installable OpenChamber extension. Keep its source, manifest, build, tests, and releases in this repository; do not add it to OpenChamber's built-in extension registry.

## Design

- Use only the published `@openchamber/sdk` contract for the guest panel and host service.
- Include generated `panel/main.js` and `service/main.js` in Git because OpenChamber installs bundles and does not compile extension source.
- Read the default Magic Context database, OpenCode database, and Magic Context log on the OpenChamber server host.
- Keep SQLite read-only, cap log/event results, return metadata only, and never invoke the Dashboard's command server or private plugin RPC.
- Represent live-only component counts and Historian/Dreamer state as unavailable instead of inferring them.

## Validation

1. Build both guest bundles from the standalone package.
2. Run TypeScript checks and Node tests, including read-only and response-boundary checks.
3. Install the repository by local folder path in OpenChamber Settings → Extensions and confirm its rail panel and approved service load.

## Runtime limits

The service requires Node.js 22.5 or newer for `node:sqlite`; older runtimes should continue to show log diagnostics and mark database metrics unavailable. Services run with the OpenChamber server user's full filesystem rights and are not OS-sandboxed. The implementation therefore accesses only fixed defaults, performs no writes or subprocesses, and does not return conversation or memory contents.
