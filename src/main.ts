// Configure Pi SDK runtime environment before any SDK modules are evaluated.
import './sdk-runtime-init'

import { Plugin, WorkspaceLeaf } from 'obsidian'
import { PiChatView, VIEW_TYPE_PI_CHAT } from './pi-chat-view'
import { PiPluginSettingTab } from './settings-tab'
import { CwdSwitcherModal } from './cwd-switcher-modal'
import type { CreateAgentSessionOptions } from '@earendil-works/pi-coding-agent'
import type { ChatMessage } from './message-renderer'

type ThinkingLevel = NonNullable<CreateAgentSessionOptions['thinkingLevel']>

export interface PiPluginSettings {
  model: string
  thinkingLevel: ThinkingLevel | ''
  workingDir: string
  focus: boolean
  saveHistory: boolean
  history: ChatMessage[]
}

const DEFAULT_SETTINGS: PiPluginSettings = {
  model: '',
  thinkingLevel: '',
  workingDir: '',
  focus: false,
  saveHistory: false,
  history: [],
}

export default class ObsidianPiPlugin extends Plugin {
  settings: PiPluginSettings = DEFAULT_SETTINGS

  async onload() {
    await this.loadSettings()

    this.registerView(VIEW_TYPE_PI_CHAT, (leaf: WorkspaceLeaf) => new PiChatView(leaf, this))

    this.addSettingTab(new PiPluginSettingTab(this.app, this))

    this.addRibbonIcon('bot', 'Pi Chat', () => {
      this.activateView()
    })

    this.addCommand({
      id: 'open-pi-chat',
      name: 'Open Pi Chat',
      callback: () => this.activateView(),
    })

    this.addCommand({
      id: 'switch-pi-working-dir',
      name: 'Switch working directory',
      callback: () => new CwdSwitcherModal(this.app, this).open(),
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

  async restartChatSessions(reason: 'initial' | 'cwd-change' = 'initial'): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT)) {
      const view = leaf.view
      if (view instanceof PiChatView) {
        await view.restartSession(reason)
      }
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  async saveHistory(history: ChatMessage[]): Promise<void> {
    if (!this.settings.saveHistory) return
    this.settings.history = history
    await this.saveData(this.settings)
  }

  async clearHistory(): Promise<void> {
    this.settings.history = []
    await this.saveData(this.settings)
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT)) {
      const view = leaf.view
      if (view instanceof PiChatView) {
        view.clearMessages()
      }
    }
  }

  async saveCurrentHistory(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_PI_CHAT)) {
      const view = leaf.view
      if (view instanceof PiChatView) {
        await view.persistHistory()
      }
    }
  }
}
