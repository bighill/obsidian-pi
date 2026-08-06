import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";

const prod = process.argv[2] === "production";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
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