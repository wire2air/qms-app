import BaseDetailField from './BaseDetailField.vue'

/**
 * BaseDetailField — a read-only "label over (or beside) value" pair for detail
 * views. NOT a <label> (no associated control); the em-dash is the empty fallback.
 */
export default {
  title: 'Composition/BaseDetailField',
  component: BaseDetailField,
  tags: ['autodocs'],
  argTypes: { layout: { control: 'inline-radio', options: ['stacked', 'inline'] } },
  args: { label: 'Supplier code', value: 'SUP-001', layout: 'stacked', empty: '—' },
}

export const Stacked = {
  render: (args) => ({
    components: { BaseDetailField },
    setup: () => ({ args }),
    template: `<div class="tw:max-w-xs"><BaseDetailField v-bind="args" /></div>`,
  }),
}

export const Inline = { ...Stacked, args: { layout: 'inline' } }
export const Empty = { ...Stacked, args: { value: null } }
export const WithSlot = {
  render: (args) => ({
    components: { BaseDetailField },
    setup: () => ({ args }),
    template: `
      <div class="tw:max-w-xs">
        <BaseDetailField v-bind="args" label="Status">
          <span class="tw:rounded-full tw:bg-success-100 tw:text-success-700 tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium">Active</span>
        </BaseDetailField>
      </div>`,
  }),
}
