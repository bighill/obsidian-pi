# Obsidian Pi Plugin — Backlog

> Last updated: 2026-09-22  
> Generated from `AUDIT.md`. Use ticket numbers in branch names and commit messages.

---

## Legend

- [ ] Open
- [~] In Progress
- [x] Done
- **P0** = blocks release / currently broken
- **P1** = high value / high risk, do next
- **P2** = quality of life / technical debt

---

## Release Blockers

### [x] TICKET-001 — Fix TypeScript compilation
- **Priority:** P0
- **Status:** Done
- **Owner:** unassigned
- **Description:** `npm run typecheck` currently fails with multiple errors:
  - `getBasePath` missing on `DataAdapter` in `src/pi-chat-view.ts:192`
  - `ImageContent` imported from transitive dependency `@mariozechner/pi-ai`
  - Upstream `Intl.Segmenter`/`SegmentData` and `HistoryHandler` type mismatches in `pi-tui` / `obsidian`
- **Acceptance:**
  - [x] `npm run typecheck` exits 0
  - [x] No `as any` workarounds for core SDK calls
  - [x] `DataAdapter` cast is type-safe (`instanceof FileSystemAdapter`)

### [x] TICKET-002 — Resolve security vulnerabilities from `npm audit`
- **Priority:** P0
- **Status:** Done
- **Owner:** unassigned
- **Description:** 6 vulnerabilities (3 moderate, 3 high) in `@anthropic-ai/sdk`, `extract-zip`, and `fast-uri`.
- **Acceptance:**
  - [x] `npm audit` reports 0 high/moderate severity issues, or each remaining issue is documented with a risk acceptance note
  - [x] `@mariozechner/pi-coding-agent` upgraded to latest compatible version and tested
- **Notes:** After upgrading to `0.73.1` (latest `@mariozechner/pi-coding-agent`), 2 residual high-severity findings remain. Both are upstream SDK/TUI issues not exercised by this plugin and are documented in `docs/security-notes.md`.

### [ ] TICKET-003 — Add plugin settings UI
- **Priority:** P0
- **Status:** Open
- **Owner:** unassigned
- **Description:** `PiPluginSettings` declares `model`, `thinkingLevel`, and `workingDir`, but no settings tab exists and values are never saved.
- **Acceptance:**
  - [ ] `PluginSettingTab` implementation created and registered
  - [ ] Text input for `workingDir` with folder validation
  - [ ] Dropdown or text input for `model`
  - [ ] Dropdown for `thinkingLevel` (`off`, `low`, `medium`, `high`, etc.)
  - [ ] Settings persist to Obsidian plugin data via `saveData` / `loadData`
  - [ ] Changes reflect immediately in an active chat session

### [x] TICKET-004 — Write README.md
- **Priority:** P0
- **Status:** Done
- **Owner:** unassigned
- **Description:** There is no documentation for users or contributors.
- **Acceptance:**
  - [x] Installation instructions (manual + BRAT)
  - [x] Required Pi CLI configuration / credentials
  - [x] Explanation of file-system tool risks (read, edit, write, bash)
  - [x] How to use `@`-mentions and image attachments
  - [x] Minimum Obsidian version and platform support

### [x] TICKET-005 — Add LICENSE file
- **Priority:** P0
- **Status:** Done
- **Owner:** unassigned
- **Description:** `package.json` says MIT but no license file is present.
- **Acceptance:**
  - [x] `LICENSE` file added at repo root with MIT license and current year/author

---

## High Priority

### [ ] TICKET-006 — Reduce production bundle size
- **Priority:** P1
- **Status:** Open
- **Owner:** unassigned
- **Description:** `main.js` is 6.4 MB because the entire Pi CLI/TUI SDK is bundled, including terminal UI, RPC client, Acorn parser, graceful-fs, and image-processing WASM references.
- **Acceptance:**
  - [ ] Generate esbuild metafile and identify largest contributors
  - [ ] Determine whether TUI/RPC/parser code can be tree-shaken
  - [ ] Open upstream request for a slimmer SDK export if needed
  - [ ] Target bundle size documented (e.g., < 1 MB compressed)

### [ ] TICKET-007 — Refactor `pi-chat-view.ts` into smaller modules
- **Priority:** P1
- **Status:** Open
- **Owner:** unassigned
- **Description:** File is 650+ lines and mixes session management, DOM rendering, streaming logic, file attachments, and mention UI.
- **Acceptance:**
  - [ ] Extract `PiSessionService` to wrap `createAgentSession`, `DefaultResourceLoader`, and event subscription
  - [ ] Extract attachment helpers into `src/attachments.ts`
  - [ ] Extract message/tool rendering into `src/message-renderer.ts`
  - [ ] `PiChatView` remains focused on view lifecycle and user input only

### [ ] TICKET-008 — Improve SDK runtime initialization reliability
- **Priority:** P1
- **Status:** Open
- **Owner:** unassigned
- **Description:** The esbuild banner polyfills `import.meta.url`, mutates `process.env.PATH`, and sets `PI_OFFLINE`/`PI_PACKAGE_DIR` using brittle macOS path assumptions.
- **Acceptance:**
  - [ ] Stop mutating global `process.env` from the banner
  - [ ] Move environment/path setup into a runtime helper scoped to the module
  - [ ] Handle non-macOS platforms and missing `FileSystemAdapter`
  - [ ] Add retry or user-visible error recovery when `initSession()` fails

