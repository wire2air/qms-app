import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableExportDialog from './TableExportDialog.vue'

// BaseDialog teleports + is headlessui-gated, so stub it (render default + footer
// slots inline). BaseButton is stubbed to a plain <button> so we can click it.
const BaseDialog = {
  name: 'BaseDialog',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<div><slot /><slot name="footer" :close="() => $emit('update:modelValue', false)" /></div>`,
}
const BaseButton = {
  name: 'BaseButton',
  props: ['disabled'],
  template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>`,
}

const fields = [
  { key: 'a', label: 'Alpha', group: 'system' },
  { key: 'b', label: 'Beta', group: 'system', defaultSelected: false },
  { key: 'custom:x', label: 'Custom: x', group: 'custom' },
]

function mountOpen(props = {}) {
  return mount(TableExportDialog, {
    props: { fields, formats: ['csv', 'xlsx'], viewCount: 5, allCount: 9, ...props },
    global: { stubs: { BaseDialog, BaseButton } },
  })
}

async function open(w) {
  await w.setProps({ modelValue: true })
}
function labelCheckbox(w, text) {
  const lbl = w.findAll('label').find((l) => l.text().includes(text))
  return lbl.find('input[type="checkbox"]')
}
function exportBtn(w) {
  return w.findAll('button').find((b) => b.text().includes('Export'))
}

describe('TableExportDialog', () => {
  it('seeds the selection from each field’s defaultSelected when opened', async () => {
    const w = mountOpen()
    await open(w)
    await exportBtn(w).trigger('click')
    const payload = w.emitted('confirm')[0][0]
    // Beta has defaultSelected:false; the rest default in.
    expect(payload.fieldKeys.sort()).toEqual(['a', 'custom:x'])
  })

  it('toggles an individual field and includes it on confirm', async () => {
    const w = mountOpen()
    await open(w)
    await labelCheckbox(w, 'Beta').setValue(true)
    await exportBtn(w).trigger('click')
    expect(w.emitted('confirm')[0][0].fieldKeys.sort()).toEqual(['a', 'b', 'custom:x'])
  })

  it('group select-all toggles every field in that group (custom-fields toggle)', async () => {
    const w = mountOpen()
    await open(w)
    // Deselect the whole custom group via its header checkbox.
    await labelCheckbox(w, 'Custom fields').setValue(false)
    await exportBtn(w).trigger('click')
    expect(w.emitted('confirm')[0][0].fieldKeys).toEqual(['a'])
  })

  it('carries the chosen format and row scope', async () => {
    const w = mountOpen()
    await open(w)
    await w.findAll('button').find((b) => b.text() === 'Excel').trigger('click')
    await w.find('input[type="radio"][value="all"]').setValue()
    await exportBtn(w).trigger('click')
    const payload = w.emitted('confirm')[0][0]
    expect(payload.format).toBe('xlsx')
    expect(payload.scope).toBe('all')
  })

  it('disables Export and emits nothing when no columns are selected', async () => {
    const w = mountOpen()
    await open(w)
    // Deselect the two initially-selected fields (Alpha + Custom: x).
    await labelCheckbox(w, 'Alpha').setValue(false)
    await labelCheckbox(w, 'Custom: x').setValue(false)
    expect(exportBtn(w).attributes('disabled')).toBeDefined()
    await exportBtn(w).trigger('click')
    expect(w.emitted('confirm')).toBeUndefined()
  })

  it('hides the format toggle when only one format is offered', async () => {
    const w = mountOpen({ formats: ['csv'] })
    await open(w)
    expect(w.findAll('button').some((b) => b.text() === 'Excel')).toBe(false)
  })
})
