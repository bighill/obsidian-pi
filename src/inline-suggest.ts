export interface SuggestItem {
  path: string
  display: string
  description?: string
}

export class InlineSuggest {
  private containerEl: HTMLElement
  private listEl: HTMLElement
  private items: SuggestItem[] = []
  private selectedIndex = 0
  private open = false
  private registerDomEvent: <K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ) => void
  onChoose: (item: SuggestItem) => void = () => {}

  constructor(
    host: HTMLElement,
    registerDomEvent?: <K extends keyof HTMLElementEventMap>(
      el: HTMLElement,
      type: K,
      callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ) => void,
  ) {
    this.registerDomEvent =
      registerDomEvent ??
      ((el, type, callback) => {
        el.addEventListener(type, callback as EventListener)
      })
    this.containerEl = host.createDiv('pi-chat-suggest')
    this.containerEl.addClass('is-hidden')
    this.listEl = this.containerEl.createDiv('pi-chat-suggest-list')
  }

  get isOpen(): boolean {
    return this.open
  }

  show(items: SuggestItem[]): void {
    this.items = items
    this.selectedIndex = 0
    this.open = true
    this.containerEl.removeClass('is-hidden')
    this.render()
  }

  update(items: SuggestItem[]): void {
    this.items = items
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, items.length - 1))
    this.render()
  }

  close(): void {
    this.open = false
    this.items = []
    this.containerEl.addClass('is-hidden')
    this.listEl.empty()
  }

  moveSelection(delta: number): void {
    if (this.items.length === 0) return
    const n = this.items.length
    this.selectedIndex = (this.selectedIndex + delta + n) % n
    this.render()
  }

  current(): SuggestItem | null {
    return this.items[this.selectedIndex] ?? null
  }

  private render(): void {
    this.listEl.empty()
    if (this.items.length === 0) {
      this.listEl.createDiv({
        cls: 'pi-chat-suggest-empty',
        text: 'No matching files',
      })
      return
    }
    this.items.forEach((item, i) => {
      const row = this.listEl.createDiv('pi-chat-suggest-item')
      if (i === this.selectedIndex) row.addClass('is-selected')
      const slash = item.display.lastIndexOf('/')
      const name = slash >= 0 ? item.display.slice(slash + 1) : item.display
      const dir = slash >= 0 ? item.display.slice(0, slash + 1) : ''
      row.createSpan({ cls: 'pi-chat-suggest-name', text: name })
      if (dir) row.createSpan({ cls: 'pi-chat-suggest-path', text: dir })
      if (item.description) {
        row.createSpan({
          cls: 'pi-chat-suggest-desc',
          text: item.description,
        })
      }
      this.registerDomEvent(row, 'mousedown', (e: MouseEvent) => {
        e.preventDefault()
        this.onChoose(item)
      })
      this.registerDomEvent(row, 'mouseenter', () => {
        this.selectedIndex = i
        this.render()
      })
    })
  }
}