### [ ] TICKET-009 — Add unit tests for pure helper modules
- **Priority:** P1
- **Status:** Open
- **Owner:** unassigned
- **Description:** No tests exist for `at-mention.ts` or `inline-suggest.ts` logic.
- **Acceptance:**
  - [ ] Test runner configured (Vitest or Jest)
  - [ ] Tests for `detectMention`, `replaceMention`, `reconcileMentions`, `rankMentions`, `splitFileBlocks`
  - [ ] Tests for `InlineSuggest` selection/movement logic
  - [ ] `npm test` script added and passing

### [ ] TICKET-010 — Add CI with GitHub Actions
- **Priority:** P1
- **Status:** Open
- **Owner:** unassigned
- **Description:** No continuous integration exists.
- **Acceptance:**
  - [ ] Workflow runs `npm install`, `npm run typecheck`, and `npm test` on every PR
  - [ ] Workflow runs on Node versions matching Obsidian/Electron
  - [ ] Workflow verifies `npm run build` succeeds
  - [ ] Branch protection requires CI pass before merge

---

## Medium Priority

### [ ] TICKET-011 — Persist chat history
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** Conversation history is lost when the view is closed.
- **Acceptance:**
  - [ ] Opt-in setting to save chat history
  - [ ] History stored in plugin data or a JSON file in the vault
  - [ ] History restored when the chat view is reopened
  - [ ] User can clear history from the UI

### [ ] TICKET-012 — Add cancel/stop button during agent turns
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** The send button becomes a loader icon while streaming but offers no way to interrupt the agent.
- **Acceptance:**
  - [ ] Cancel button visible during `isStreaming`
  - [ ] Cancel aborts the current SDK prompt if supported
  - [ ] UI returns to idle state safely

### [ ] TICKET-013 — Use Obsidian lifecycle APIs for DOM events
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** Raw `addEventListener` is used for keyboard, click, and blur handlers.
- **Acceptance:**
  - [ ] Replace raw listeners with `this.registerDomEvent`
  - [ ] Ensure listeners are cleaned up on `onClose`

### [ ] TICKET-014 — Harden file attachment handling
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** Large binary/image files are base64-encoded synchronously in the renderer, and `splitFileBlocks` relies on a fragile regex.
- **Acceptance:**
  - [ ] Cap image/file attachment size with user warning
  - [ ] Replace regex-based round-trip with structured attachment metadata
  - [ ] Async file reading does not block UI for large files

### [ ] TICKET-015 — Improve tool-call rendering identity
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** Tool-call IDs in history are built from message index (`history-${i}-${j}`), which can collide across re-renders.
- **Acceptance:**
  - [ ] Use SDK-provided `toolCallId` as the stable key when available
  - [ ] Toggle state keyed by stable IDs

### [ ] TICKET-016 — Improve status/context header UX
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** Model name, context percentage, and status share limited header space; long model names truncate.
- **Acceptance:**
  - [ ] Model name, context usage, and status are each readable
  - [ ] Consider tooltip with full model name / context details
  - [ ] Busy/error states visually distinct

### [ ] TICKET-017 — Add source maps for production build
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** Production bundle has no source maps, making user support hard.
- **Acceptance:**
  - [ ] `build` emits external source maps
  - [ ] Source maps excluded from npm tarball if desired, or included for GitHub releases

---

## Low Priority / Polish

### [ ] TICKET-018 — Upgrade TypeScript to stable release
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** `typescript@5.9.3` is not a normal stable release line.
- **Acceptance:**
  - [ ] Pin to stable `^5.5.0` or latest stable 5.x
  - [ ] `npm run typecheck` still passes

### [ ] TICKET-019 — Upgrade esbuild to latest patch
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** `esbuild@0.28.1` has patch `0.28.2` available.
- **Acceptance:**
  - [ ] Upgrade and verify build output

### [ ] TICKET-020 — Add linting and formatting
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** No ESLint or Prettier configuration exists.
- **Acceptance:**
  - [ ] ESLint configured for TypeScript/Obsidian
  - [ ] Prettier configured
  - [ ] `npm run lint` and `npm run format` scripts added
  - [ ] CI runs lint

### [ ] TICKET-021 — Add `.npmignore` or refine files list
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** `npm pack` currently includes `src/`, `esbuild.config.mjs`, and other build-time files alongside `main.js`.
- **Acceptance:**
  - [ ] Decide what belongs in published tarball
  - [ ] Add `.npmignore` or update `package.json` `files`

### [ ] TICKET-022 — Document `import.meta.url` polyfill rationale
- **Priority:** P2
- **Status:** Open
- **Owner:** unassigned
- **Description:** The esbuild banner contains complex comments and runtime code that future maintainers may not understand.
- **Acceptance:**
  - [ ] Add a dedicated `docs/build-notes.md` or expand comments in `esbuild.config.mjs`
  - [ ] Explain why `import.meta.url` must be polyfilled in Obsidian’s CJS renderer
  - [ ] Document known platform constraints

---

## Done

_No completed tickets yet. Move items here and check the box when merged._

---

## Sprint Suggestion

A minimal release sprint would close:

1. TICKET-001 (typecheck)
2. TICKET-002 (audit)
3. TICKET-003 (settings UI)
4. TICKET-004 (README)
5. TICKET-005 (LICENSE)
6. TICKET-009 (tests) — if time permits
7. TICKET-010 (CI) — if time permits
