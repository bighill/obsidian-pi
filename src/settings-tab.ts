import { App, PluginSettingTab, Setting } from 'obsidian'
import type ObsidianPiPlugin from './main'

export class PiPluginSettingTab extends PluginSettingTab {
  plugin: ObsidianPiPlugin

  constructor(app: App, plugin: ObsidianPiPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName('Save chat history')
      .setDesc(
        'Persist conversation history across Obsidian restarts. History is stored in the plugin data file.',
      )
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.saveHistory).onChange(async (value) => {
          this.plugin.settings.saveHistory = value
          await this.plugin.saveSettings()
          if (value) {
            await this.plugin.saveCurrentHistory()
          } else {
            await this.plugin.clearHistory()
          }
        })
      })

    new Setting(containerEl)
      .setName('Model')
      .setDesc(
        'Optional model in "provider:modelId" format (e.g. anthropic:claude-opus-4-5). Leave blank for the Pi SDK default.',
      )
      .addText((text) => {
        text
          .setPlaceholder('provider:modelId')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value.trim()
            await this.plugin.saveSettings()
            await this.plugin.restartChatSessions()
          })
      })

    new Setting(containerEl)
      .setName('Thinking level')
      .setDesc('Override the model default thinking level.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('', 'Default')
          .addOption('off', 'Off')
          .addOption('minimal', 'Minimal')
          .addOption('low', 'Low')
          .addOption('medium', 'Medium')
          .addOption('high', 'High')
          .addOption('xhigh', 'Maximum')
          .setValue(this.plugin.settings.thinkingLevel)
          .onChange(async (value) => {
            this.plugin.settings.thinkingLevel = value as typeof this.plugin.settings.thinkingLevel
            await this.plugin.saveSettings()
            await this.plugin.restartChatSessions()
          })
      })
  }
}
