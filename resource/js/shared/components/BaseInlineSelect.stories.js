import { ref } from 'vue'
import BaseInlineSelect from './BaseInlineSelect.vue'

/**
 * BaseInlineSelect — the escape-hatch select for non-entity enum lists
 * (`[{ id, name }]`) that don't have their own XSelectMenu triad. Supplies a
 * chip-style default trigger over BaseSelectMenu.
 */
const items = [
  { id: 'OPEN', name: 'Open' },
  { id: 'IN_PROGRESS', name: 'In progress' },
  { id: 'CLOSED', name: 'Closed' },
  { id: 'CANCELLED', name: 'Cancelled' },
]

export default {
  title: 'Forms/BaseInlineSelect',
  component: BaseInlineSelect,
  tags: ['autodocs'],
  argTypes: {
    required: { control: 'boolean' },
    multiple: { control: 'boolean' },
  },
  args: { required: false, multiple: false, placeholder: 'Select status…', nullLabel: 'All' },
}

export const Default = {
  render: (args) => ({
    components: { BaseInlineSelect },
    setup: () => ({ args, items, model: ref('OPEN') }),
    template: `<div class="tw:max-w-xs"><BaseInlineSelect v-bind="args" v-model="model" :items="items" /></div>`,
  }),
}

export const Empty = {
  render: (args) => ({
    components: { BaseInlineSelect },
    setup: () => ({ args, items, model: ref(null) }),
    template: `<div class="tw:max-w-xs"><BaseInlineSelect v-bind="args" v-model="model" :items="items" /></div>`,
  }),
}

export const Multiple = {
  render: () => ({
    components: { BaseInlineSelect },
    setup: () => ({ items, model: ref(['OPEN', 'CLOSED']) }),
    template: `<div class="tw:max-w-sm"><BaseInlineSelect v-model="model" :items="items" multiple placeholder="Select statuses…" /></div>`,
  }),
}
