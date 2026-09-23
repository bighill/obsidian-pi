import {
  ItemView,
  MarkdownRenderer,
  WorkspaceLeaf,
  setIcon,
  TFile,
  prepareFuzzySearch,
  FileSystemAdapter,
} from 'obsidian'
import type ObsidianPiPlugin from './main'
import {
  createAgentSession,
  DefaultResourceLoader,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionOptions,
} from '@mariozechner/pi-coding-agent'
import { join } from 'path'
import { homedir } from 'os'
import { InlineSuggest, type SuggestItem } from './inline-suggest'
import {
  detectMention,
  rankMentions,
  reconcileMentions,
  replaceMention,
  splitFileBlocks,
} from './at-mention'
import {
  createAttachmentFromFile,
  type ImageContent,
  type PendingAttachment,
} from './attachments'

export const VIEW_TYPE_PI_CHAT = 'pi-chat'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  toolCalls?: ToolCallInfo[]
}

interface ToolCallInfo {
  name: string
  args: string
  result?: string
  isError?: boolean
}

export class PiChatView extends ItemView {
  plugin: ObsidianPiPlugin
  private session: AgentSession | null = null
  private unsubscribe: (() => void) | null = null
  private messagesEl!: HTMLElement
  private inputEl!: HTMLTextAreaElement
  private sendBtn!: HTMLButtonElement
  private statusEl!: HTMLElement
  private retryBtn!: HTMLElement
  private contextEl!: HTMLElement
  private contextUpdateInterval: number | null = null
  private messages: ChatMessage[] = []
  private isStreaming = false
  private currentAssistantText = ''
  private currentToolCalls: Map<string, ToolCallInfo> = new Map()
  private toolCallExpanded: Map<string, boolean> = new Map()
  private toggledToolCalls: Set<string> = new Set()
  private suggest!: InlineSuggest
  private activeMention: { query: string; start: number } | null = null
  private pendingAttachments: PendingAttachment[] = []

