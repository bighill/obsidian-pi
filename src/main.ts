import { Plugin, WorkspaceLeaf } from 'obsidian'
import { PiChatView, VIEW_TYPE_PI_CHAT } from './pi-chat-view'

export interface PiPluginSettings {
  model: string
  thinkingLevel: string
  workingDir: string
}

const DEFAULT_SETTINGS: PiPluginSettings = {
  model: '',
  thinkingLevel: '',
  workingDir: '',
}

export default class ObsidianPiPlugin extends Plugin {
  settings: PiPluginSettings = DEFAULT_SETTINGS

  async onload() {
    console.log('obsidian-pi: onload start')
    await this.loadSettings()
    console.log('obsidian-pi: settings loaded', this.settings)

    this.registerView(
      VIEW_TYPE_PI_CHAT,
      (leaf: WorkspaceLeaf) => new PiChatView(leaf, this),
    )
    console.log('obsidian-pi: view registered')

    this.addRibbonIcon('bot', 'Pi Chat', () => {
      this.activateView()
    })
    console.log('obsidian-pi: ribbon added')

    this.addCommand({
      id: 'open-pi-chat',
      name: 'Open Pi Chat',
      callback: () => this.activateView(),
    })
    console.log('obsidian-pi: onload done')
  }

  async activateView() {
    const { workspace } = this.app
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT)[0]
    if (!leaf) {
      leaf = workspace.getLeaf('tab')
      await leaf.setViewState({ type: VIEW_TYPE_PI_CHAT, active: true })
    }
    workspace.revealLeaf(leaf)
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}