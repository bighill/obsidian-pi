import { describe, expect, it } from 'vitest'
import { InlineSuggest, type SuggestItem } from './inline-suggest'

describe('InlineSuggest', () => {
  const items: SuggestItem[] = [
    { path: 'a.md', display: 'a.md' },
    { path: 'b.md', display: 'b/b.md' },
    { path: 'c.md', display: 'c.md', description: 'note' },
  ]

  function createSuggest(): { host: HTMLElement; suggest: InlineSuggest } {
    const host = document.createElement('div')
    const suggest = new InlineSuggest(host)
    return { host, suggest }
  }

  it('is closed by default', () => {
    const { suggest } = createSuggest()
    expect(suggest.isOpen).toBe(false)
  })

  it('opens when shown and renders rows', () => {
    const { host, suggest } = createSuggest()
    suggest.show(items)
    expect(suggest.isOpen).toBe(true)
    expect(host.querySelectorAll('.pi-chat-suggest-item').length).toBe(3)
  })

  it('selects the first item by default', () => {
    const { suggest } = createSuggest()
    suggest.show(items)
    expect(suggest.current()).toEqual(items[0])
  })

  it('moves selection down and wraps', () => {
    const { suggest } = createSuggest()
    suggest.show(items)
    suggest.moveSelection(1)
    expect(suggest.current()).toEqual(items[1])
    suggest.moveSelection(1)
    expect(suggest.current()).toEqual(items[2])
    suggest.moveSelection(1)
    expect(suggest.current()).toEqual(items[0])
  })

  it('moves selection up and wraps', () => {
    const { suggest } = createSuggest()
    suggest.show(items)
    suggest.moveSelection(-1)
    expect(suggest.current()).toEqual(items[2])
  })

  it('updates items while preserving a valid selection index', () => {
    const { suggest } = createSuggest()
    suggest.show(items)
    suggest.moveSelection(2)
    suggest.update([items[0], items[1]])
    expect(suggest.current()).toEqual(items[1])
  })

  it('closes and clears rows', () => {
    const { host, suggest } = createSuggest()
    suggest.show(items)
    suggest.close()
    expect(suggest.isOpen).toBe(false)
    expect(host.querySelectorAll('.pi-chat-suggest-item').length).toBe(0)
  })

  it('fires onChoose when an item is clicked', () => {
    const { host, suggest } = createSuggest()
    let chosen: SuggestItem | null = null
    suggest.onChoose = (item) => {
      chosen = item
    }
    suggest.show(items)
    const row = host.querySelectorAll('.pi-chat-suggest-item')[1]
    row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(chosen).toEqual(items[1])
  })
})
