import {
  ItemView,
  WorkspaceLeaf,
  setIcon,
  TFile,
  prepareFuzzySearch,
  FileSystemAdapter,
} from 'obsidian'
import type ObsidianPiPlugin from './main'
import { type AgentSessionEvent } from '@mariozechner/pi-coding-agent'
import { join } from 'path'
import { homedir } from 'os'
import { InlineSuggest, type SuggestItem } from './inline-suggest'
import {
  detectMention,
  rankMentions,
  reconcileMentions,
  replaceMention,
  stripInlineTokens,
} from './at-mention'
import {
  createAttachmentFromFile,
  type ChatAttachment,
  type ImageContent,
  type PendingAttachment,
} from './attachments'
import {
  MessageRenderer,
  type ChatMessage,
  type ToolCallInfo,
  type ToolState,
} from './message-renderer'
import { PiSessionService } from './session-service'

export const VIEW_TYPE_PI_CHAT = 'pi-chat'

export class PiChatView extends ItemView {
  plugin: ObsidianPiPlugin
  private sessionService: PiSessionService
  private messagesEl!: HTMLElement
  private inputEl!: HTMLTextAreaElement
  private sendBtn!: HTMLButtonElement
  private cancelBtn!: HTMLButtonElement
  private statusEl!: HTMLElement
  private retryBtn!: HTMLElement
  private clearBtn!: HTMLElement
  private contextEl!: HTMLElement
  private contextUpdateInterval: number | null = null
  private messages: ChatMessage[] = []
  private isStreaming = false
  private currentAssistantText = ''
  private currentToolCalls: Map<string, ToolCallInfo> = new Map()
  private toolState: ToolState = {
    expanded: new Map(),
    toggled: new Set(),
  }
  private renderer!: MessageRenderer
  private suggest!: InlineSuggest
  private activeMention: { query: string; start: number } | null = null
  private pendingAttachments: PendingAttachment[] = []

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianPiPlugin) {
    super(leaf)
    this.plugin = plugin
    this.sessionService = new PiSessionService()
  }

  getViewType(): string {
    return VIEW_TYPE_PI_CHAT
  }

  getDisplayText(): string {
    return 'Pi Chat'
  }

  getIcon(): string {
    return 'bot'
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement
    container.empty()
    container.addClass('pi-chat-root')

    // ─── Layout ─────────────────────────────────────────────
    const wrapper = container.createDiv('pi-chat-wrapper')

    // Header bar
    const header = wrapper.createDiv('pi-chat-header')
    const titleEl = header.createDiv('pi-chat-title')
    titleEl.setText('Pi')
    this.contextEl = header.createDiv('pi-chat-context')
    this.contextEl.setText('')
    this.statusEl = header.createDiv('pi-chat-status')
    this.statusEl.setText('Not connected')
    this.retryBtn = header.createDiv('pi-chat-retry')
    setIcon(this.retryBtn, 'refresh-cw')
    this.retryBtn.setAttribute('aria-label', 'Retry connection')
    this.retryBtn.addClass('is-hidden')
    this.registerDomEvent(this.retryBtn, 'click', () => {
      void this.restartSession()
    })

    this.clearBtn = header.createDiv('pi-chat-clear')
    setIcon(this.clearBtn, 'trash-2')
    this.clearBtn.setAttribute('aria-label', 'Clear chat history')
    this.clearBtn.addClass('is-hidden')
    this.registerDomEvent(this.clearBtn, 'click', () => {
      void this.clearViewHistory()
    })

    // Messages container
    this.messagesEl = wrapper.createDiv('pi-chat-messages')
    this.renderer = new MessageRenderer(this.app, this)

    // Input area
    const inputArea = wrapper.createDiv('pi-chat-input-area')
    this.inputEl = inputArea.createEl('textarea', {
      cls: 'pi-chat-input',
      attr: {
        placeholder: 'Message Pi...',
        rows: '1',
        spellcheck: 'false',
      },
    })
    // @-mention file picker dropdown (anchored to the input area)
    this.suggest = new InlineSuggest(inputArea, this.registerDomEvent.bind(this))
    this.suggest.onChoose = (item) => void this.chooseMention(item)

    this.sendBtn = inputArea.createEl('button', {
      cls: 'pi-chat-send',
    })
    setIcon(this.sendBtn, 'send-horizontal')

    this.cancelBtn = inputArea.createEl('button', {
      cls: 'pi-chat-cancel is-hidden',
    })
    setIcon(this.cancelBtn, 'square')
    this.cancelBtn.setAttribute('aria-label', 'Stop generating')

    // ─── Event handlers ─────────────────────────────────────
    this.registerDomEvent(this.sendBtn, 'click', () => this.handleSend())
    this.registerDomEvent(this.cancelBtn, 'click', () => {
      void this.cancelTurn()
    })
    this.registerDomEvent(this.inputEl, 'keydown', (e: KeyboardEvent) => {
      // @-mention dropdown captures navigation keys while open
      if (this.suggest.isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          this.suggest.moveSelection(1)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          this.suggest.moveSelection(-1)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          this.closeMentionSuggest()
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          const item = this.suggest.current()
          if (item) {
            e.preventDefault()
            void this.chooseMention(item)
            return
          }
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.handleSend()
      }
    })
    this.registerDomEvent(this.inputEl, 'input', () => {
      this.inputEl.style.height = 'auto'
      this.inputEl.style.height =
        Math.min(this.inputEl.scrollHeight, 200) + 'px'
      this.updateMentionSuggest()
      this.reconcileInlineMentions()
    })
    this.registerDomEvent(this.inputEl, 'blur', () => {
      if (this.suggest.isOpen) this.closeMentionSuggest()
    })

    // Focus input on open and whenever the tab becomes active
    this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf === this.leaf) {
        this.inputEl.focus()
      }
    }))
    this.inputEl.focus()

    // ─── Init session ────────────────────────────────────────
    await this.initSession()
  }

  private async initSession() {
    try {
      this.statusEl.setText('Starting session…')
      this.statusEl.setAttribute('title', '')
      this.statusEl.addClass('pi-chat-status-busy')
      this.statusEl.removeClass('pi-chat-status-ready', 'pi-chat-status-error')

      const adapter = this.app.vault.adapter
      const cwd =
        this.plugin.settings.workingDir ||
        (adapter instanceof FileSystemAdapter
          ? adapter.getBasePath()
          : process.cwd())
      const agentDir = join(homedir(), '.pi', 'agent')

      const session = await this.sessionService.start(
        {
          cwd,
          agentDir,
          thinkingLevel: this.plugin.settings.thinkingLevel || undefined,
          model: this.plugin.settings.model || undefined,
        },
        (event: AgentSessionEvent) => this.handleSessionEvent(event),
      )

      const modelLabel = session.model ? session.model.name : 'Ready'
      this.statusEl.setText(modelLabel)
      this.statusEl.setAttribute('title', modelLabel)
      this.statusEl.removeClass('pi-chat-status-busy')
      this.statusEl.addClass('pi-chat-status-ready')
      this.statusEl.removeClass('pi-chat-status-error')
      this.retryBtn.addClass('is-hidden')
      this.restoreHistory()
      this.startContextPoller()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('obsidian-pi: initSession error:', err)
      this.statusEl.setText('Error')
      this.statusEl.setAttribute('title', message)
      this.statusEl.removeClass('pi-chat-status-busy')
      this.statusEl.addClass('pi-chat-status-error')
      this.retryBtn.removeClass('is-hidden')
    }
  }

  private startContextPoller(): void {
    if (this.contextUpdateInterval) return
    this.updateContextDisplay()
    this.contextUpdateInterval = window.setInterval(() => {
      this.updateContextDisplay()
    }, 5000)
  }

  private updateContextDisplay(): void {
    const session = this.sessionService.getSession()
    if (!session || !this.contextEl) return
    const usage = session.getContextUsage()
    if (!usage || usage.percent == null) {
      this.contextEl.setText('')
      this.contextEl.removeAttribute('title')
      return
    }
    const pct = Math.round(usage.percent)
    const tokens = usage.tokens ?? 0
    this.contextEl.setText(`${pct}%`)
    this.contextEl.setAttribute(
      'title',
      `${tokens.toLocaleString()} / ${usage.contextWindow.toLocaleString()} tokens`,
    )
    this.contextEl.removeClass('low', 'medium', 'high')
    if (pct < 50) this.contextEl.addClass('low')
    else if (pct < 80) this.contextEl.addClass('medium')
    else this.contextEl.addClass('high')
  }

  private stopContextPoller(): void {
    if (this.contextUpdateInterval) {
      window.clearInterval(this.contextUpdateInterval)
      this.contextUpdateInterval = null
    }
  }

  private restoreHistory(): void {
    if (!this.plugin.settings.saveHistory) return
    const saved = this.plugin.settings.history
    if (saved && saved.length > 0) {
      this.messages = JSON.parse(JSON.stringify(saved))
      this.renderer.renderMessages(
        this.messagesEl,
        this.messages,
        this.toolState,
      )
      this.updateClearButton()
    }
  }

  clearMessages(): void {
    this.messages = []
    this.currentAssistantText = ''
    this.currentToolCalls.clear()
    this.renderer.renderMessages(this.messagesEl, [], this.toolState)
    this.updateClearButton()
  }

  private async clearViewHistory(): Promise<void> {
    this.clearMessages()
    await this.plugin.clearHistory()
  }

  async persistHistory(): Promise<void> {
    await this.plugin.saveHistory(this.messages)
  }

  private updateClearButton(): void {
    if (this.messages.length > 0) {
      this.clearBtn.removeClass('is-hidden')
    } else {
      this.clearBtn.addClass('is-hidden')
    }
  }

  private handleSessionEvent(event: AgentSessionEvent) {
    switch (event.type) {
      case 'turn_start':
        // Start a new assistant message
        this.currentAssistantText = ''
        this.currentToolCalls.clear()
        break

      case 'message_update': {
        const assistantEvent = event.assistantMessageEvent
        if (assistantEvent?.type === 'text_delta') {
          this.currentAssistantText += assistantEvent.delta
          this.renderer.renderStreaming(
            this.messagesEl,
            this.currentAssistantText,
            this.currentToolCalls,
            this.toolState,
          )
          this.scrollToBottom()
        } else if (assistantEvent?.type === 'thinking_delta') {
          // Could render thinking block, for now skip
        }
        break
      }

      case 'tool_execution_start': {
        const toolCall: ToolCallInfo = {
          id: event.toolCallId,
          name: event.toolName,
          args: JSON.stringify(event.args, null, 2),
        }
        this.currentToolCalls.set(event.toolCallId, toolCall)
        this.renderer.renderStreaming(
          this.messagesEl,
          this.currentAssistantText,
          this.currentToolCalls,
          this.toolState,
        )
        this.scrollToBottom()
        break
      }

      case 'tool_execution_end': {
        const toolCall = this.currentToolCalls.get(event.toolCallId)
        if (toolCall) {
          const result = event.result
          toolCall.result = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          toolCall.isError = event.isError
        }
        this.renderer.renderStreaming(
          this.messagesEl,
          this.currentAssistantText,
          this.currentToolCalls,
          this.toolState,
        )
        this.scrollToBottom()
        break
      }

      case 'turn_end': {
        // Finalize the assistant message
        const toolCalls = Array.from(this.currentToolCalls.entries()).map(
          ([id, tc]) => ({ ...tc, id }),
        )
        this.messages.push({
          role: 'assistant',
          text: this.currentAssistantText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        })
        this.currentAssistantText = ''
        this.currentToolCalls.clear()
        this.isStreaming = false
        this.updateSendButton()
        this.renderer.renderMessages(
          this.messagesEl,
          this.messages,
          this.toolState,
        )
        this.updateClearButton()
        this.persistHistory().catch((err) => {
          console.error('obsidian-pi: failed to persist history:', err)
        })
        break
      }

      case 'agent_start':
        this.isStreaming = true
        this.updateSendButton()
        break

      case 'agent_end':
        this.isStreaming = false
        this.updateSendButton()
        break
    }
  }

  private async handleSend() {
    const session = this.sessionService.getSession()
    const text = this.inputEl.value.trim()
    const hasAttachments = this.pendingAttachments.length > 0
    if ((!text && !hasAttachments) || this.isStreaming || !session) return

    // Build the prompt text with inline file attachments and collect images
    let fullMessage = text
    const images: ImageContent[] = []
    for (const att of this.pendingAttachments) {
      if (att.image) {
        images.push(att.image)
      } else if (att.content) {
        fullMessage = fullMessage
          ? fullMessage + '\n\n' + att.content
          : att.content
      }
    }
    if (!text && hasAttachments) {
      fullMessage = `📎 ${this.pendingAttachments.map((a) => a.name).join(', ')}`
    }

    const displayText =
      stripInlineTokens(text, this.pendingAttachments) ||
      (hasAttachments
        ? `📎 ${this.pendingAttachments.map((a) => a.name).join(', ')}`
        : '')

    this.inputEl.value = ''
    this.inputEl.style.height = 'auto'
    const sentAttachments: ChatAttachment[] = this.pendingAttachments.map(
      (att) => ({ ...att }),
    )
    this.pendingAttachments = []
    this.closeMentionSuggest()

    // Add user message to UI
    this.messages.push({
      role: 'user',
      text: displayText,
      attachments: sentAttachments,
    })
    this.renderer.renderMessages(
      this.messagesEl,
      this.messages,
      this.toolState,
    )
    this.updateClearButton()
    await this.persistHistory()

    // Send to Pi
    try {
      const options: { images?: ImageContent[] } =
        images.length > 0 ? { images } : {}
      await session.prompt(fullMessage, options)
    } catch (err) {
      this.messages.push({
        role: 'system',
        text: 'Error: ' + (err instanceof Error ? err.message : String(err)),
      })
      this.renderer.renderMessages(
        this.messagesEl,
        this.messages,
        this.toolState,
      )
      this.updateClearButton()
      await this.persistHistory()
      this.isStreaming = false
      this.updateSendButton()
    }
  }

  // ─── @-mention file picker ───────────────────────────────────────────

  private updateMentionSuggest(): void {
    const cursor = this.inputEl.selectionStart ?? this.inputEl.value.length
    const mention = detectMention(this.inputEl.value, cursor)
    if (!mention) {
      this.closeMentionSuggest()
      return
    }
    this.activeMention = mention
    const items = this.mentionItems(mention.query)
    if (this.suggest.isOpen) this.suggest.update(items)
    else this.suggest.show(items)
  }

  private mentionItems(query: string): SuggestItem[] {
    const files = this.app.vault
      .getFiles()
      .map((f) => ({ path: f.path, mtime: f.stat.mtime }))
    const matcher = query ? prepareFuzzySearch(query) : null
    const score = (_q: string, path: string): number | null => {
      if (!matcher) return 0
      const result = matcher(path)
      return result ? result.score : null
    }
    return rankMentions(files, query, score, 50).map((f) => ({
      path: f.path,
      display: f.path,
    }))
  }

  private closeMentionSuggest(): void {
    this.activeMention = null
    this.suggest.close()
  }

  private async chooseMention(item: SuggestItem): Promise<void> {
    const mention = this.activeMention
    this.closeMentionSuggest()

    const file = this.app.vault.getAbstractFileByPath(item.path)
    if (!(file instanceof TFile)) return

    const token = `@${file.path}`
    if (mention) this.insertMentionText(mention, token)

    try {
      const attachment = await createAttachmentFromFile(this.app.vault, file)
      this.pendingAttachments.push(attachment)
      this.updateSendButton()
    } catch (e) {
      // Error notice is shown by createAttachmentFromFile
    }
  }

  private insertMentionText(
    mention: { query: string; start: number },
    token: string,
  ): void {
    const { value, caret } = replaceMention(
      this.inputEl.value,
      mention.start,
      mention.query.length,
      `${token} `,
    )
    this.inputEl.value = value
    this.inputEl.setSelectionRange(caret, caret)
    this.inputEl.style.height = 'auto'
    this.inputEl.style.height =
      Math.min(this.inputEl.scrollHeight, 200) + 'px'
    this.updateSendButton()
  }

  private reconcileInlineMentions(): void {
    const survivors = reconcileMentions(
      this.inputEl.value,
      this.pendingAttachments,
    )
    if (survivors.length !== this.pendingAttachments.length) {
      this.pendingAttachments = survivors
      this.updateSendButton()
    }
  }

  private scrollToBottom() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight
  }

  private updateSendButton() {
    if (this.isStreaming) {
      setIcon(this.sendBtn, 'loader')
      this.sendBtn.disabled = true
      this.cancelBtn.removeClass('is-hidden')
    } else {
      setIcon(this.sendBtn, 'send-horizontal')
      this.sendBtn.disabled = false
      this.cancelBtn.addClass('is-hidden')
    }
  }

  private async cancelTurn(): Promise<void> {
    const session = this.sessionService.getSession()
    if (!session || !this.isStreaming) return

    try {
      this.cancelBtn.disabled = true
      await session.abort()
    } catch (err) {
      console.error(
        'obsidian-pi: cancelTurn error:',
        err instanceof Error ? err.message : String(err),
      )
    } finally {
      this.currentAssistantText = ''
      this.currentToolCalls.clear()
      this.isStreaming = false
      this.updateSendButton()
      this.renderer.renderMessages(
        this.messagesEl,
        this.messages,
        this.toolState,
      )
    }
  }

  async restartSession(): Promise<void> {
    this.stopContextPoller()
    this.sessionService.stop()
    this.currentAssistantText = ''
    this.currentToolCalls.clear()
    this.isStreaming = false
    this.updateSendButton()
    this.retryBtn?.addClass('is-hidden')
    await this.initSession()
  }

  async onClose() {
    this.stopContextPoller()
    this.sessionService.stop()
  }
}
