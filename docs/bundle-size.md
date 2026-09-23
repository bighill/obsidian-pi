# Bundle size analysis

> Generated from `meta.json` produced by `npm run build`.

## Current state

| File | Size |
|------|------|
| `main.js` (production, minified) | ~6.7 MB |
| `meta.json` | ~2.9 MB |

The bundle is the entire `@mariozechner/pi-coding-agent` package plus its
transitive dependencies. The plugin only uses the programmatic session API
(`createAgentSession`, `DefaultResourceLoader`, event subscription), but the
upstream package exposes a single barrel (`dist/index.js`) that re-exports the
CLI, interactive TUI, RPC client, extension loader, and every model provider.

## Largest contributors

Top inputs by estimated bytes in the output bundle:

| Rank | Module | ~Size |
|------|--------|-------|
| 1 | `jiti/dist/babel.cjs` | 1.46 MB |
| 2 | `@google/genai/dist/node/index.mjs` | 0.82 MB |
| 3 | `@opentelemetry/semantic-conventions/.../experimental_attributes.js` | 0.63 MB |
| 4 | `@mariozechner/pi-ai/dist/models.generated.js` | 0.53 MB |
| 5 | `@opentelemetry/semantic-conventions/.../experimental_metrics.js` | 0.21 MB |
| 6 | `web-streams-polyfill/dist/ponyfill.es2018.js` | 0.20 MB |
| 7 | `@mariozechner/pi-coding-agent/dist/modes/interactive/interactive-mode.js` | 0.20 MB |
| 8 | `jiti/dist/jiti.cjs` | 0.18 MB |
| 9 | `@silvia-odwyer/photon-node/photon_rs.js` | 0.13 MB |
| 10 | `highlight.js/lib/languages/mathematica.js` | 0.13 MB |

`jiti` and `@google/genai` together account for more than 2 MB. The interactive
TUI mode (`interactive-mode.js`), `pi-tui` editor components, `photon-node`
image-processing WASM reference, and the full set of `highlight.js` languages
are not exercised by the Obsidian plugin, yet they remain in the bundle.

## Why tree-shaking does not remove them

esbuild does perform tree-shaking (`treeShaking: true` is enabled). The unused
symbols are not removed because:

1. **Single barrel export.** The SDK's `dist/index.js` re-exports everything
   from `dist/main.js`, which in turn imports all modes including the
   interactive TUI. Importing only `createAgentSession` from the package still
   evaluates the entire barrel.

2. **Deep interconnections.** Even importing from `dist/core/sdk.js`
   directly pulls in `core/extensions/loader.js`, which imports the main barrel,
   which pulls the interactive TUI and other optional surfaces back in.

3. **Provider registration.** `@mariozechner/pi-ai` registers every built-in
   provider at module load time, so `@google/genai`, OpenAI SDK, Anthropic SDK,
   etc. are included regardless of which model the user configures.

4. **Side-effectful modules.** `jiti`, `web-streams-polyfill`,
   `@opentelemetry/semantic-conventions`, and `photon-node` are referenced by
   core utilities and cannot be safely dropped without stubbing them out.

## Attempted local optimizations

* Generating and inspecting the `metafile` confirmed the contributors above.
* A local shim that re-exported only the used symbols from SDK subpaths was
  tried. It did **not** reduce the bundle because the core modules still
  transitively depend on the heavy optional surfaces.
* Stubbing out heavy optional modules (TUI, `photon-node`, unused providers)
  would be fragile and risks breaking SDK functionality at runtime.

## Recommendation

The cleanest path to a smaller bundle is an upstream SDK change: provide a
programmatic-only export such as `@mariozechner/pi-coding-agent/sdk` that
excludes the CLI entry, interactive TUI, RPC client, and optionally-loaded
providers. Until that exists, the plugin will continue to ship the full SDK.

## Target

A reasonable release target once a slim SDK export is available:

| Milestone | Target size |
|-----------|-------------|
| Short-term (remove TUI/RPC/image processing) | < 2 MB |
| Long-term (lazy-load only configured provider) | < 1 MB |
