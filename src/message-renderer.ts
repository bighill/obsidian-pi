import { App, Component, MarkdownRenderer, setIcon } from 'obsidian'
import { splitFileBlocks } from './at-mention'
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
  renderMessages(
    container: HTMLElement,
    messages: ChatMessage[],
    state: ToolState,
  ): void {
    container.empty()

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      const msgEl = container.createDiv(
        `pi-chat-message pi-chat-message-${msg.role}`,
      )

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
          this.createToolCallEl(
            msgEl,
            tc,
            `history-${i}-${j}`,
            false,
            state,
          )
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
    let streamEl = container.querySelector(
      '.pi-chat-streaming',
    ) as HTMLElement | null
    if (!streamEl) {
      streamEl = container.createDiv(
        'pi-chat-message pi-chat-message-assistant pi-chat-streaming',
      )
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

  private renderUserAttachments(
    msgEl: HTMLElement,
    attachments: ChatAttachment[],
  ): void {
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
    const expanded = state.toggled.has(id)
      ? state.expanded.get(id)!
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
      state.toggled.add(id)
      state.expanded.set(id, !isExpanded)
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
}
