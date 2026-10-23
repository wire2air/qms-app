import { describe, it, expect } from 'vitest'
import { lineDiff, foldDiff, diffStats } from './kbDiff.js'

describe('kb line diff', () => {
  it('marks added, removed and kept lines', () => {
    const rows = lineDiff('a\nb\nc', 'a\nB\nc\nd')
    expect(rows).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'B' },
      { type: 'same', text: 'c' },
      { type: 'add', text: 'd' },
    ])
    expect(diffStats(rows)).toEqual({ added: 2, removed: 1 })
  })
  it('folds long unchanged runs', () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const b = a.replace('l10', 'X')
    const folded = foldDiff(lineDiff(a, b), 2)
    expect(folded[0]).toEqual({ type: 'skip', count: 8 })
    expect(folded.at(-1)).toEqual({ type: 'skip', count: 7 })
  })
  it('handles empty texts', () => {
    expect(lineDiff('', 'x')).toEqual([
      { type: 'del', text: '' },
      { type: 'add', text: 'x' },
    ])
  })
})
