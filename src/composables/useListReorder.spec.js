/**
 * `useListReorder` — the shared drag-reorder wrapper, tested THROUGH the
 * composable rather than through a copy of its logic.
 *
 * That distinction is the reason this file exists. `src/__tests__/listReorder.spec.js`
 * opens by saying "Mirrors the splice in useListReorder's onUpdate" and then
 * tests its own local `move()`. Those cases are good ones, but a reimplementation
 * cannot fail when the real composable changes — and the real composable was
 * silently dropping a caller's `onEnd`, which is how a dashboard reorder that
 * never persisted shipped past a green suite.
 *
 * SortableJS is mocked so the options handed to it are inspectable; the array
 * mutation and the keyboard path are exercised for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const captured = { options: null, calls: 0 }
vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: (_el, _list, options) => {
    captured.options = options
    captured.calls += 1
  },
}))

const { useListReorder } = await import('@/composables/useListReorder.js')

/**
 * A container of `n` items, each with a grip button — the shape every real
 * consumer uses. Returns the wrapper plus the live list the composable mutates.
 */
async function mountList(n = 4, opts = { handle: '[data-drag-handle]' }) {
  const list = ref(Array.from({ length: n }, (_, i) => ({ id: `w${i}`, name: `Widget ${i}` })))
  const wrapper = mount({
    setup() {
      const containerRef = ref(null)
      useListReorder(containerRef, () => list.value, opts)
      return { containerRef, list }
    },
    template: `
      <div ref="containerRef">
        <div v-for="item in list" :key="item.id" :data-id="item.id">
          <button data-drag-handle type="button" :aria-label="'Reorder ' + item.name"></button>
        </div>
      </div>`,
    attachTo: document.body,
  })
  // The keydown listener attaches in a post-flush watcher, so it is not live
  // until the DOM settles. Real users cannot press a key inside the same tick
  // as the mount; a test can, and would then be asserting against a composable
  // that had not finished wiring itself up.
  await nextTick()
  return { wrapper, list }
}

const names = (list) => list.value.map((i) => i.name)

beforeEach(() => {
  captured.options = null
  captured.calls = 0
  document.body.innerHTML = ''
})

describe('useListReorder — options handed to SortableJS', () => {
  it('forwards the caller onEnd', () => {
    // THE REGRESSION. The composable destructured only { handle, filter,
    // draggable } and built the Sortable options from those, so a caller's
    // `onEnd` was dropped on the floor. DashboardDetail.vue is the only consumer
    // that passes one, and it is the one that PERSISTS the new order — so
    // dragging a widget reordered the DOM, mutated the in-memory array, and
    // never wrote anything. The board reverted on the next reload.
    const onEnd = vi.fn()
    mount({
      setup() {
        const containerRef = ref(null)
        useListReorder(containerRef, () => [], { handle: '[data-drag-handle]', onEnd })
        return { containerRef }
      },
      template: '<div ref="containerRef"></div>',
    })
    expect(captured.options.onEnd, 'onEnd never reached SortableJS').toBe(onEnd)
  })

  it('still forwards handle / filter / draggable, and filter implies preventOnFilter', () => {
    mount({
      setup() {
        const containerRef = ref(null)
        useListReorder(containerRef, () => [], {
          handle: '.grip',
          filter: 'button',
          draggable: 'tr[data-row]',
        })
        return { containerRef }
      },
      template: '<div ref="containerRef"></div>',
    })
    expect(captured.options).toMatchObject({
      handle: '.grip',
      filter: 'button',
      preventOnFilter: false,
      draggable: 'tr[data-row]',
    })
  })

  it('accepts the string shorthand', () => {
    mount({
      setup() {
        const containerRef = ref(null)
        useListReorder(containerRef, () => [], '.checklist-row-handle')
        return { containerRef }
      },
      template: '<div ref="containerRef"></div>',
    })
    expect(captured.options.handle).toBe('.checklist-row-handle')
  })
})

