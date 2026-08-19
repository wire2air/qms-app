import { watch, nextTick, onScopeDispose } from 'vue'
import { unrefElement } from '@vueuse/core'
import { useSortable } from '@vueuse/integrations/useSortable'

/**
 * Drag-to-reorder for a plain array whose POSITION is its order — table and
 * checklist rows/columns, dashboard widgets — as opposed to workflow steps or
 * document sections, which carry a stored `order` field that has to be
 * renumbered.
 *
 * Here there is nothing to renumber: moving the element IS the change. Answers
 * are keyed by row index, but a form's schema is snapshotted when a record is
 * submitted, so reordering a template never disturbs answers already captured
 * — only records created afterwards use the new order.
 *
 * Handle-based on purpose: these rows contain text inputs, and a whole-row
 * drag would swallow click-to-place-cursor and text selection.
 *
 * ── KEYBOARD REORDER (F-12) ─────────────────────────────────────────────────
 * A drag handle is a real focusable `<button>` that announces itself as an
 * action. Until 2026-08-19 it did nothing at all for anyone not using a mouse —
 * this wrapper had no keydown handler and no live region, so a keyboard or
 * screen-reader user reached a control that advertised a capability it did not
 * have. WCAG 2.1.1.
 *
 * With the grip focused: **↑ / ↓** move one place, **Home / End** move to the
 * ends. The move is announced on a polite live region, and focus follows the
 * item so a run of presses keeps working.
 *
 * **Keyboard support requires `handle`, deliberately.** Without a grip there is
 * no way to tell "reorder this item" from "move the caret", and the handle-less
 * consumers here wrap text inputs — hijacking ↑/↓ inside them would trade one
 * accessibility defect for a worse one. A consumer that wants keyboard reorder
 * adds a handle.
 *
 * @param {import('vue').Ref<HTMLElement|null>} containerRef
 * @param {() => any[]} getList  returns the live array to mutate in place
 * @param {string|{handle?: string, filter?: string, draggable?: string,
 *                 onEnd?: Function, announce?: Function}} [opts]
 *   handle — grip selector. Required where items contain text inputs, so a
 *   drag doesn't swallow click-to-place-cursor; omit for chips, which are
 *   draggable whole. Also the switch for keyboard support, see above.
 *   filter — selector for elements a drag must NOT start from (a chip's
 *   remove button).
 *   draggable — selector limiting WHICH children are draggable, for a
 *   container holding non-items too (a header row's row-label corner cell).
 *   onEnd — called after a completed reorder, drag or keyboard. This is where
 *   a consumer PERSISTS the new order.
 *   announce — `(item, toIndex, total) => string` for the live region. The
 *   default states the new position; override to name the item.
 *   A bare string is shorthand for `{ handle }`.
 */
export function useListReorder(containerRef, getList, opts = {}) {
  const {
    handle,
    filter,
    draggable,
    onEnd,
    announce = (_item, to, total) => `Moved to position ${to + 1} of ${total}.`,
  } = typeof opts === 'string' ? { handle: opts } : opts

  /** The one place the array is mutated. Returns whether anything moved. */
  function moveItem(from, to) {
    const list = getList()
    if (!Array.isArray(list)) return false
    if (from == null || to == null || from === to) return false
    if (from < 0 || to < 0 || from >= list.length || to >= list.length) return false
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    return true
  }

  useSortable(containerRef, [], {
    ...(handle ? { handle } : {}),
    ...(filter ? { filter, preventOnFilter: false } : {}),
    ...(draggable ? { draggable } : {}),
    animation: 150,
    onUpdate(e) {
      moveItem(e.oldIndex, e.newIndex)
    },
    // ⚠️ FORWARDED, and it was not until 2026-08-19. The options object was
    // built from `handle`/`filter`/`draggable` alone, so a caller's `onEnd`
    // was dropped silently. DashboardDetail.vue is the only consumer that
    // passes one and the only one that PERSISTS — so dragging a widget
    // reordered the DOM, mutated the in-memory array, wrote nothing, and the
    // board reverted on the next reload. Nothing caught it because the reorder
    // spec tested a local copy of the splice rather than this composable.
    ...(onEnd ? { onEnd } : {}),
  })

  // ── keyboard ──────────────────────────────────────────────────────────────

  /**
   * The container ELEMENT.
   *
   * `containerRef` is not always an element ref: DashboardDetail.vue puts it on
   * `<ContentGrid>`, so `.value` is a component instance with no `children` and
   * no `addEventListener`. useSortable resolves this with `unrefElement` and so
   * must anything else that touches the DOM here — reading `.value` directly
   * works for three of the four consumers and breaks silently on the fourth,
   * which is the only one with a keyboard grip.
   */
  function containerEl() {
    return unrefElement(containerRef) ?? null
  }

  /** The reorderable children, filtered the same way SortableJS filters them. */
  function itemsIn(container) {
    const kids = Array.from(container.children)
    return draggable ? kids.filter((el) => el.matches(draggable)) : kids
  }

  let region = null
  function liveRegion() {
    if (region) return region
    region = document.createElement('div')
    region.setAttribute('aria-live', 'polite')
    region.setAttribute('aria-atomic', 'true')
    // Inline rather than a utility class: this node is appended to <body>,
    // outside any component's scoped styles, and a visually-hidden helper that
    // silently stopped applying would make the announcement a visible artefact
    // in the corner of every page.
    region.style.cssText =
      'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
      'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;'
    document.body.appendChild(region)
    return region
  }

  const STEP = { ArrowUp: -1, ArrowDown: 1, Home: 'first', End: 'last' }

  function onKeydown(e) {
    if (!handle) return // see the note above — no grip, no keyboard
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const step = STEP[e.key]
    if (step === undefined) return

    const container = containerEl()
    if (!container) return
    // The grip check subsumes `filter`: a handle is usually a <button>, and
    // several consumers list `button` in `filter`, so applying both would
    // disable the keyboard path on exactly the control that owns it.
    if (!e.target?.closest?.(handle)) return

    const items = itemsIn(container)
    const item = items.find((el) => el.contains(e.target))
    if (!item) return

    const list = getList()
    if (!Array.isArray(list) || list.length < 2) return

    const from = items.indexOf(item)
    const to = step === 'first' ? 0 : step === 'last' ? list.length - 1 : from + step
    if (to < 0 || to >= list.length) return // already at the end; let the key be

    e.preventDefault()
    const moved = list[from]
    if (!moveItem(from, to)) return

    liveRegion().textContent = announce(moved, to, list.length)
    onEnd?.()
    refocus(to)
  }

  /**
   * Keep the grip focused after the list re-renders, so ↑↑↑ keeps moving the
   * same item instead of dropping focus to <body> after the first press.
   */
  async function refocus(index) {
    await nextTick()
    const container = containerEl()
    if (!container) return
    const el = itemsIn(container)[index]?.querySelector(handle)
    if (el && typeof el.focus === 'function') el.focus()
  }

  let detach = null
  watch(
    containerRef,
    () => {
      detach?.()
      detach = null
      const el = containerEl()
      if (!el) return
      el.addEventListener('keydown', onKeydown)
      detach = () => el.removeEventListener('keydown', onKeydown)
    },
    // `post`: this is DOM work, so it must run after the children the handler
    // measures are actually in the tree.
    { immediate: true, flush: 'post' },
  )

  onScopeDispose(() => {
    detach?.()
    region?.remove()
    region = null
  })
}
