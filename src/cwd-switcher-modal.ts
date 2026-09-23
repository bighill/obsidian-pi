import { App, FuzzySuggestModal, Notice } from 'obsidian'
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
    if (item.value === this.plugin.settings.workingDir) return
    this.plugin.settings.workingDir = item.value
    await this.plugin.saveSettings()
    new Notice(`Pi working directory set to ${currentCwdLabel(item.value)}`)
    await this.plugin.restartChatSessions('cwd-change')
  }
}
