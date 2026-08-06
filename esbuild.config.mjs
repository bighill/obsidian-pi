import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

// Polyfill import.meta.url for CJS format — the Pi SDK uses fileURLToPath(import.meta.url)
// at module load time to find package.json. In CJS, esbuild replaces `import.meta` with
// an empty object {}, so import.meta.url is undefined, causing fileURLToPath to throw.
// Use a banner to set up the runtime path (__dirname is available in CJS), and define
// to replace import.meta.url with a reference to it.
// Obsidian's Electron context has __dirname pointing at the app bundle, not the plugin dir.
// The Pi SDK needs to find a package.json with piConfig at module load time.
// Strategy: set PI_PACKAGE_DIR env var so the SDK skips the directory walk.
// We find the plugin dir by searching upward from a known path or use a fallback.
const banner = `
try {
  // Try to find our plugin directory by looking for our manifest.json
  var __pi_plugin_dir = null;
  // In Obsidian, plugins are loaded via require() from the vault's .obsidian/plugins/<id>/ dir
  // But __dirname is the Electron renderer dir, so we need another approach.
  // Use the Obsidian app's vault path if available
  if (typeof app !== 'undefined' && app.vault && app.vault.adapter) {
    __pi_plugin_dir = app.vault.adapter.getBasePath() + '/.obsidian/plugins/obsidian-pi';
  }
  if (__pi_plugin_dir) {
    process.env.PI_PACKAGE_DIR = __pi_plugin_dir;
  }
  // Obsidian's Electron has a minimal PATH that does not include homebrew or nvm.
  // The Pi SDK runs npm commands (npm root -g) that need node on PATH.
  // Prepend common macOS node/npm locations to PATH.
  var __pi_path_extras = ['/opt/homebrew/bin', '/usr/local/bin', require('os').homedir() + '/.nvm/versions/node'];
  var __pi_current_path = process.env.PATH || '';
  var __pi_path_parts = __pi_current_path.split(':');
  for (var __pi_i = 0; __pi_i < __pi_path_extras.length; __pi_i++) {
    if (__pi_path_parts.indexOf(__pi_path_extras[__pi_i]) === -1) {
      __pi_path_parts.unshift(__pi_path_extras[__pi_i]);
    }
  }
  process.env.PATH = __pi_path_parts.join(':');
  // Set offline mode so the SDK does not try to run npm root -g (which fails in Electron)
  process.env.PI_OFFLINE = '1';
} catch(e) { /* ignore */ }
var __pi_meta_url = 'file:///dummy-pi-plugin/main.js';
console.log('[obsidian-pi] module load, PI_PACKAGE_DIR:', process.env.PI_PACKAGE_DIR);
`;

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
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
}).then(async () => {
  if (!prod || process.env.OBSIDIAN_PI_COPY) {
    const fs = await import("fs");
    const path = await import("path");
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    const pluginDir = path.join(scriptDir, "../../garden/.obsidian/plugins/obsidian-pi");
    if (fs.existsSync(path.dirname(pluginDir))) {
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.copyFileSync("main.js", path.join(pluginDir, "main.js"));
      fs.copyFileSync("styles.css", path.join(pluginDir, "styles.css"));
      fs.copyFileSync("manifest.json", path.join(pluginDir, "manifest.json"));
      console.log("Copied to garden/.obsidian/plugins/obsidian-pi/");
    }
  }
}).catch(() => process.exit(1));