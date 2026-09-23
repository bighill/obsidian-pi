# Security Notes / Risk Acceptance

This document records why certain `npm audit` findings remain after the dependency tree has been updated to the latest compatible versions.

## Current state

After upgrading `@mariozechner/pi-coding-agent` to the latest available release, `npm audit` reports two residual high-severity findings:

1. **`@mariozechner/pi-coding-agent`** — interactive/TUI-specific advisories:
   - GHSA-jfgx-wxx8-mp94: predictable temporary extension install paths on shared Linux hosts.
   - GHSA-r95r-rj6r-c39x: race condition in `auth.json` writes.
   - GHSA-7v5m-pr3q-6453: potential XSS in HTML session exports via Markdown URL sanitization bypass.
2. **`extract-zip`** — symlink path traversal / arbitrary file write (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3). No patched release is available upstream.

## Why these are accepted for this plugin

The Obsidian Pi plugin does **not** use the Pi CLI's interactive/TUI mode, extension installer, or HTML export functionality:

- The plugin creates an `AgentSession` directly via the SDK and sets `PI_OFFLINE=1` at runtime so the SDK does not reach out to npm or download extensions.
- The temporary-path and `auth.json` race issues affect the interactive CLI on multi-user Linux hosts. The plugin runs inside Obsidian's single-user Electron renderer and delegates credential storage to the existing Pi CLI `auth.json`.
- HTML session exports are not used by this plugin.
- `extract-zip` is pulled in transitively by the Pi SDK for extension installation, which is not exercised by this plugin.

## Mitigations in place

- Only the bundled coding tools (`read`, `bash`, `edit`, `write`) are exposed to the model, matching the upstream Pi CLI defaults.
- Shell commands run with the user's normal OS permissions, so the plugin is marked **desktop-only** in `manifest.json`.
- Users are warned about tool risks in [README.md](../README.md).

## When to revisit

Re-evaluate these notes when:

- The upstream Pi SDK releases a version without these advisories.
- This plugin begins using extension installation, HTML exports, or shared-path features.
- A patched `extract-zip` release becomes available.
