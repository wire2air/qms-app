import { ref } from 'vue'
import BaseQuickFilterPills from './BaseQuickFilterPills.vue'

/**
 * BaseQuickFilterPills — a single-select row of toggle pills for quick filters.
 * Each pill is a real <button aria-pressed> in a role="group" (keyboard + ARIA).
 */
export default {
  title: 'Composition/BaseQuickFilterPills',
  component: BaseQuickFilterPills,
  tags: ['autodocs'],
  args: {
    ariaLabel: 'Nonconformance quick filters',
    pills: [
      { value: 'all_open', label: 'All open' },
      { value: 'mine', label: 'My NCs' },
      { value: 'critical', label: 'Critical' },
      { value: 'overdue', label: 'Overdue', count: 3 },
      { value: 'spam', label: 'Spam', color: 'red' },
    ],
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseQuickFilterPills },
    setup: () => {
      const active = ref('all_open')
      return { args, active }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-3">
        <BaseQuickFilterPills v-bind="args" v-model="active" />
        <p class="tw:text-caption tw:text-secondary">Active: <span class="tw:font-mono">{{ active }}</span></p>
      </div>`,
  }),
}
