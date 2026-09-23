import esbuild from 'esbuild'
import process from 'process'
import { builtinModules } from 'node:module'
import { writeFileSync } from 'node:fs'

const prod = process.argv[2] === 'production'

// Polyfill import.meta.url for CJS format — see docs/build-notes.md for the
// full rationale. In short: the Pi SDK uses fileURLToPath(import.meta.url) at
// module load time, but esbuild replaces `import.meta` with `{}` in CJS output,
// so `import.meta.url` is undefined. We use a banner to set a synthetic URL and
// a define to rewrite every `import.meta.url` to it. The real package directory
// is configured at runtime by src/sdk-runtime.ts, imported before any Pi SDK
// modules are evaluated.
const banner = `var __pi_meta_url = 'file:///dummy-pi-plugin/main.js';`

esbuild
  .build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    platform: 'node',
    banner: { js: banner },
    define: {
      'import.meta.url': '__pi_meta_url',
    },
    external: [
      'obsidian',
      'electron',
      '@codemirror/autocomplete',
      '@codemirror/collab',
      '@codemirror/commands',
      '@codemirror/language',
      '@codemirror/lint',
      '@codemirror/search',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/common',
      '@lezer/highlight',
      '@lezer/lr',
      '@opentelemetry/api',
      ...builtinModules,
    ],
    format: 'cjs',
    target: 'es2018',
    supported: {
      // Force esbuild to turn dynamic import() into Promise.resolve(require()).
      // Obsidian's renderer rejects node:* dynamic imports as CORS requests.
      'dynamic-import': false,
    },
    logLevel: 'info',
    sourcemap: prod ? 'external' : 'inline',
    sourcesContent: false,
    treeShaking: true,
    outfile: 'main.js',
    minify: prod,
    metafile: prod,
  })
  .then((result) => {
    if (prod && result.metafile) {
      writeFileSync('meta.json', JSON.stringify(result.metafile, null, 2))
    }
  })
  .catch(() => process.exit(1))
