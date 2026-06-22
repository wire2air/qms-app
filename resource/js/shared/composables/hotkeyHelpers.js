/**
 * Pure helpers for the keyboard-shortcut system (Enterprise Page Framework F5 / L1).
 * Side-effect-free chord parsing/matching so useHotkeys stays a thin listener.
 *
 * Chord syntax: `+`-joined tokens — modifiers `mod` (⌘ on mac / Ctrl elsewhere),
 * `alt`, `shift`, then a single key (`k`, `/`, `?`, `escape`, `arrowup`, `space`).
 * Shifted symbols (`?`, `!`) encode shift in the character itself, so don't add
 * `shift` for them — register `?`, not `shift+/`.
 */

const MOD_ORDER = ['mod', 'alt', 'shift']

function isSymbol(key) {
  return key.length === 1 && !/[a-z0-9]/i.test(key)
}

/** Canonical chord string for a KeyboardEvent (''+ for a modifier-only press). */
export function eventToChord(event) {
  const lower = (event.key || '').toLowerCase()
  if (['control', 'meta', 'alt', 'shift', 'os'].includes(lower)) return ''
  const parts = []
  if (event.metaKey || event.ctrlKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey && !isSymbol(event.key)) parts.push('shift')
  parts.push(lower === ' ' ? 'space' : lower)
  return parts.join('+')
}

/** Canonicalize a registration string (modifier order fixed, lowercased). */
export function normalizeChord(str) {
  const tokens = String(str)
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
  const mods = MOD_ORDER.filter((m) => tokens.includes(m))
  const keys = tokens.filter((t) => !MOD_ORDER.includes(t))
  const key = keys[keys.length - 1] ?? ''
  return [...mods, key].filter(Boolean).join('+')
}

/** True when the event matches the chord. */
export function matchChord(event, chord) {
  const ec = eventToChord(event)
  return ec !== '' && ec === normalizeChord(chord)
}

/** Whether to skip a shortcut because focus is in a text field (unless allowed). */
export function shouldIgnoreTarget(target, allowInInput = false) {
  if (allowInInput || !target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target.isContentEditable
}

const DISPLAY = {
  alt: { mac: '⌥', other: 'Alt' },
  shift: { mac: '⇧', other: '⇧' },
  space: { mac: 'Space', other: 'Space' },
  escape: { mac: 'Esc', other: 'Esc' },
  enter: { mac: '↵', other: 'Enter' },
  arrowup: { mac: '↑', other: '↑' },
  arrowdown: { mac: '↓', other: '↓' },
  arrowleft: { mac: '←', other: '←' },
  arrowright: { mac: '→', other: '→' },
}

/** Render a chord into display tokens for <kbd> elements. */
export function formatChordParts(chord, mac = false) {
  return normalizeChord(chord)
    .split('+')
    .map((t) => {
      if (t === 'mod') return mac ? '⌘' : 'Ctrl'
      const d = DISPLAY[t]
      if (d) return mac ? d.mac : d.other
      return t.length === 1 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1)
    })
}
