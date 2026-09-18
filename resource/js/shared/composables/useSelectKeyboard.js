import { watch } from 'vue'

/**
 * Listbox keyboard navigation for BaseSelect, operating over a flat array of
 * display rows. Each row exposes `focusable` (group headers and disabled
 * options are not focusable); navigation skips non-focusable rows so arrow keys
 * land only on selectable options.
 *
 * Drives `activeIndex` (the absolute index into `rows`), which the component
 * maps to `aria-activedescendant`.
 *
 * @param {object} cfg
 * @param {import('vue').Ref} cfg.rows          ref<Array<{ focusable: boolean }>>
 * @param {import('vue').Ref} cfg.activeIndex   ref<number>
 * @param {(row: object) => void} cfg.onSelect  invoked on Enter
 * @param {() => void} cfg.onClose              invoked on Escape
 * @param {() => void} [cfg.onBackspace]        invoked on Backspace with empty query
 */
export function useSelectKeyboard(cfg) {
  const { rows, activeIndex } = cfg

  function isFocusable(i) {
    return !!rows.value[i]?.focusable
  }

  function firstFocusable() {
    const list = rows.value
    for (let i = 0; i < list.length; i++) if (list[i].focusable) return i
    return -1
  }
  function lastFocusable() {
    const list = rows.value
    for (let i = list.length - 1; i >= 0; i--) if (list[i].focusable) return i
    return -1
  }
  function nextFocusable(from) {
    const list = rows.value
    for (let i = from + 1; i < list.length; i++) if (list[i].focusable) return i
    return from >= 0 && isFocusable(from) ? from : firstFocusable()
  }
  function prevFocusable(from) {
    const list = rows.value
    for (let i = from - 1; i >= 0; i--) if (list[i].focusable) return i
    return from >= 0 && isFocusable(from) ? from : lastFocusable()
  }

  // Whenever the visible rows change, snap the active row to the first option.
  watch(
    rows,
    () => {
      if (!isFocusable(activeIndex.value)) activeIndex.value = firstFocusable()
    },
    { flush: 'post' },
  )

  function onKeydown(event) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        activeIndex.value = nextFocusable(activeIndex.value)
        break
      case 'ArrowUp':
        event.preventDefault()
        activeIndex.value = prevFocusable(activeIndex.value)
        break
      case 'Home':
        event.preventDefault()
        activeIndex.value = firstFocusable()
        break
      case 'End':
        event.preventDefault()
        activeIndex.value = lastFocusable()
        break
      case 'Enter': {
        event.preventDefault()
        const row = rows.value[activeIndex.value]
        if (row?.focusable) cfg.onSelect(row)
        break
      }
      case 'Escape':
        event.preventDefault()
        cfg.onClose()
        break
      case 'Backspace':
        if (cfg.onBackspace && !event.target.value) cfg.onBackspace()
        break
    }
  }

  return { onKeydown, firstFocusable }
}
