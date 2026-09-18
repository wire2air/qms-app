/**
 * `useListReorder` — does Sortable actually get ATTACHED?
 *
 * ── WHY THIS IS A SECOND FILE, AND WHY IT MOCKS NOTHING ─────────────────────
 * `useListReorder.spec.js` mocks `@vueuse/integrations/useSortable` so it can
 * inspect the options handed to it. That is the right call for testing options —
 * and it is exactly why it could never catch the bug this file exists for,
 * because the thing that was broken was the code that mock replaced.
 *
 * useSortable's `watchElement` defaults to FALSE. In that mode it binds through
 * `tryOnMounted`: once, at mount, to whatever the ref holds at that instant.
 * Every consumer of this composable renders its list behind a `v-else` that
 * loses to an empty state while the rows are still arriving — DashboardDetail's
 * widgets start as `initial: []`, so "No widgets yet" is what mounts and
 * `<ContentGrid ref="gridRef">` enters the DOM a beat later. Sortable was handed
 * null, `initSortable` returned immediately, and none was ever constructed.
 *
 * The failure was silent AND partial, which is how it shipped past a green
 * suite: the grip still rendered (it is only a button) and the keyboard path
 * still worked (that listener attaches from a post-flush watcher — the very
 * pattern useSortable skips by default). Only mouse drag was dead.
 *
 * So this file stubs NOTHING. It mounts the real composable over the real
 * SortableJS and asks the one question a mock cannot answer: is there a
 * Sortable on the element? `Sortable.get(el)` returns the instance SortableJS
 * stored on the node itself, so a binding that never happened cannot fake one.
 */
import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import Sortable from 'sortablejs'
import { useListReorder } from '@/composables/useListReorder.js'

/**
 * Mounts a list whose container appears LATER — the real sequence in every
 * consumer, and the one the old binding could not survive.
 */
function mountDeferred() {
  const show = ref(false)
  const list = ref([{ id: 'w0' }, { id: 'w1' }, { id: 'w2' }])
  const wrapper = mount({
    setup() {
      const containerRef = ref(null)
      useListReorder(containerRef, () => list.value, { handle: '[data-drag-handle]' })
      return { containerRef, list, show }
    },
    template: `
      <div>
        <p v-if="!show">No widgets yet</p>
        <div v-else ref="containerRef" data-grid>
          <div v-for="item in list" :key="item.id" :data-id="item.id">
            <button data-drag-handle type="button"></button>
          </div>
        </div>
      </div>`,
    attachTo: document.body,
  })
  return { wrapper, show }
}

const gridOf = (wrapper) => wrapper.element.querySelector('[data-grid]')

describe('useListReorder — Sortable attachment', () => {
  it('attaches to a container that only appears after the rows arrive', async () => {
    const { wrapper, show } = mountDeferred()

    // Nothing to bind to yet. This is the state every consumer mounts in, and
    // the whole reason the default binding was wrong for this codebase.
    expect(gridOf(wrapper)).toBeNull()

    show.value = true
    await nextTick()
    // useSortable's element watcher is flush:'post', so the element is resolved
    // on the tick after the DOM updates.
    await nextTick()

    const grid = gridOf(wrapper)
    expect(grid).toBeTruthy()
    expect(Sortable.get(grid)).toBeTruthy()
    // Bound to the container itself, so the rows are its draggable children.
    expect(grid.querySelectorAll('[data-id]')).toHaveLength(3)

    wrapper.unmount()
  })

  it('binds when the container is present at mount', async () => {
    const list = ref([{ id: 'a' }, { id: 'b' }])
    const wrapper = mount({
      setup() {
        const containerRef = ref(null)
        useListReorder(containerRef, () => list.value, { handle: '[data-drag-handle]' })
        return { containerRef, list }
      },
      template: `
        <div ref="containerRef" data-grid>
          <div v-for="item in list" :key="item.id" :data-id="item.id">
            <button data-drag-handle type="button"></button>
          </div>
        </div>`,
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()

    expect(Sortable.get(gridOf(wrapper) ?? wrapper.element)).toBeTruthy()
    wrapper.unmount()
  })

  it('drags by the grip only, so a tile stays clickable', async () => {
    const { wrapper, show } = mountDeferred()
    show.value = true
    await nextTick()
    await nextTick()

    const sortable = Sortable.get(gridOf(wrapper))
    expect(sortable.option('handle')).toBe('[data-drag-handle]')

    wrapper.unmount()
  })
})
