import { describe, it, expect } from 'vitest'
import {
  eventToChord,
  normalizeChord,
  matchChord,
  shouldIgnoreTarget,
  formatChordParts,
} from './hotkeyHelpers.js'

describe('eventToChord', () => {
  it('maps modifier + key (meta or ctrl → mod)', () => {
    expect(eventToChord({ key: 'k', metaKey: true })).toBe('mod+k')
    expect(eventToChord({ key: 'K', ctrlKey: true })).toBe('mod+k')
  })
  it('treats shifted symbols as the symbol (no shift token)', () => {
    expect(eventToChord({ key: '?', shiftKey: true })).toBe('?')
    expect(eventToChord({ key: '/' })).toBe('/')
  })
  it('keeps shift for letters/named keys', () => {
    expect(eventToChord({ key: 'A', shiftKey: true })).toBe('shift+a')
  })
  it('normalizes space and returns empty for modifier-only presses', () => {
    expect(eventToChord({ key: ' ' })).toBe('space')
    expect(eventToChord({ key: 'Meta', metaKey: true })).toBe('')
  })
})

describe('normalizeChord', () => {
  it('lowercases and fixes modifier order', () => {
    expect(normalizeChord('Mod+K')).toBe('mod+k')
    expect(normalizeChord('shift+mod+p')).toBe('mod+shift+p')
    expect(normalizeChord('?')).toBe('?')
  })
})

describe('matchChord', () => {
  it('matches regardless of registration casing/order', () => {
    expect(matchChord({ key: 'k', metaKey: true }, 'Mod+K')).toBe(true)
    expect(matchChord({ key: 'p', metaKey: true, shiftKey: true }, 'shift+mod+p')).toBe(true)
    expect(matchChord({ key: 'j', metaKey: true }, 'mod+k')).toBe(false)
  })
})

describe('shouldIgnoreTarget', () => {
  it('ignores text fields unless allowed', () => {
    expect(shouldIgnoreTarget({ tagName: 'INPUT' })).toBe(true)
    expect(shouldIgnoreTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(shouldIgnoreTarget({ isContentEditable: true })).toBe(true)
    expect(shouldIgnoreTarget({ tagName: 'INPUT' }, true)).toBe(false)
    expect(shouldIgnoreTarget({ tagName: 'DIV' })).toBe(false)
  })
})

describe('formatChordParts', () => {
  it('renders platform-aware tokens', () => {
    expect(formatChordParts('mod+k', true)).toEqual(['⌘', 'K'])
    expect(formatChordParts('mod+k', false)).toEqual(['Ctrl', 'K'])
    expect(formatChordParts('escape')).toEqual(['Esc'])
    expect(formatChordParts('?')).toEqual(['?'])
  })
})