  constructor(leaf: WorkspaceLeaf, plugin: ObsidianPiPlugin) {
    super(leaf)
    this.plugin = plugin
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
    this.retryBtn.addEventListener('click', () => {
      void this.restartSession()
    })

    // Messages container
    this.messagesEl = wrapper.createDiv('pi-chat-messages')

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
    this.suggest = new InlineSuggest(inputArea)
    this.suggest.onChoose = (item) => void this.chooseMention(item)

    this.sendBtn = inputArea.createEl('button', {
      cls: 'pi-chat-send',
    })
    setIcon(this.sendBtn, 'send-horizontal')

    // ─── Event handlers ─────────────────────────────────────
    this.sendBtn.addEventListener('click', () => this.handleSend())
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
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
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto'
      this.inputEl.style.height =
        Math.min(this.inputEl.scrollHeight, 200) + 'px'
      this.updateMentionSuggest()
      this.reconcileInlineMentions()
    })
    this.inputEl.addEventListener('blur', () => {
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
      this.statusEl.addClass('pi-chat-status-busy')

      const adapter = this.app.vault.adapter
      const cwd =
        this.plugin.settings.workingDir ||
        (adapter instanceof FileSystemAdapter
          ? adapter.getBasePath()
          : process.cwd())
      const agentDir = join(homedir(), '.pi', 'agent')

      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        appendSystemPrompt: [
          `Current timestamp: ${new Date().toISOString()}`,
        ],
      })
      await resourceLoader.reload()

      const options: CreateAgentSessionOptions = {
        cwd,
        agentDir,
        resourceLoader,
      }

      // Apply settings overrides if set
      if (this.plugin.settings.thinkingLevel) {
        options.thinkingLevel = this.plugin.settings.thinkingLevel
      }

      if (this.plugin.settings.model) {
        const modelSetting = this.plugin.settings.model
        const colonIndex = modelSetting.indexOf(':')
        if (colonIndex > 0 && colonIndex < modelSetting.length - 1) {
          const provider = modelSetting.slice(0, colonIndex)
          const modelId = modelSetting.slice(colonIndex + 1)
          const authStorage = AuthStorage.create(join(agentDir, 'auth.json'))
          const modelRegistry = ModelRegistry.create(
            authStorage,
            join(agentDir, 'models.json'),
          )
          const model = modelRegistry.find(provider, modelId)
          if (model) {
            options.model = model
          } else {
            throw new Error(`Model not found: ${modelSetting}`)
          }
        } else {
          throw new Error(
            `Model must be in "provider:modelId" format: ${modelSetting}`,
          )
        }
      }

      const result = await createAgentSession(options)
      this.session = result.session

      // Subscribe to events
      this.unsubscribe = this.session.subscribe((event: AgentSessionEvent) => {
        this.handleSessionEvent(event)
      })

      const model = this.session.model
      const modelLabel = model ? model.name : 'Ready'
      this.statusEl.setText(modelLabel)
      this.statusEl.removeClass('pi-chat-status-busy')
      this.statusEl.addClass('pi-chat-status-ready')
      this.retryBtn.addClass('is-hidden')
      this.startContextPoller()
    } catch (err) {
      console.error('obsidian-pi: initSession error:', err)
      this.statusEl.setText(
        'Error: ' + (err instanceof Error ? err.message : String(err)),
      )
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
    if (!this.session || !this.contextEl) return
    const usage = this.session.getContextUsage()
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
          this.updateStreamingMessage()
        } else if (assistantEvent?.type === 'thinking_delta') {
          // Could render thinking block, for now skip
        }
        break
      }

      case 'tool_execution_start': {
        const toolCall: ToolCallInfo = {
          name: event.toolName,
          args: JSON.stringify(event.args, null, 2),
        }
        this.currentToolCalls.set(event.toolCallId, toolCall)
        this.updateStreamingMessage()
        break
      }

      case 'tool_execution_end': {
        const toolCall = this.currentToolCalls.get(event.toolCallId)
        if (toolCall) {
          const result = event.result
          toolCall.result = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          toolCall.isError = event.isError
        }
        this.updateStreamingMessage()
        break
      }

      case 'turn_end': {
        // Finalize the assistant message
        const toolCalls = Array.from(this.currentToolCalls.values())
        this.messages.push({
          role: 'assistant',
          text: this.currentAssistantText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        })
        this.currentAssistantText = ''
        this.currentToolCalls.clear()
        this.isStreaming = false
        this.updateSendButton()
        this.renderMessages()
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

  private updateStreamingMessage() {
    // Render or update the in-progress assistant bubble
    let streamEl = this.messagesEl.querySelector('.pi-chat-streaming') as HTMLElement | null
    if (!streamEl) {
      streamEl = this.messagesEl.createDiv('pi-chat-message pi-chat-message-assistant pi-chat-streaming')
    }
    streamEl.empty()

    // Render text so far
    if (this.currentAssistantText) {
      const textEl = streamEl.createDiv('pi-chat-message-text')
      this.renderMarkdown(textEl, this.currentAssistantText)
    }

    // Render tool calls
    for (const [id, tc] of this.currentToolCalls) {
      this.createToolCallEl(
        streamEl,
        tc,
        id,
        tc.result === undefined,
      )
    }

    this.scrollToBottom()
  }

  private createToolCallEl(
    parent: HTMLElement,
    tc: ToolCallInfo,
    id: string,
    defaultExpanded: boolean,
  ): HTMLElement {
    const expanded = this.toggledToolCalls.has(id)
      ? this.toolCallExpanded.get(id)!
      : defaultExpanded

    const toolEl = parent.createDiv('pi-chat-tool-call')
    if (tc.isError) toolEl.addClass('pi-chat-tool-error')
    if (expanded) toolEl.addClass('is-expanded')

    const header = toolEl.createDiv('pi-chat-tool-header')
    const iconEl = header.createSpan('pi-chat-tool-icon')
    setIcon(iconEl, 'wrench')

    const nameEl = header.createSpan('pi-chat-tool-name')
    nameEl.setText(` ${tc.name}`)

    const summary = this.extractToolResultSummary(tc)
    if (summary) {
      const summaryEl = header.createSpan('pi-chat-tool-summary')
      summaryEl.setText(summary)
    }

    const toggleEl = header.createSpan('pi-chat-tool-toggle')
    setIcon(toggleEl, expanded ? 'chevron-down' : 'chevron-right')

    if (tc.result === undefined) {
      toolEl.addClass('pi-chat-tool-running')
      const spinner = header.createDiv('pi-chat-tool-spinner')
      spinner.setText('⋯')
    } else {
      toolEl.addClass('pi-chat-tool-done')
    }

    let resultEl: HTMLElement | null = null
    if (tc.result !== undefined) {
      resultEl = toolEl.createDiv('pi-chat-tool-result')
      const pre = resultEl.createEl('pre')
      pre.setText(tc.result)
      if (!expanded) resultEl.style.display = 'none'
    }

    header.addEventListener('click', () => {
      const isExpanded = toolEl.hasClass('is-expanded')
      if (isExpanded) {
        toolEl.removeClass('is-expanded')
        setIcon(toggleEl, 'chevron-right')
        if (resultEl) resultEl.style.display = 'none'
      } else {
        toolEl.addClass('is-expanded')
        setIcon(toggleEl, 'chevron-down')
        if (resultEl) resultEl.style.display = ''
      }
      this.toggledToolCalls.add(id)
      this.toolCallExpanded.set(id, !isExpanded)
    })

    return toolEl
  }

  private extractToolResultSummary(tc: ToolCallInfo): string | null {
    if (!tc.result) return null
    try {
      const parsed = JSON.parse(tc.result)
      if (parsed?.content?.text && typeof parsed.content.text === 'string') {
        return this.truncateSummary(parsed.content.text)
      }
      if (Array.isArray(parsed?.content)) {
        for (const block of parsed.content) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            return this.truncateSummary(block.text)
          }
        }
      }
    } catch {
      // Not JSON — ignore
    }
    return null
  }

  private truncateSummary(text: string, maxLen = 80): string {
    const trimmed = text.trim().replace(/\s+/g, ' ')
    if (trimmed.length <= maxLen) return trimmed
    return trimmed.slice(0, maxLen - 1) + '…'
  }

  private async handleSend() {
    const text = this.inputEl.value.trim()
    const hasAttachments = this.pendingAttachments.length > 0
    if ((!text && !hasAttachments) || this.isStreaming || !this.session) return

    // Build full message with inline file attachments and collect images
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

    this.inputEl.value = ''
    this.inputEl.style.height = 'auto'
    this.pendingAttachments = []
    this.closeMentionSuggest()

    // Add user message to UI
    this.messages.push({ role: 'user', text: fullMessage })
    this.renderMessages()

    // Send to Pi
    try {
      const options: { images?: ImageContent[] } =
        images.length > 0 ? { images } : {}
      await this.session.prompt(fullMessage, options)
    } catch (err) {
      this.messages.push({
        role: 'system',
        text: 'Error: ' + (err instanceof Error ? err.message : String(err)),
      })
      this.renderMessages()
      this.isStreaming = false
      this.updateSendButton()
    }
  }

  private renderMessages() {
    this.messagesEl.empty()

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i]
      const msgEl = this.messagesEl.createDiv(
        `pi-chat-message pi-chat-message-${msg.role}`,
      )

      if (msg.role === 'user') {
        this.renderUserText(msgEl, msg.text)
      } else {
        const textEl = msgEl.createDiv('pi-chat-message-text')
        this.renderMarkdown(textEl, msg.text)
      }

      // Render completed tool calls (collapsed by default)
      if (msg.toolCalls) {
        for (let j = 0; j < msg.toolCalls.length; j++) {
          const tc = msg.toolCalls[j]
          this.createToolCallEl(
            msgEl,
            tc,
            `history-${i}-${j}`,
            false,
          )
        }
      }
    }

    this.scrollToBottom()
  }

  private renderUserText(msgEl: HTMLElement, text: string) {
    for (const seg of splitFileBlocks(text)) {
      if (seg.type === 'text') {
        const textEl = msgEl.createDiv('pi-chat-message-text')
        this.renderMarkdown(textEl, seg.text)
      } else {
        const details = msgEl.createEl('details', {
          cls: 'pi-chat-file-attachment',
        })
        details.createEl('summary', {
          cls: 'pi-chat-file-summary',
          text: seg.label,
        })
        details.createEl('pre', { cls: 'pi-chat-file-body' }).createEl('code', {
          text: seg.body,
        })
      }
    }
  }

  private renderMarkdown(el: HTMLElement, text: string) {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? ''
    MarkdownRenderer.render(this.app, text, el, sourcePath, this)
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
    } else {
      setIcon(this.sendBtn, 'send-horizontal')
      this.sendBtn.disabled = false
    }
  }

  async restartSession(): Promise<void> {
    this.stopContextPoller()
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session = null
    this.currentAssistantText = ''
    this.currentToolCalls.clear()
    this.isStreaming = false
    this.updateSendButton()
    this.retryBtn?.addClass('is-hidden')
    await this.initSession()
  }

  async onClose() {
    this.stopContextPoller()
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session = null
  }
}