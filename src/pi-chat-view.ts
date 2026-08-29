import { ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon } from 'obsidian'
import type ObsidianPiPlugin from './main'
import {
  createAgentSession,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent'
import { join } from 'path'
import { homedir } from 'os'

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
  private messages: ChatMessage[] = []
  private isStreaming = false
  private currentAssistantText = ''
  private currentToolCalls: Map<string, ToolCallInfo> = new Map()
  private toolCallExpanded: Map<string, boolean> = new Map()
  private toggledToolCalls: Set<string> = new Set()

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
    this.statusEl = header.createDiv('pi-chat-status')
    this.statusEl.setText('Not connected')

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
    this.sendBtn = inputArea.createEl('button', {
      cls: 'pi-chat-send',
    })
    setIcon(this.sendBtn, 'send-horizontal')

    // ─── Event handlers ─────────────────────────────────────
    this.sendBtn.addEventListener('click', () => this.handleSend())
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.handleSend()
      }
    })
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto'
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 200) + 'px'
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

      const cwd = this.plugin.settings.workingDir || this.app.vault.adapter.getBasePath()
      const agentDir = join(homedir(), '.pi', 'agent')

      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        appendSystemPrompt: [
          `Current timestamp: ${new Date().toISOString()}`,
        ],
      })
      await resourceLoader.reload()

      const options: Record<string, unknown> = {
        cwd,
        agentDir,
        resourceLoader,
      }

      // Apply settings overrides if set
      if (this.plugin.settings.thinkingLevel) {
        options.thinkingLevel = this.plugin.settings.thinkingLevel
      }

      const result = await createAgentSession(options as any)
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
    } catch (err) {
      console.error('obsidian-pi: initSession error:', err)
      this.statusEl.setText('Error: ' + (err instanceof Error ? err.message : String(err)))
      this.statusEl.removeClass('pi-chat-status-busy')
      this.statusEl.addClass('pi-chat-status-error')
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
        const assistantEvent = (event as any).assistantMessageEvent
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
          name: (event as any).toolName,
          args: JSON.stringify((event as any).args, null, 2),
        }
        this.currentToolCalls.set((event as any).toolCallId, toolCall)
        this.updateStreamingMessage()
        break
      }

      case 'tool_execution_end': {
        const toolCall = this.currentToolCalls.get((event as any).toolCallId)
        if (toolCall) {
          const result = (event as any).result
          toolCall.result = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          toolCall.isError = (event as any).isError
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
    if (!text || this.isStreaming || !this.session) return

    // Add user message to UI
    this.messages.push({ role: 'user', text })
    this.inputEl.value = ''
    this.inputEl.style.height = 'auto'
    this.renderMessages()

    // Send to Pi
    try {
      await this.session.prompt(text)
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

      const textEl = msgEl.createDiv('pi-chat-message-text')
      this.renderMarkdown(textEl, msg.text)

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

  private renderMarkdown(el: HTMLElement, text: string) {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? ''
    MarkdownRenderer.render(this.app, text, el, sourcePath, this)
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

  async onClose() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.session = null
  }
}