import { IconInbox, IconSearch } from '@tabler/icons-vue'
import BaseButton from './BaseButton.vue'
import BaseEmptyState from './BaseEmptyState.vue'

/** Centered empty/zero-state with optional icon, description and action slot. */
export default {
  title: 'Primitives/BaseEmptyState',
  component: BaseEmptyState,
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    dense: { control: 'boolean' },
  },
  args: {
    title: 'No results found',
    description: null,
    dense: false,
  },
}

const render = (args) => ({
  components: { BaseEmptyState },
  setup: () => ({ args, IconSearch }),
  template: `<BaseEmptyState v-bind="args" :icon="IconSearch" />`,
})

export const Default = { render }

export const WithDescription = {
  render: () => ({
    components: { BaseEmptyState },
    setup: () => ({ IconInbox }),
    template: `<BaseEmptyState
      :icon="IconInbox"
      title="No documents yet"
      description="Create your first document to get started."
    />`,
  }),
}

export const Dense = {
  render: () => ({
    components: { BaseEmptyState },
    setup: () => ({ IconSearch }),
    template: `<BaseEmptyState :icon="IconSearch" title="No matches" :dense="true" />`,
  }),
}

export const WithAction = {
  render: () => ({
    components: { BaseEmptyState, BaseButton },
    setup: () => ({ IconInbox }),
    template: `<BaseEmptyState
      :icon="IconInbox"
      title="No documents yet"
      description="Create your first document to get started."
    >
      <template #action>
        <BaseButton variant="primary">New document</BaseButton>
      </template>
    </BaseEmptyState>`,
  }),
}
