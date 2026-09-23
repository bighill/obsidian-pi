# Build notes

This document explains the non-obvious parts of the production build for the
Obsidian Pi plugin.

## Why `import.meta.url` is polyfilled

The Pi SDK uses `fileURLToPath(import.meta.url)` at module load time to locate
its own `package.json`. That works in native ESM, but Obsidian renders plugins as
CommonJS. When esbuild bundles for CJS, it replaces `import.meta` with an empty
object (`{}`), so `import.meta.url` becomes `undefined` and
`fileURLToPath(undefined)` throws immediately on load.

`esbuild.config.mjs` works around this with two pieces:

1. A banner defines a synthetic URL:

   ```js
   var __pi_meta_url = 'file:///dummy-pi-plugin/main.js'
   ```

2. A `define` rewrites every `import.meta.url` in the bundle to that synthetic
   URL:

   ```js
   define: {
     'import.meta.url': '__pi_meta_url',
   }
   ```

The URL itself is irrelevant at runtime. The real Pi package directory and
runtime paths are configured in `src/sdk-runtime-init.ts` and
`src/sdk-runtime.ts`, which are evaluated before any Pi SDK module is loaded.

## Dynamic imports

Obsidian's renderer treats Node-style `node:*` dynamic imports as CORS requests
and blocks them. The build forces esbuild to lower `import()` to
`Promise.resolve(require())` by disabling the `dynamic-import` feature:

```js
supported: {
  'dynamic-import': false,
}
```

## External modules

`obsidian`, `electron`, and CodeMirror packages are kept external because
Obsidian provides them at runtime. All Node built-in modules are also external.

## Source maps

Production builds emit external source maps (`main.js.map`) with
`sourcesContent: false` to keep the map file small. The map is excluded from the
npm tarball via `package.json` `files` and is ignored by Git via `.gitignore`.

## Platform constraints

- The plugin runs inside Obsidian's Electron renderer, not a full Node process.
- Working-directory resolution prefers the configured `workingDir`, then the
  vault root if the adapter is a `FileSystemAdapter`, then `process.cwd()` as a
  fallback.
- macOS-specific path assumptions from earlier versions were removed; the build
  and runtime helpers now work on any platform supported by Obsidian.
