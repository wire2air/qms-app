import { useSortable } from '@vueuse/integrations/useSortable'

/**
 * Drag-to-reorder for a plain array whose POSITION is its order — table and
 * checklist rows/columns, as opposed to workflow steps or document sections,
 * which carry a stored `order` field that has to be renumbered.
 *
 * Here there is nothing to renumber: moving the element IS the change. Answers
 * are keyed by row index, but a form's schema is snapshotted when a record is
 * submitted, so reordering a template never disturbs answers already captured
 * — only records created afterwards use the new order.
 *
 * Handle-based on purpose: these rows contain text inputs, and a whole-row
 * drag would swallow click-to-place-cursor and text selection.
 *
 * @param {import('vue').Ref<HTMLElement|null>} containerRef
 * @param {() => any[]} getList  returns the live array to mutate in place
 * @param {{handle?: string, filter?: string, draggable?: string}} [opts]
 *   handle — grip selector. Required where items contain text inputs, so a
 *   drag doesn't swallow click-to-place-cursor; omit for chips, which are
 *   draggable whole.
 *   filter — selector for elements a drag must NOT start from (a chip's
 *   remove button).
 *   draggable — selector limiting WHICH children are draggable, for a
 *   container holding non-items too (a header row's row-label corner cell).
 */
export function useListReorder(containerRef, getList, opts = {}) {
  const { handle, filter, draggable } = typeof opts === 'string' ? { handle: opts } : opts
  useSortable(containerRef, [], {
    ...(handle ? { handle } : {}),
    ...(filter ? { filter, preventOnFilter: false } : {}),
    ...(draggable ? { draggable } : {}),
    animation: 150,
    onUpdate(e) {
      const list = getList()
      if (!Array.isArray(list)) return
      const { oldIndex, newIndex } = e
      if (
        oldIndex == null ||
        newIndex == null ||
        oldIndex === newIndex ||
        oldIndex < 0 ||
        newIndex < 0 ||
        oldIndex >= list.length ||
        newIndex >= list.length
      ) {
        return
      }
      const [moved] = list.splice(oldIndex, 1)
      list.splice(newIndex, 0, moved)
    },
  })
}
