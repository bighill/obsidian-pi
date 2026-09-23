import { describe, expect, it } from 'vitest'
import {
  classifyFile,
  detectMention,
  formatTextAttachment,
  imageMimeFromExt,
  rankMentions,
  reconcileMentions,
  replaceMention,
  splitFileBlocks,
} from './at-mention'

describe('detectMention', () => {
  it('returns null at the start of the text', () => {
    expect(detectMention('', 0)).toBeNull()
  })

  it('detects an @ at a word boundary', () => {
    expect(detectMention('hello @world', 'hello @world'.length)).toEqual({
      query: 'world',
      start: 6,
    })
  })

  it('returns null for email-like text', () => {
    expect(detectMention('user@example.com', 16)).toBeNull()
  })

  it('returns null for escaped @@', () => {
    expect(detectMention('@@note', 6)).toBeNull()
  })

  it('detects an @ at the beginning of the value', () => {
    expect(detectMention('@todo', 5)).toEqual({ query: 'todo', start: 0 })
  })
})

describe('replaceMention', () => {
  it('replaces the mention and returns the new caret position', () => {
    const result = replaceMention('hello @wo', 6, 2, '@world ')
    expect(result.value).toBe('hello @world ')
    expect(result.caret).toBe(13)
  })
})

describe('reconcileMentions', () => {
  it('keeps attachments whose token is still in the text', () => {
    const attachments = [
      { inline: true, token: '@file.md', extra: 1 },
      { inline: true, token: '@gone.md', extra: 2 },
    ]
    expect(reconcileMentions('See @file.md', attachments)).toEqual([
      { inline: true, token: '@file.md', extra: 1 },
    ])
  })

  it('keeps non-inline attachments regardless of token', () => {
    const attachments = [{ token: '@file.md', extra: 1 }]
    expect(reconcileMentions('', attachments)).toEqual(attachments)
  })
})

describe('rankMentions', () => {
  const files = [
    { path: 'a/b.md', mtime: 100 },
    { path: 'z.md', mtime: 300 },
    { path: 'c.md', mtime: 200 },
  ]

  it('returns most recently modified files when there is no query', () => {
    expect(rankMentions(files, '', () => 0, 2)).toEqual([
      { path: 'z.md', mtime: 300 },
      { path: 'c.md', mtime: 200 },
    ])
  })

  it('filters by score and sorts by score then recency', () => {
    const score = (_q: string, path: string) => (path.includes('b') ? 5 : null)
    expect(rankMentions(files, 'b', score, 10)).toEqual([{ path: 'a/b.md', mtime: 100 }])
  })
})

describe('splitFileBlocks', () => {
  it('splits text and file-attachment blocks', () => {
    const text = 'intro\n\nFile: notes.md\n```\nbody\n```\n\noutro'
    expect(splitFileBlocks(text)).toEqual([
      { type: 'text', text: 'intro' },
      { type: 'file', label: 'notes.md', body: 'body' },
      { type: 'text', text: 'outro' },
    ])
  })

  it('returns plain text when there are no file blocks', () => {
    expect(splitFileBlocks('plain text')).toEqual([{ type: 'text', text: 'plain text' }])
  })
})

describe('formatTextAttachment', () => {
  it('wraps content with a metadata header', () => {
    const result = formatTextAttachment('notes.md', 'line1\nline2')
    expect(result).toContain('File: notes.md (2 lines)')
    expect(result).toContain('```')
    expect(result).toContain('line1')
  })

  it('truncates oversized content', () => {
    const result = formatTextAttachment('big.md', 'x'.repeat(50_000), 100)
    expect(result).toContain('truncated to 100 chars')
    expect(result.length).toBeLessThan(500)
  })
})

describe('classifyFile', () => {
  it('classifies markdown as text', () => {
    expect(classifyFile('note.md')).toBe('text')
  })

  it('classifies png as image', () => {
    expect(classifyFile('photo.png')).toBe('image')
  })

  it('classifies unknown extensions as binary', () => {
    expect(classifyFile('data.bin')).toBe('binary')
  })
})

describe('imageMimeFromExt', () => {
  it('maps common image extensions', () => {
    expect(imageMimeFromExt('png')).toBe('image/png')
    expect(imageMimeFromExt('jpg')).toBe('image/jpeg')
    expect(imageMimeFromExt('svg')).toBe('image/svg+xml')
  })

  it('falls back to image/png for unknown extensions', () => {
    expect(imageMimeFromExt('xyz')).toBe('image/png')
  })
})
