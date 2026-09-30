# AGENTS.md — Obsidian Pi

Concise guidance for AI agents working in this repo.

## What this is

Obsidian plugin that embeds the [Pi CLI](https://github.com/earendil-works/pi) agent chat into an Obsidian tab. Written in TypeScript, bundled with esbuild, runs inside Obsidian's Electron renderer (desktop-only).

## Repo layout

```
src/main.ts              Plugin entry: settings, commands, view registration, lifecycle
src/pi-chat-view.ts      Custom ItemView: chat UI, input, @-mentions, session events
src/session-service.ts   Wrapper around Pi SDK createAgentSession / DefaultResourceLoader
src/message-renderer.ts  DOM rendering for messages, tool calls, streaming, attachments
src/settings-tab.ts      Obsidian settings UI
src/at-mention.ts        @-mention detection, fuzzy ranking, attachment formatting
src/attachments.ts       Vault-file → image/text/binary attachment
src/cwd-options.ts       CWD dropdown population
src/cwd-switcher-modal.ts Fuzzy directory switcher command
src/inline-suggest.ts    Autocomplete dropdown component
src/sdk-runtime.ts       Pi SDK env (PI_PACKAGE_DIR, PATH, PI_OFFLINE) setup
src/sdk-runtime-init.ts  Side-effect import evaluated BEFORE any Pi SDK module
styles.css               Theme-safe Obsidian CSS
esbuild.config.mjs       CJS build; polyfills import.meta.url, disables dynamic-import
```

## Build / test / check

```bash
npm run dev          # watch build
npm run build        # production build (outputs main.js + main.js.map + meta.json)
npm run typecheck    # tsc --noEmit
npm run test         # vitest run (jsdom + src/test-setup.ts polyfills)
npm run lint         # eslint src
npm run format       # prettier write
```

CI runs typecheck → lint → test → build on Node 22 and 24.

## Key architecture rules

- `src/sdk-runtime-init.ts` must be imported first in `src/main.ts` before any Pi SDK module. It configures `PI_PACKAGE_DIR`, `PATH`, and `PI_OFFLINE=1`.
- Pi SDK is bundled as a single CJS file. The build polyfills `import.meta.url` and forces `import()` to `require()` because Obsidian's renderer rejects `node:*` dynamic imports.
- Plugin settings (`model`, `thinkingLevel`, `workingDir`, `focus`, `saveHistory`, `history`) are global plugin data, shared across all open chat tabs.
- Each `PiChatView` owns its own `PiSessionService` instance, so sessions are per-tab.
- Working directory logic:
  - Focus off → vault root.
  - Focus on → `workingDir` expanded, or vault root if blank.
  - Toggle / change restarts sessions with reason `'cwd-change'`.
- `@`-mention file picker: type `@` in input; fuzzy search vault files; selecting attaches file inline. Deleting the `@path` token drops the attachment.
- Tool calls render as collapsible cards; in-progress calls get a spinner.

## Code style

- Prettier: no semis, single quotes, trailing commas, 100 width.
- ESLint: `@eslint/js` + `typescript-eslint/recommended` + `eslint-config-prettier`. `no-explicit-any` is off because Pi SDK/Obsidian surfaces use `any`.
- Use Obsidian CSS variables in `styles.css`; no hard-coded colors.

## Current known issues / accepted trade-offs

- Typecheck emits deprecation warnings for `baseUrl` and `moduleResolution=node10` in `tsconfig.json` (TypeScript 6+ deprecation notices).
- `npm audit` has accepted residual findings from `@earendil-works/pi-coding-agent` TUI/installer code and `extract-zip`; this plugin does not use those surfaces (offline mode, no extension install, no HTML export). See `docs/security-notes.md`.
- Production bundle is ~6.7 MB because the Pi SDK's barrel export pulls in CLI/TUI/providers even though only the programmatic session API is used. See `docs/bundle-size.md`.

## Active plan

`PLAN.md` describes switching the ribbon icon / "Open Pi Chat" command to always open a **new** Pi Chat tab instead of focusing an existing one. Each tab starts an independent session and tab title derives from the last user message.

## When changing code

1. Keep `src/sdk-runtime-init.ts` first in `src/main.ts`.
2. Run `npm run typecheck && npm run lint && npm run test` before committing.
3. If adding a setting, add it to `PiPluginSettings`, `DEFAULT_SETTINGS`, and `src/settings-tab.ts`.
4. If the change affects CWD/session lifecycle, verify both `PiChatView` and `restartChatSessions()` paths.
5. Update `PLAN.md` if the change advances or changes the parallel-tabs work.
