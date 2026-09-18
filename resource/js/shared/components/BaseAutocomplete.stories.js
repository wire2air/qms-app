import { ref } from 'vue'
import BaseAutocomplete from './BaseAutocomplete.vue'
import BaseField from './form/BaseField.vue'

/**
 * BaseAutocomplete — typeahead / async-search combobox. Static `options` or an
 * async `loader(query)`. WAI-ARIA combobox + listbox with ↑/↓/Enter/Esc.
 */
export default {
  title: 'Forms/BaseAutocomplete',
  component: BaseAutocomplete,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    clearable: { control: 'boolean' },
  },
  args: { placeholder: 'Search…', size: 'md', disabled: false, clearable: true },
  decorators: [() => ({ template: '<div class="tw:max-w-md tw:p-4 tw:bg-main tw:min-h-72"><story /></div>' })],
}

const UNITS = [
  { value: 'ea', label: 'Each' },
  { value: 'box', label: 'Box' },
  { value: 'sheet', label: 'Sheet' },
  { value: 'kg', label: 'Kilogram' },
  { value: 'm', label: 'Metre' },
  { value: 'roll', label: 'Roll' },
]

/** Static options — type to filter. */
export const Static = {
  render: (args) => ({
    components: { BaseAutocomplete },
    setup() {
      const value = ref(null)
      return { args, value, UNITS }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseAutocomplete v-bind="args" v-model="value" :options="UNITS" placeholder="Unit of measure…" />
        <p class="tw:text-xs tw:text-secondary">value: {{ value ?? '—' }}</p>
      </div>`,
  }),
}

/** Pre-selected value resolves its label from static options. */
export const Prefilled = {
  render: (args) => ({
    components: { BaseAutocomplete },
    setup() {
      const value = ref('sheet')
      return { args, value, UNITS }
    },
    template: `<BaseAutocomplete v-bind="args" v-model="value" :options="UNITS" />`,
  }),
}

/**
 * Async loader — debounced remote search with loading + empty states. (Mocked
 * with a delay here.)
 */
export const Async = {
  render: (args) => ({
    components: { BaseAutocomplete },
    setup() {
      const value = ref(null)
      const ALL = Array.from({ length: 40 }, (_, i) => ({
        value: `po-${1000 + i}`,
        label: `PO-${1000 + i} — Acme order ${i + 1}`,
      }))
      function loader(q) {
        return new Promise((resolve) => {
          setTimeout(() => {
            const n = q.toLowerCase()
            resolve(ALL.filter((o) => o.label.toLowerCase().includes(n)).slice(0, 8))
          }, 450)
        })
      }
      return { args, value, loader }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseAutocomplete v-bind="args" v-model="value" :loader="loader" placeholder="Search purchase orders…" />
        <p class="tw:text-xs tw:text-secondary">value: {{ value ?? '—' }}</p>
      </div>`,
  }),
}

/** In BaseField — label + hint. */
export const InField = {
  render: () => ({
    components: { BaseAutocomplete, BaseField },
    setup() {
      const value = ref(null)
      return { value, UNITS }
    },
    template: `
      <BaseField label="Unit of measure" hint="Type to search">
        <template #default="field">
          <BaseAutocomplete v-bind="field" v-model="value" :options="UNITS" placeholder="Unit…" />
        </template>
      </BaseField>`,
  }),
}
