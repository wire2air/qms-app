import { describe, it, expect } from 'vitest'
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
})
