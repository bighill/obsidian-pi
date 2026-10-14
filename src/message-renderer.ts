import { App, Component, MarkdownRenderer } from 'obsidian'
import { splitFileBlocks } from './at-mention'
import { computeLineDiff } from './diff'
import type { ChatAttachment } from './attachments'

/** A rendered chat message stored in the view. */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  toolCalls?: ToolCallInfo[]
  attachments?: ChatAttachment[]
}

/** Tool call metadata produced by the SDK and rendered in the UI. */
export interface ToolCallInfo {
  id?: string
  name: string
  args: string
  result?: string
  isError?: boolean
}

/** Toggle state for completed and in-progress tool calls. */
export interface ToolState {
  expanded: Map<string, boolean>
  toggled: Set<string>
}

/**
 * Renders chat messages, streaming assistant output, and tool-call panels.
 *
 * This class encapsulates all DOM construction for the message pane so the
 * view can focus on input handling and SDK lifecycle.
 */
export class MessageRenderer {
  private app: App
  private component: Component

  constructor(app: App, component: Component) {
    this.app = app
    this.component = component
  }

  /** Render the full message history into `container`. */
  renderMessages(container: HTMLElement, messages: ChatMessage[], state: ToolState): void {
    container.empty()

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const msgEl = container.createDiv(`pi-chat-message pi-chat-message-${msg.role}`)

      if (msg.role === 'user') {
        if (msg.attachments && msg.attachments.length > 0) {
          if (msg.text) {
            const textEl = msgEl.createDiv('pi-chat-message-text')
            this.renderMarkdown(textEl, msg.text)
          }
          this.renderUserAttachments(msgEl, msg.attachments)
        } else {
          this.renderUserText(msgEl, msg.text)
        }
      } else {
        const textEl = msgEl.createDiv('pi-chat-message-text')
        this.renderMarkdown(textEl, msg.text)
      }

      // Render completed tool calls (collapsed by default)
      if (msg.toolCalls) {
        for (let j = 0; j < msg.toolCalls.length; j++) {
          const tc = msg.toolCalls[j]
          const id = tc.id ?? `history-${i}-${j}`
          this.createToolCallEl(msgEl, tc, id, false, state)
        }
      }
    }
  }

  /**
   * Render or update the in-progress assistant bubble. If no streaming element
   * exists yet, one is created; otherwise the existing element is emptied and
   * rebuilt from the latest text and tool calls.
   */
  renderStreaming(
    container: HTMLElement,
    text: string,
    toolCalls: Map<string, ToolCallInfo>,
    state: ToolState,
  ): HTMLElement {
    let streamEl = container.querySelector('.pi-chat-streaming') as HTMLElement | null
    if (!streamEl) {
      streamEl = container.createDiv('pi-chat-message pi-chat-message-assistant pi-chat-streaming')
    }
    streamEl.empty()

    if (text) {
      const textEl = streamEl.createDiv('pi-chat-message-text')
      this.renderMarkdown(textEl, text)
    }

    for (const [id, tc] of toolCalls) {
      this.createToolCallEl(streamEl, tc, id, tc.result === undefined, state)
    }

    return streamEl
  }

  private renderUserText(msgEl: HTMLElement, text: string): void {
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

  private renderUserAttachments(msgEl: HTMLElement, attachments: ChatAttachment[]): void {
    for (const att of attachments) {
      if (att.image) {
        const labelEl = msgEl.createDiv('pi-chat-attachment-label')
        labelEl.setText(`📎 ${att.name} (image)`)
        continue
      }

      const body = att.body ?? att.content ?? ''
      if (!body) {
        const labelEl = msgEl.createDiv('pi-chat-attachment-label')
        labelEl.setText(`📎 ${att.name}`)
        continue
      }

      const details = msgEl.createEl('details', {
        cls: 'pi-chat-file-attachment',
      })
      details.createEl('summary', {
        cls: 'pi-chat-file-summary',
        text: att.name + (att.tooLarge ? ' (too large; name only)' : ''),
      })
      details.createEl('pre', { cls: 'pi-chat-file-body' }).createEl('code', {
        text: body,
      })
    }
  }

  private renderMarkdown(el: HTMLElement, text: string): void {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? ''
    MarkdownRenderer.render(this.app, text, el, sourcePath, this.component)
  }

  private createToolCallEl(
    parent: HTMLElement,
    tc: ToolCallInfo,
    id: string,
    defaultExpanded: boolean,
    state: ToolState,
  ): HTMLElement {
    const expanded = state.toggled.has(id) ? state.expanded.get(id)! : defaultExpanded

    const toolEl = parent.createDiv('pi-chat-tool-call')
    if (tc.isError) toolEl.addClass('pi-chat-tool-error')
    if (expanded) toolEl.addClass('is-expanded')

    const header = toolEl.createDiv('pi-chat-tool-header')
    const nameEl = header.createSpan('pi-chat-tool-name')

    // For bash, show the full command directly in place of the tool name.
    if (tc.name === 'bash') {
      const command = this.extractBashCommand(tc)
      nameEl.setText(command ? `${command}` : 'bash')
    } else {
      const summary = this.extractToolOperationSummary(tc)
      nameEl.setText(summary ? `${tc.name} ${summary}` : `${tc.name}`)
    }

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
      const diffRendered = tc.name === 'edit' && this.renderEditDiff(resultEl, tc)
      if (!diffRendered) {
        const pre = resultEl.createEl('pre')
        pre.setText(this.extractReadableResult(tc))
      }
      if (!expanded) resultEl.style.display = 'none'
    }

    header.addEventListener('click', () => {
      const isExpanded = toolEl.hasClass('is-expanded')
      if (isExpanded) {
        toolEl.removeClass('is-expanded')
        if (resultEl) resultEl.style.display = 'none'
      } else {
        toolEl.addClass('is-expanded')
        if (resultEl) resultEl.style.display = ''
      }
      state.toggled.add(id)
      state.expanded.set(id, !isExpanded)
    })

    return toolEl
  }

  private renderEditDiff(container: HTMLElement, tc: ToolCallInfo): boolean {
    if (tc.isError) return false
    const editArgs = this.parseEditArgs(tc)
    if (!editArgs) return false

    let anyRendered = false
    for (let i = 0; i < editArgs.edits.length; i++) {
      const { oldText, newText } = editArgs.edits[i]
      const diff = computeLineDiff(oldText, newText)
      if (!diff || diff.length === 0) continue
      anyRendered = true

      const wrapper = container.createDiv('pi-chat-diff')
      if (editArgs.edits.length > 1) {
        wrapper.createEl('div', {
          cls: 'pi-chat-diff-edit-label',
          text: `Edit ${i + 1}/${editArgs.edits.length}`,
        })
      }
      for (const line of diff) {
        const lineEl = wrapper.createDiv(`pi-chat-diff-line pi-chat-diff-${line.type}`)
        lineEl.createSpan({
          cls: 'pi-chat-diff-marker',
          text: line.type === 'same' ? ' ' : line.type === 'remove' ? '-' : '+',
        })
        lineEl.createSpan({ cls: 'pi-chat-diff-text', text: line.text })
      }
    }
    return anyRendered
  }

  private parseEditArgs(
    tc: ToolCallInfo,
  ): { path?: string; edits: { oldText: string; newText: string }[] } | null {
    if (tc.name !== 'edit' || !tc.args) return null
    try {
      const parsed = JSON.parse(tc.args)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
      const a = parsed as Record<string, unknown>

      let editsInput: unknown = a.edits
      if (typeof editsInput === 'string') {
        try {
          editsInput = JSON.parse(editsInput)
        } catch {
          editsInput = undefined
        }
      }

      const edits: { oldText: string; newText: string }[] = []
      if (Array.isArray(editsInput)) {
        for (const edit of editsInput) {
          if (
            edit &&
            typeof edit === 'object' &&
            typeof edit.oldText === 'string' &&
            typeof edit.newText === 'string'
          ) {
            edits.push({ oldText: edit.oldText, newText: edit.newText })
          }
        }
      }

      if (typeof a.oldText === 'string' && typeof a.newText === 'string') {
        edits.push({ oldText: a.oldText, newText: a.newText })
      }

      if (edits.length === 0) return null
      return { path: typeof a.path === 'string' ? a.path : undefined, edits }
    } catch {
      return null
    }
  }

  private extractBashCommand(tc: ToolCallInfo): string | null {
    if (!tc.args) return null
    try {
      const parsed = JSON.parse(tc.args)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const command = (parsed as Record<string, unknown>).command
        if (typeof command === 'string') return command.trim()
      }
    } catch {
      // Not JSON — ignore
    }
    return null
  }

  private extractReadableResult(tc: ToolCallInfo): string {
    if (!tc.result) return ''
    try {
      const parsed = JSON.parse(tc.result)
      if (parsed?.content?.text && typeof parsed.content.text === 'string') {
        return parsed.content.text
      }
      if (Array.isArray(parsed?.content)) {
        const textBlocks: string[] = []
        for (const block of parsed.content) {
          if (block?.type === 'text' && typeof block.text === 'string') {
            textBlocks.push(block.text)
          }
        }
        if (textBlocks.length > 0) return textBlocks.join('\n')
      }
    } catch {
      // Not JSON — fall through to raw result
    }
    return tc.result
  }

  private extractToolOperationSummary(tc: ToolCallInfo): string | null {
    if (!tc.args || tc.name === 'bash') return null
    try {
      const parsed = JSON.parse(tc.args)
      return this.formatToolOperation(tc.name, parsed)
    } catch {
      // Not JSON — ignore
    }
    return null
  }

  private formatToolOperation(name: string, args: unknown): string | null {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return null
    const a = args as Record<string, unknown>
    const path = typeof a.path === 'string' ? a.path : undefined
    const pattern = typeof a.pattern === 'string' ? a.pattern : undefined

    switch (name) {
      case 'read':
      case 'write':
      case 'edit':
      case 'ls':
        return path ? this.truncateSummary(path) : null
      case 'grep':
      case 'find': {
        if (!pattern) return null
        const base = this.truncateSummary(pattern, path ? 50 : 80)
        return path ? `${base} in ${this.truncateSummary(path, 30)}` : base
      }
      default:
        // Best-effort fallback for unknown/extension tools.
        if (pattern) return this.truncateSummary(pattern)
        if (path) return this.truncateSummary(path)
        return null
    }
  }

  private truncateSummary(text: string, maxLen = 80): string {
    const trimmed = text.trim().replace(/\s+/g, ' ')
    if (trimmed.length <= maxLen) return trimmed
    return trimmed.slice(0, maxLen - 1) + '…'
  }
}