describe('useListReorder — onUpdate moves the item', () => {
  it('moves down and up, and is a no-op for a bad index', async () => {
    const { list } = await mountList(4)
    captured.options.onUpdate({ oldIndex: 0, newIndex: 2 })
    expect(names(list)).toEqual(['Widget 1', 'Widget 2', 'Widget 0', 'Widget 3'])

    captured.options.onUpdate({ oldIndex: 2, newIndex: 0 })
    expect(names(list)).toEqual(['Widget 0', 'Widget 1', 'Widget 2', 'Widget 3'])

    for (const bad of [
      { oldIndex: 1, newIndex: 1 },
      { oldIndex: -1, newIndex: 2 },
      { oldIndex: 0, newIndex: 99 },
      { oldIndex: null, newIndex: 1 },
    ]) {
      captured.options.onUpdate(bad)
      expect(names(list), `${JSON.stringify(bad)} should be a no-op`).toEqual([
        'Widget 0',
        'Widget 1',
        'Widget 2',
        'Widget 3',
      ])
    }
  })
})

describe('useListReorder — keyboard reorder (F-12)', () => {
  const grips = (wrapper) => wrapper.findAll('[data-drag-handle]')
  const liveRegion = () => document.querySelector('[aria-live="polite"]')

  /**
   * A REAL KeyboardEvent, not `wrapper.trigger('keydown', { key })`.
   * `KeyboardEvent.key` is a read-only getter, so the property assignment
   * test-utils does silently fails and the handler sees `undefined` — the test
   * then passes or fails for a reason that has nothing to do with the code.
   */
  const press = (el, key, mods = {}) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...mods }))

  it('↑ / ↓ move the item, and Home / End take it to the ends', async () => {
    const { wrapper, list } = await mountList(4)

    press(grips(wrapper)[0].element, 'ArrowDown')
    await nextTick()
    expect(names(list)).toEqual(['Widget 1', 'Widget 0', 'Widget 2', 'Widget 3'])

    press(grips(wrapper)[1].element, 'ArrowUp')
    await nextTick()
    expect(names(list)).toEqual(['Widget 0', 'Widget 1', 'Widget 2', 'Widget 3'])

    press(grips(wrapper)[0].element, 'End')
    await nextTick()
    expect(names(list)).toEqual(['Widget 1', 'Widget 2', 'Widget 3', 'Widget 0'])

    press(grips(wrapper)[3].element, 'Home')
    await nextTick()
    expect(names(list)).toEqual(['Widget 0', 'Widget 1', 'Widget 2', 'Widget 3'])
  })

  it('calls onEnd so the new order is PERSISTED, not just shown', async () => {
    // The keyboard path has to reach the same persistence the drag path does,
    // or it would reproduce the very bug the drag path had.
    const onEnd = vi.fn()
    const { wrapper } = await mountList(3, { handle: '[data-drag-handle]', onEnd })
    press(grips(wrapper)[0].element, 'ArrowDown')
    await nextTick()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('announces the move on a polite, visually hidden live region', async () => {
    const { wrapper } = await mountList(3)
    expect(liveRegion(), 'created lazily, not on mount').toBeNull()

    press(grips(wrapper)[0].element, 'ArrowDown')
    await nextTick()

    const region = liveRegion()
    expect(region.textContent).toBe('Moved to position 2 of 3.')
    expect(region.getAttribute('aria-atomic')).toBe('true')
    // Hidden by inline style rather than a utility class — a helper that stopped
    // applying would print this in the corner of every page.
    expect(region.style.position).toBe('absolute')
    expect(region.style.overflow).toBe('hidden')
  })

  it('lets a consumer name the item in the announcement', async () => {
    const { wrapper } = await mountList(3, {
      handle: '[data-drag-handle]',
      announce: (item, to, total) => `${item.name} is now ${to + 1} of ${total}.`,
    })
    press(grips(wrapper)[0].element, 'ArrowDown')
    await nextTick()
    expect(liveRegion().textContent).toBe('Widget 0 is now 2 of 3.')
  })

  it('moves focus to the grip at the new index, so a run of presses keeps working', async () => {
    // ⚠️ Asserted on the CALL, not on `document.activeElement`. Measured: under
    // happy-dom a node mounted with `attachTo: document.body` still reports
    // `isConnected === false`, so `.focus()` never updates `activeElement` and
    // the assertion would read <body> and report a focus bug that does not
    // exist. Spying on the call tests the composable; asserting activeElement
    // would test the DOM implementation.
    const focused = []
    const spy = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function record() {
        focused.push(this)
      })
    try {
      const { wrapper, list } = await mountList(4)

      press(grips(wrapper)[0].element, 'ArrowDown')
      await flushPromises()
      // The grip that now sits at index 1 — i.e. focus FOLLOWED the item rather
      // than staying at index 0, which now holds a different widget.
      expect(focused.at(-1)).toBe(grips(wrapper)[1].element)

      press(grips(wrapper)[1].element, 'ArrowDown')
      await flushPromises()
      expect(names(list)).toEqual(['Widget 1', 'Widget 2', 'Widget 0', 'Widget 3'])
      expect(focused.at(-1)).toBe(grips(wrapper)[2].element)
    } finally {
      spy.mockRestore()
    }
  })

  it('is a no-op at the boundaries', async () => {
    const { wrapper, list } = await mountList(3)
    press(grips(wrapper)[0].element, 'ArrowUp')
    await nextTick()
    expect(names(list)).toEqual(['Widget 0', 'Widget 1', 'Widget 2'])
    press(grips(wrapper)[2].element, 'ArrowDown')
    await nextTick()
    expect(names(list)).toEqual(['Widget 0', 'Widget 1', 'Widget 2'])
  })

  it('ignores modified presses, so browser and OS shortcuts still work', async () => {
    const { wrapper, list } = await mountList(3)
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      press(grips(wrapper)[0].element, 'ArrowDown', { [mod]: true })
    }
    expect(names(list)).toEqual(['Widget 0', 'Widget 1', 'Widget 2'])
  })

  it('works when containerRef is a COMPONENT ref, not an element ref', async () => {
    // DashboardDetail.vue puts the ref on `<ContentGrid>`, so `.value` is a
    // component instance: no `children`, no `addEventListener`. Reading it
    // directly works for the three checklist consumers and breaks on the only
    // one that has a keyboard grip — which is exactly the shape of bug that
    // ships. useSortable resolves it with `unrefElement`; so does this.
    const list = ref([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
    const Grid = {
      name: 'Grid',
      template: '<div class="grid"><slot /></div>',
    }
    const wrapper = mount({
      components: { Grid },
      setup() {
        const containerRef = ref(null)
        useListReorder(containerRef, () => list.value, { handle: '[data-drag-handle]' })
        return { containerRef, list }
      },
      template: `
        <Grid ref="containerRef">
          <div v-for="i in list" :key="i.id"><button data-drag-handle type="button" /></div>
        </Grid>`,
      attachTo: document.body,
    })
    await nextTick()

    press(grips(wrapper)[0].element, 'ArrowDown')
    await nextTick()
    expect(names(list)).toEqual(['B', 'A'])
  })

  it('does nothing without a handle — arrows inside a text input stay the caret', async () => {
    // The documented limitation, pinned so it is a decision rather than a
    // regression. The handle-less consumers wrap text inputs.
    const list = ref([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])
    const wrapper = mount({
      setup() {
        const containerRef = ref(null)
        useListReorder(containerRef, () => list.value, { filter: 'button' })
        return { containerRef, list }
      },
      template: `<div ref="containerRef">
          <div v-for="i in list" :key="i.id"><input :value="i.name" /></div>
        </div>`,
      attachTo: document.body,
    })
    press(wrapper.findAll('input')[0].element, 'ArrowDown')
    await nextTick()
    expect(names(list)).toEqual(['A', 'B'])
  })
})
