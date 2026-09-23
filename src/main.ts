import { Plugin, WorkspaceLeaf } from 'obsidian'
import { PiChatView, VIEW_TYPE_PI_CHAT } from './pi-chat-view'
import type { CreateAgentSessionOptions } from '@mariozechner/pi-coding-agent'

type ThinkingLevel = NonNullable<CreateAgentSessionOptions['thinkingLevel']>

export interface PiPluginSettings {
  model: string
  thinkingLevel: ThinkingLevel | ''
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
    await this.loadSettings()

    this.registerView(
      VIEW_TYPE_PI_CHAT,
      (leaf: WorkspaceLeaf) => new PiChatView(leaf, this),
    )

    this.addRibbonIcon('bot', 'Pi Chat', () => {
      this.activateView()
    })

    this.addCommand({
      id: 'open-pi-chat',
      name: 'Open Pi Chat',
      callback: () => this.activateView(),
    })
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