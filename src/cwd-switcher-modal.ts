import { App, FuzzySuggestModal, Notice, FileSystemAdapter } from 'obsidian'
import type ObsidianPiPlugin from './main'
import { currentCwdLabel, listCwdOptions, type CwdOption } from './cwd-options'

export class CwdSwitcherModal extends FuzzySuggestModal<CwdOption> {
  plugin: ObsidianPiPlugin

  constructor(app: App, plugin: ObsidianPiPlugin) {
    super(app)
    this.plugin = plugin
    this.setPlaceholder('Switch Pi working directory')
  }

  getItems(): CwdOption[] {
    return listCwdOptions(this.plugin.settings.workingDir)
  }

  getItemText(item: CwdOption): string {
    return item.label
  }

  async onChooseItem(item: CwdOption, evt: MouseEvent | KeyboardEvent): Promise<void> {
    void evt
    const vaultRoot =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? this.app.vault.adapter.getBasePath()
        : process.cwd()
    const target = item.value === vaultRoot ? '' : item.value
    if (target === this.plugin.settings.workingDir && this.plugin.settings.focus) return
    this.plugin.settings.workingDir = target
    this.plugin.settings.focus = true
    await this.plugin.saveSettings()
    new Notice(`Pi focus set to ${currentCwdLabel(item.value)}`)
    await this.plugin.restartChatSessions('cwd-change')
  }
}
