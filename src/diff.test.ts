import { describe, expect, it } from 'vitest'
import { computeLineDiff } from './diff'

describe('computeLineDiff', () => {
  it('returns null when either input is missing', () => {
    expect(computeLineDiff(undefined as unknown as string, 'a')).toBeNull()
    expect(computeLineDiff('a', undefined as unknown as string)).toBeNull()
  })

  it('returns null for oversized inputs', () => {
    const huge = Array.from({ length: 2000 }, () => 'x').join('\n')
    expect(computeLineDiff(huge, huge)).toBeNull()
  })

  it('reports identical inputs as all same', () => {
    expect(computeLineDiff('a\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ])
  })

  it('handles added lines', () => {
    expect(computeLineDiff('a', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'add', text: 'b' },
    ])
  })

  it('handles removed lines', () => {
    expect(computeLineDiff('a\nb', 'a')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: 'b' },
    ])
  })

  it('handles replaced lines as remove then add', () => {
    expect(computeLineDiff('a\nb', 'a\nc')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'c' },
    ])
  })

  it('finds the longest common subsequence', () => {
    const oldText = 'A\nB\nC\nD\nE'
    const newText = 'A\nC\nE\nF'
    expect(computeLineDiff(oldText, newText)).toEqual([
      { type: 'same', text: 'A' },
      { type: 'remove', text: 'B' },
      { type: 'same', text: 'C' },
      { type: 'remove', text: 'D' },
      { type: 'same', text: 'E' },
      { type: 'add', text: 'F' },
    ])
  })

  it('preserves empty lines', () => {
    expect(computeLineDiff('a\n\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'remove', text: '' },
      { type: 'same', text: 'b' },
    ])
  })

  it('normalizes CRLF line endings', () => {
    expect(computeLineDiff('a\r\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ])
  })
})
