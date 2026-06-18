import { ref } from 'vue'
import BaseDateRangeInput from './BaseDateRangeInput.vue'

/**
 * BaseDateRangeInput — a preset-driven date-range filter (Today / Yesterday /
 * Last 7 days / … / Custom). The v-model is `{ from, to }` (ISO day strings;
 * empty = all time).
 */
export default {
  title: 'Forms/BaseDateRangeInput',
  component: BaseDateRangeInput,
  tags: ['autodocs'],
  args: { label: '', inline: true },
}

export const Default = {
  render: (args) => ({
    components: { BaseDateRangeInput },
    setup: () => ({ args, model: ref({ from: '', to: '' }) }),
    template: `<div class="tw:max-w-sm"><BaseDateRangeInput v-bind="args" v-model="model" /></div>`,
  }),
}

export const WithLabel = {
  render: () => ({
    components: { BaseDateRangeInput },
    setup: () => ({ model: ref({ from: '', to: '' }) }),
    template: `<div class="tw:max-w-sm"><BaseDateRangeInput v-model="model" label="Created" :inline="false" /></div>`,
  }),
}
