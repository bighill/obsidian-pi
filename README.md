# Obsidian Pi

![CI](https://github.com/bighill/obsidian-pi/actions/workflows/ci.yml/badge.svg)

A plugin that brings the [Pi CLI](https://github.com/mariozechner/pi-coding-agent) agent chat into an Obsidian tab. Ask Pi to read, edit, write, and run bash commands against your vault files without leaving Obsidian.

> **Status:** early beta. The plugin can invoke file-system and shell tools; review the [Tool risks](#tool-risks) section before enabling it on important vaults.

## Requirements

- **Obsidian desktop** v1.5.0 or later (the plugin is desktop-only because it relies on Node.js APIs and the Pi SDK).
- A Pi CLI setup with a configured agent directory (usually `~/.pi/agent`).
- API keys for the models you want to use. These are handled by the Pi SDK / Pi CLI, not stored inside Obsidian.

## Installation

### Manual

1. Download the latest release assets:
   - `main.js`
   - `styles.css`
   - `manifest.json`
2. Create the directory `<vault>/.obsidian/plugins/obsidian-pi/`.
3. Copy the three files into that directory.
4. In Obsidian, go to **Settings → Community plugins → Installed plugins** and enable **Obsidian Pi**.

### BRAT (Beta Reviewers Auto-update Tool)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from Community Plugins.
2. Open the BRAT settings and add a beta plugin with the repository:
   ```
   bighill/obsidian-pi
   ```
3. Enable **Obsidian Pi** in Community plugins after BRAT installs it.

## Pi CLI configuration

Obsidian Pi uses the bundled Pi SDK, which expects the same configuration as the Pi CLI:

- **Agent directory:** `~/.pi/agent` is used by default. The directory is created by the Pi CLI on first run.
- **Model / provider settings:** stored in `~/.pi/agent/models.json` and the Pi CLI config.
- **API keys:** add them via the Pi CLI (`pi auth` / `pi-ai` OAuth/API-key commands) or by editing `~/.pi/agent/auth.json`. The Obsidian plugin does not ask for or store API keys itself.

If no model is selected, the Pi SDK picks the first available configured model.

## Tool risks

Pi is an **agent** that can invoke tools:

- `read` — reads files in your vault.
- `edit` / `write` — creates or modifies files in your vault.
- `bash` — runs shell commands on your computer.

Only use this plugin in vaults you are comfortable having an LLM read and modify. Shell commands run with your user permissions. Review every tool call, and keep backups of important work.

## Using the chat

- Open the chat from the ribbon icon **(bot)** or with the command **"Open Pi Chat"**.
- Type a message and press `Enter` (or `Shift+Enter` for a new line) to send.

### Attach files with `@`

In the input box, type `@` to open a fuzzy file picker. Selecting a file attaches it to your message:

- **Text files** (`.md`, `.txt`, `.json`, `.ts`, `.js`, etc.) are inlined as fenced code blocks.
- **Images** (`.png`, `.jpg`, `.webp`, etc.) are sent to vision-capable models.
- **Other files** are mentioned by name only.

If you delete the `@path` token from the input, the attachment is removed automatically.

## Development

```bash
npm install
npm run dev      # watch build
npm run build    # production build
npm run typecheck
```

The plugin is written in TypeScript and bundles the Pi SDK with esbuild.

## License

MIT — see [LICENSE](./LICENSE).
