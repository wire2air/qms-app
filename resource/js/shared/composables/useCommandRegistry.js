import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

/**
 * useCommandRegistry — the command palette's action source (Enterprise Page
 * Framework C4). Feature code contributes commands; the palette merges them with
 * route-derived navigation entries. Mirrors the useHotkeys registry pattern.
 *
 *   useCommands([
 *     { id: 'nc.create', title: 'Create nonconformance', group: 'Actions',
 *       icon: IconAlertCircle, keywords: ['raise','new'], perform: () => openCreate() },
 *   ])
 *
 * Command shape: `{ id, title, group?, icon?, keywords?, perform?(), to? }`.
 * `to` (a route path) makes it a navigation command; otherwise `perform` runs.
 */
const _commands = ref([])
let _uid = 0

/** Imperatively register commands; returns an unregister fn. */
export function registerCommands(list) {
  const items = (Array.isArray(list) ? list : [list]).map((c) => ({
    id: c.id ?? `cmd-${++_uid}`,
    group: 'Actions',
    ...c,
  }))
  _commands.value = [..._commands.value, ...items]
  const ids = new Set(items.map((i) => i.id))
  return function unregister() {
    _commands.value = _commands.value.filter((c) => !ids.has(c.id))
  }
}

/** Register commands for the lifetime of the calling component. */
export function useCommands(list) {
  let unregister = null
  onMounted(() => {
    unregister = registerCommands(list)
  })
  onBeforeUnmount(() => unregister && unregister())
}

/** Read the live command list (for the palette). */
export function useCommandRegistry() {
  return { commands: computed(() => _commands.value), registerCommands }
}
