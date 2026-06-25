import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import BaseTabs from './BaseTabs.vue'
import BaseTabPanel from './BaseTabPanel.vue'

const tabs = [
  { value: 'details', label: 'Details' },
  { value: 'contacts', label: 'Contacts' },
  { value: 'archived', label: 'Archived', disabled: true },
  { value: 'history', label: 'History' },
]

const Harness = {
  components: { BaseTabs, BaseTabPanel },
  data: () => ({ active: null, tabs }),
  template: `
    <BaseTabs v-model="active" :tabs="tabs" ariaLabel="Test">
      <BaseTabPanel value="details">Details panel</BaseTabPanel>
      <BaseTabPanel value="contacts">Contacts panel</BaseTabPanel>
      <BaseTabPanel value="history">History panel</BaseTabPanel>
    </BaseTabs>
  `,
}

function mountTabs() {
  return mount(Harness, { attachTo: document.body })
}

describe('BaseTabs', () => {
  it('renders a labelled tablist with a tab per item', () => {
    const w = mountTabs()
    const list = w.find('[role="tablist"]')
    expect(list.exists()).toBe(true)
    expect(list.attributes('aria-label')).toBe('Test')
    expect(w.findAll('[role="tab"]')).toHaveLength(4)
  })

  it('auto-selects the first tab and shows only its panel', async () => {
    const w = mountTabs()
    await nextTick()
    expect(w.vm.active).toBe('details')
    const selected = w.findAll('[role="tab"]').filter((t) => t.attributes('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].text()).toContain('Details')
    expect(w.text()).toContain('Details panel')
    expect(w.text()).not.toContain('Contacts panel')
  })

  it('selecting a tab swaps aria-selected and the visible panel', async () => {
    const w = mountTabs()
    await nextTick()
    await w.findAll('[role="tab"]')[1].trigger('click')
    expect(w.vm.active).toBe('contacts')
    expect(w.text()).toContain('Contacts panel')
    expect(w.text()).not.toContain('Details panel')
  })

  it('applies roving tabindex (active=0, others=-1)', async () => {
    const w = mountTabs()
    await nextTick()
    const t = w.findAll('[role="tab"]')
    expect(t[0].attributes('tabindex')).toBe('0')
    expect(t[1].attributes('tabindex')).toBe('-1')
  })

  it('wires the panel to its tab via id/aria-controls/aria-labelledby', async () => {
    const w = mountTabs()
    await nextTick()
    const tab = w.findAll('[role="tab"]')[0]
    const panel = w.find('[role="tabpanel"]')
    expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'))
    expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'))
  })

  it('ArrowRight moves to the next tab and skips disabled ones', async () => {
    const w = mountTabs()
    await nextTick()
    const list = w.find('[role="tablist"]')
    await list.trigger('keydown', { key: 'ArrowRight' }) // details -> contacts
    expect(w.vm.active).toBe('contacts')
    await list.trigger('keydown', { key: 'ArrowRight' }) // contacts -> (skip archived) history
    expect(w.vm.active).toBe('history')
  })

  it('ArrowLeft wraps around to the last enabled tab', async () => {
    const w = mountTabs()
    await nextTick()
    const list = w.find('[role="tablist"]')
    await list.trigger('keydown', { key: 'ArrowLeft' }) // details -> wrap -> history
    expect(w.vm.active).toBe('history')
  })

  it('Home/End jump to the first/last enabled tab', async () => {
    const w = mountTabs()
    await nextTick()
    const list = w.find('[role="tablist"]')
    await list.trigger('keydown', { key: 'End' })
    expect(w.vm.active).toBe('history')
    await list.trigger('keydown', { key: 'Home' })
    expect(w.vm.active).toBe('details')
  })

  it('marks the disabled tab disabled', () => {
    const w = mountTabs()
    const disabled = w.findAll('[role="tab"]')[2]
    expect(disabled.attributes('disabled')).toBeDefined()
  })

  it('renders a per-tab badge (incl. 0) and an attention indicator dot', async () => {
    const Badged = {
      components: { BaseTabs },
      data: () => ({
        active: 'a',
        tabs: [
          { value: 'a', label: 'A', badge: 0 },
          { value: 'b', label: 'B', badge: 5, indicator: true },
        ],
      }),
      template: `<BaseTabs v-model="active" :tabs="tabs" ariaLabel="x" />`,
    }
    const w = mount(Badged)
    await nextTick()
    const tabs = w.findAll('[role="tab"]')
    expect(tabs[0].text()).toContain('0') // badge 0 must render, not be dropped
    expect(tabs[1].text()).toContain('5')
    // the indicator dot is an aria-hidden span
    expect(tabs[1].find('span[aria-hidden="true"]').exists()).toBe(true)
  })
})

describe('BaseTabs — overflow navigation', () => {
  // jsdom reports 0 for layout, so stub the scroller dimensions to simulate
  // (no) overflow, and stub the scroll methods jsdom doesn't implement.
  let scrollWidth = 0
  let clientWidth = 0
  const descriptors = {}

  beforeEach(() => {
    for (const prop of ['scrollWidth', 'clientWidth']) {
      descriptors[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)
    }
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return scrollWidth
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return clientWidth
      },
    })
    HTMLElement.prototype.scrollBy = vi.fn()
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    for (const prop of ['scrollWidth', 'clientWidth']) {
      if (descriptors[prop]) Object.defineProperty(HTMLElement.prototype, prop, descriptors[prop])
      else delete HTMLElement.prototype[prop]
    }
    scrollWidth = 0
    clientWidth = 0
    vi.restoreAllMocks()
  })

  const manyTabs = Array.from({ length: 30 }, (_, i) => ({
    value: `t${i}`,
    label: `Tab ${i}`,
  }))

  function mountOverflow() {
    return mount(BaseTabs, {
      props: { tabs: manyTabs, modelValue: 't0', ariaLabel: 'Many' },
      attachTo: document.body,
    })
  }

  it('hides both nav chevrons when content fits (no overflow)', async () => {
    scrollWidth = 200
    clientWidth = 400 // content narrower than viewport → no overflow
    const w = mountOverflow()
    await nextTick()
    const chevrons = w.findAll('button[aria-hidden="true"]')
    expect(chevrons).toHaveLength(2)
    chevrons.forEach((c) => expect(c.classes()).toContain('tw:opacity-0'))
  })

  it('shows the next chevron when content overflows', async () => {
    scrollWidth = 2000
    clientWidth = 400 // content wider than viewport → overflow
    const w = mountOverflow()
    await nextTick()
    await nextTick()
    const [prev, next] = w.findAll('button[aria-hidden="true"]')
    // At the start: nothing to the left, content to the right.
    expect(prev.classes()).toContain('tw:opacity-0')
    expect(next.classes()).toContain('tw:opacity-100')
  })

  it('chevron click scrolls the row smoothly instead of jumping', async () => {
    scrollWidth = 2000
    clientWidth = 400
    const w = mountOverflow()
    await nextTick()
    await nextTick()
    const next = w.findAll('button[aria-hidden="true"]')[1]
    await next.trigger('click')
    expect(HTMLElement.prototype.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )
    const { left } = HTMLElement.prototype.scrollBy.mock.calls[0][0]
    expect(left).toBeGreaterThan(0) // scrolls toward the end
  })

  it('nav chevrons are out of the tab order and hidden from AT', async () => {
    scrollWidth = 2000
    clientWidth = 400
    const w = mountOverflow()
    await nextTick()
    const chevrons = w.findAll('button[aria-hidden="true"]')
    chevrons.forEach((c) => {
      expect(c.attributes('tabindex')).toBe('-1')
      expect(c.attributes('aria-hidden')).toBe('true')
    })
  })

  it('scrolls the active tab into view on selection', async () => {
    scrollWidth = 2000
    clientWidth = 400
    const w = mountOverflow()
    await nextTick()
    HTMLElement.prototype.scrollIntoView.mockClear()
    await w.findAll('[role="tab"]')[12].trigger('click')
    await nextTick()
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('omits fades and buttons when scrollable is false', async () => {
    scrollWidth = 2000
    clientWidth = 400
    const w = mount(BaseTabs, {
      props: {
        tabs: manyTabs,
        modelValue: 't0',
        ariaLabel: 'Many',
        navButtons: false,
        fade: false,
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(w.findAll('button[aria-hidden="true"]')).toHaveLength(0)
    expect(w.find('.base-tabs__fade').exists()).toBe(false)
  })
})
