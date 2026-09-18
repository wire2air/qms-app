import { ref } from 'vue'
import BaseChecklist from './BaseChecklist.vue'

/** Matrix-style checklist: rows × columns, each cell a radio/checkbox/text/etc. Array v-model indexed by row. */
export default {
  title: 'Forms/BaseChecklist',
  component: BaseChecklist,
  tags: ['autodocs'],
  argTypes: {
    dense: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    error: { control: 'boolean' },
  },
  args: {
    label: 'Inspection checklist',
    dense: false,
    disabled: false,
  },
}

// rows: strings or { label, value }. columns: { label, value, inputType }.
const rows = ['Fire exits clear', 'PPE available', 'Signage visible']
const radioColumns = [
  { label: 'Pass', value: 'pass', inputType: 'radio' },
  { label: 'Fail', value: 'fail', inputType: 'radio' },
  { label: 'N/A', value: 'na', inputType: 'radio' },
]

export const RadioMatrix = {
  render: (args) => ({
    components: { BaseChecklist },
    setup() {
      // Uniform radio columns -> flat array, one selected col.value per row.
      const model = ref(['pass', null, 'na'])
      return { args, model, rows, columns: radioColumns }
    },
    template: `<BaseChecklist v-bind="args" :rows="rows" :columns="columns" v-model="model" />`,
  }),
}

export const CheckboxMatrix = {
  args: { label: 'Tasks completed' },
  render: (args) => ({
    components: { BaseChecklist },
    setup() {
      const checkRows = ['Lockout', 'Tagout', 'Verify zero energy']
      const columns = [{ label: 'Done', value: 'done', inputType: 'checkbox' }]
      // Uniform checkbox columns -> flat array of booleans per row.
      const model = ref([true, false, false])
      return { args, model, rows: checkRows, columns }
    },
    template: `<BaseChecklist v-bind="args" :rows="rows" :columns="columns" v-model="model" />`,
  }),
}

export const MixedInputs = {
  args: { label: 'Equipment readings' },
  render: (args) => ({
    components: { BaseChecklist },
    setup() {
      const readingRows = ['Pump A', 'Pump B']
      // Non-uniform inputTypes -> model is an array of objects keyed by col.value.
      const columns = [
        { label: 'OK', value: 'ok', inputType: 'checkbox' },
        { label: 'Pressure', value: 'pressure', inputType: 'number', placeholder: 'psi' },
        { label: 'Notes', value: 'notes', inputType: 'text', placeholder: 'Optional' },
      ]
      const model = ref([
        { ok: true, pressure: '120', notes: 'Nominal' },
        { ok: false, pressure: '', notes: '' },
      ])
      return { args, model, rows: readingRows, columns }
    },
    template: `<BaseChecklist v-bind="args" :rows="rows" :columns="columns" v-model="model" />`,
  }),
}

export const Disabled = {
  args: { label: 'Inspection checklist', disabled: true },
  render: (args) => ({
    components: { BaseChecklist },
    setup() {
      const model = ref(['pass', 'fail', 'na'])
      return { args, model, rows, columns: radioColumns }
    },
    template: `<BaseChecklist v-bind="args" :rows="rows" :columns="columns" v-model="model" />`,
  }),
}
