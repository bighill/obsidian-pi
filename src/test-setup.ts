// Minimal DOM helpers that mirror Obsidian's HTMLElement extensions for tests.

function polyfill(name: string, fn: (...args: unknown[]) => unknown) {
  if (!(name in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, name, {
      value: fn,
      writable: true,
      configurable: true,
    })
  }
}

polyfill('addClass', function (this: HTMLElement, ...cls: string[]) {
  this.classList.add(...cls)
  return this
})

polyfill('removeClass', function (this: HTMLElement, ...cls: string[]) {
  this.classList.remove(...cls)
  return this
})

polyfill('hasClass', function (this: HTMLElement, cls: string) {
  return this.classList.contains(cls)
})

polyfill('empty', function (this: HTMLElement) {
  while (this.firstChild) {
    this.removeChild(this.firstChild)
  }
  return this
})

polyfill('setText', function (this: HTMLElement, text: string) {
  this.textContent = text
  return this
})

polyfill('createDiv', function (this: HTMLElement, cls?: string) {
  const el = document.createElement('div')
  if (cls) el.classList.add(...cls.split(' ').filter(Boolean))
  this.appendChild(el)
  return el
})

polyfill(
  'createEl',
  function (
    this: HTMLElement,
    tag: string,
    attrs?: { cls?: string; text?: string; attr?: Record<string, string> },
  ) {
    const el = document.createElement(tag)
    if (attrs?.cls) el.classList.add(...attrs.cls.split(' ').filter(Boolean))
    if (attrs?.text) el.textContent = attrs.text
    if (attrs?.attr) {
      for (const [key, value] of Object.entries(attrs.attr)) {
        el.setAttribute(key, value)
      }
    }
    this.appendChild(el)
    return el
  },
)

polyfill(
  'createSpan',
  function (
    this: HTMLElement,
    attrs?: { cls?: string; text?: string },
  ) {
    const el = document.createElement('span')
    if (attrs?.cls) el.classList.add(...attrs.cls.split(' ').filter(Boolean))
    if (attrs?.text) el.textContent = attrs.text
    this.appendChild(el)
    return el
  },
)
