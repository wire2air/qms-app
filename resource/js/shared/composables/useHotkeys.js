import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useEventListener } from '@vueuse/core'
import { matchChord, shouldIgnoreTarget } from './hotkeyHelpers.js'

/**
 * useHotkeys — central keyboard-shortcut registration (Enterprise Page Framework F5).
 *
 * Replaces hand-rolled `keydown` listeners (each re-implementing the text-field
 * guard). Registers one or more bindings, dispatches them on a window listener
 * (auto-cleaned on unmount), and records their metadata in a module-level
 * registry so a single `?` help overlay can list every active shortcut.
 *
 *   useHotkeys([
 *     { keys: 'mod+k', description: 'Command palette', group: 'Global', handler: openPalette },
 *     { keys: ['/', 's'], description: 'Search', group: 'Global', handler: focusSearch },
 *   ])
 *
 * Binding fields: `keys` (chord string or array), `handler(event)`, `description`
 * (omit to keep it out of the help overlay — e.g. internal Esc handling),
 * `group`, `when()` (gate), `allowInInput` (fire even while typing).
 */
const _registry = ref([])
let _uid = 0

export function useHotkeys(bindings, options = {}) {
  const { scope = 'global' } = options
  const list = (Array.isArray(bindings) ? bindings : [bindings]).map((b) => ({
    id: ++_uid,
    keys: Array.isArray(b.keys) ? b.keys : [b.keys],
    handler: b.handler,
    description: b.description ?? '',
    group: b.group ?? 'General',
    when: b.when,
    allowInInput: b.allowInInput ?? false,
    scope,
  }))

  function onKey(event) {
    for (const b of list) {
      if (b.when && !b.when()) continue
      if (!b.keys.some((k) => matchChord(event, k))) continue
      if (shouldIgnoreTarget(event.target, b.allowInInput)) continue
      event.preventDefault()
      b.handler?.(event)
      break
    }
  }

  useEventListener(window, 'keydown', onKey)

  onMounted(() => {
    _registry.value = [..._registry.value, ...list]
  })
  onBeforeUnmount(() => {
    const ids = new Set(list.map((b) => b.id))
    _registry.value = _registry.value.filter((b) => !ids.has(b.id))
  })

  return { ids: list.map((b) => b.id) }
}

/**
 * useHotkeyRegistry — read the active shortcuts (for the help overlay). Only
 * bindings with a `description` are surfaced; grouped by `group`.
 */
export function useHotkeyRegistry() {
  const all = computed(() => _registry.value)
  const groups = computed(() => {
    const map = new Map()
    for (const b of _registry.value) {
      if (!b.description) continue
      if (!map.has(b.group)) map.set(b.group, [])
      map.get(b.group).push(b)
    }
    return [...map.entries()].map(([group, items]) => ({ group, items }))
  })
  return { all, groups }
}
