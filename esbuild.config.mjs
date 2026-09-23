import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { writeFileSync } from "node:fs";

const prod = process.argv[2] === "production";

// Polyfill import.meta.url for CJS format — the Pi SDK uses fileURLToPath(import.meta.url)
// at module load time to find package.json. In CJS, esbuild replaces `import.meta` with
// an empty object {}, so import.meta.url is undefined, causing fileURLToPath to throw.
// Use a banner to set up a synthetic URL and define to replace import.meta.url with it.
// The real package directory is configured at runtime by src/sdk-runtime.ts, which is
// imported before any Pi SDK modules are evaluated.
const banner = `var __pi_meta_url = 'file:///dummy-pi-plugin/main.js';`;

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  banner: { js: banner },
  define: {
    'import.meta.url': '__pi_meta_url',
  },
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    "@opentelemetry/api",
    ...builtinModules,
  ],
  format: "cjs",
  target: "es2018",
  supported: {
    // Force esbuild to turn dynamic import() into Promise.resolve(require()).
    // Obsidian's renderer rejects node:* dynamic imports as CORS requests.
    "dynamic-import": false,
  },
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  metafile: prod,
})
  .then((result) => {
    if (prod && result.metafile) {
      writeFileSync("meta.json", JSON.stringify(result.metafile, null, 2));
    }
  })
  .catch(() => process.exit(1));