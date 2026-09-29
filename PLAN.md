# Plan: Open multiple parallel Pi Chat tabs from the ribbon

## Goal
Change the ribbon icon behavior so each click opens a **new** Pi Chat tab, enabling parallel sessions. Currently the button focuses an existing tab if one is already open.

## Current behavior
- `ObsidianPiPlugin.activateView()` in `src/main.ts` does:
  1. `workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT)[0]` — finds the first existing Pi Chat leaf.
  2. If none exists, creates a new tab leaf and loads the view.
  3. Reveals/focuses that leaf.
- The same `activateView()` is used by both the ribbon icon and the "Open Pi Chat" command.

## Proposed change
- Always create a new leaf when the ribbon icon is clicked.
- Reuse logic will be removed/optionally moved to a separate focus action.
- Each `PiChatView` already owns its `PiSessionService`, so parallel agent sessions are technically fine once duplicate-leaf reuse is removed.

## Implementation steps
1. **Modify `src/main.ts`**
   - Remove the `getLeavesOfType(VIEW_TYPE_PI_CHAT)[0]` lookup in `activateView()`.
   - Always call `workspace.getLeaf('tab')`, set view state to `VIEW_TYPE_PI_CHAT`, and reveal it.
   - If we want the existing command to keep focusing a single tab, split into:
     - `openChatTab()` — always new (used by ribbon).
     - `focusChatTab()` — reuse/focus existing (used by command, or vice versa).

2. **Decide command palette behavior**
   - Either update `open-pi-chat` to also open a new tab every time, or add a new command `New Pi Chat` / `Focus Pi Chat`.

3. **Review global shared state that affects parallel tabs**
   - `settings.history` is a single array stored in plugin data. With multiple tabs, restoring history in each new tab and persisting from any tab will cause cross-tab pollution.
   - `settings.workingDir` and `settings.focus` are global; changing CWD/focus in one tab affects all tabs because every view reads from `plugin.settings`.
   - `restartChatSessions()`, `clearHistory()`, `saveCurrentHistory()` iterate over **all** Pi Chat leaves, so a setting change or history clear affects every open tab.

4. **Decide per-tab isolation scope**
   - Minimum viable change: only change ribbon → new tab; accept that settings/history remain global.
   - Better isolation: make history and cwd/focus per-view so each tab is a fully independent parallel session. This is more invasive and requires storing state on the leaf/view instead of plugin settings.

5. **Update tab identity (optional)**
   - If multiple tabs are allowed, `getDisplayText()` returning static `"Pi Chat"` makes tabs indistinguishable. We could append an index or cwd label.

6. **Build and test**
   - Run the build.
   - Click the ribbon icon multiple times; confirm multiple tabs open and each can send messages independently.
   - Confirm existing commands still behave as intended.

## Decisions
1. **Command palette** — `"Open Pi Chat"` will also open a new tab every time (same as the ribbon icon). No separate focus command is needed for now.
2. **New tab = new session + new chat history** — Each tab starts with an empty message list and its own `PiSessionService` session. The `restoreHistory()` call is removed from `PiChatView`, so new tabs never load the shared saved history.
3. **Working directory / focus stay global** — CWD and focus mode remain plugin-level settings, so all tabs share the same target directory. Changing cwd in one tab updates the global setting and restarts sessions in all tabs (current behavior preserved).
4. **No tab limit** — Open as many tabs as Obsidian allows.
5. **Tab label = last user message preview** — `Pi Chat — "refactor auth..."`. Falls back to `Pi Chat` when there is no user message yet. The title updates after each user message and resets when the chat is cleared.

## Notes / known quirks with this design
- `settings.history` is still a single plugin-level value. If `Save chat history` is enabled, the most recently active tab's history will overwrite the saved archive. Parallel tabs do not share live history.
- `saveCurrentHistory()` and `clearHistory()` still iterate over all open Pi Chat leaves, which can cause the saved archive to reflect whichever leaf happened to save last.
- Because CWD/focus are global, all parallel tabs target the same directory. A future enhancement could move cwd/focus into per-tab state for fully independent sessions.
- Tab title changes are driven by an undocumented Obsidian internal: `(this.leaf as any).updateHeader()`. If this method disappears in a future Obsidian release, titles will fall back to whatever `getDisplayText()` returned at render time (still functional, just not live-updating).
