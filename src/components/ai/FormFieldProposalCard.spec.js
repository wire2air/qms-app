import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormFieldProposalCard from './FormFieldProposalCard.vue'

const CARD = {
  kind: 'tool_call',
  toolName: 'propose_form_fields',
  toolUseId: 'tu_1',
  status: 'done',
  isError: false,
  args: {
    title: 'Caliper PM Log',
    description: 'Preventive maintenance record',
    fields: [
      { type: 'datetime', label: 'Performed at', required: true },
      { type: 'number', label: 'Reading (mm)', min: 0, max: 300, section: 'Checks' },
    ],
  },
  result: { status: 'proposed', fieldCount: 2 },
}

describe('FormFieldProposalCard', () => {
  it('renders the proposal with an Apply button when the host can apply', async () => {
    const w = mount(FormFieldProposalCard, { props: { card: CARD, canApply: true } })
    expect(w.text()).toContain('Caliper PM Log')
    expect(w.text()).toContain('2 fields')
    expect(w.text()).toContain('Performed at')
    const applyBtn = w.findAll('button').find((b) => b.text().includes('Apply'))
    expect(applyBtn).toBeTruthy()
    await applyBtn.trigger('click')
    expect(w.emitted('apply')).toBeTruthy()
    expect(w.emitted('apply')[0][0].fields).toHaveLength(2)
  })

  it('read-only outside a builder host; Applied state replaces the button', () => {
    const readOnly = mount(FormFieldProposalCard, { props: { card: CARD, canApply: false } })
    expect(readOnly.text()).toContain('Open this chat from the form builder to apply')
    expect(readOnly.findAll('button').some((b) => b.text().includes('Apply'))).toBe(false)

    const applied = mount(FormFieldProposalCard, {
      props: { card: CARD, canApply: true, applied: true },
    })
    expect(applied.text()).toContain('Applied')
    expect(applied.findAll('button').some((b) => b.text().includes('Apply'))).toBe(false)
  })

  it('a validation-errored call shows the error and no Apply', () => {
    const w = mount(FormFieldProposalCard, {
      props: {
        card: { ...CARD, isError: true, args: null, result: { message: 'invalid field type' } },
        canApply: true,
      },
    })
    expect(w.text()).toContain('invalid field type')
    expect(w.findAll('button').some((b) => b.text().includes('Apply'))).toBe(false)
  })
})
