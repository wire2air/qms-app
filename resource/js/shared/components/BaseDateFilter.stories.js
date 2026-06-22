import { ref } from 'vue'
import BaseDateFilter from './BaseDateFilter.vue'

/**
 * BaseDateFilter — operator-driven date filter (before/after/between/relative…).
 */
export default {
  title: 'Forms/Date/BaseDateFilter',
  component: BaseDateFilter,
  tags: ['autodocs'],
}

const story = (model) => ({
  render: () => ({
    components: { BaseDateFilter },
    setup: () => ({ token: ref(model), out: ref(model) }),
    template: `<div class="tw:max-w-xs tw:rounded-xl tw:border tw:border-divider tw:bg-card">
      <BaseDateFilter v-model="token" @update:modelValue="out = $event" />
      <pre class="tw:p-2 tw:text-micro tw:text-secondary">{{ token }}</pre>
    </div>`,
  }),
})

export const RelativeLast7Days = story({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } })
export const Before = story({ operator: 'before', value: null })
export const Between = story({ operator: 'between', value: null, value2: null })
export const IsEmpty = story({ operator: 'empty' })
export const ThisMonth = story({ operator: 'relative', relative: { dir: 'this', unit: 'month', count: 1 } })
