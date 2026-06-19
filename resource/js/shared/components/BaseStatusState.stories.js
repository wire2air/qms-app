import BaseStatusState from './BaseStatusState.vue'

/**
 * BaseStatusState — empty / error / success / notfound / denied / offline /
 * maintenance states in one component (variant-driven default icon + title + tint).
 */
export default {
  title: 'Feedback/BaseStatusState',
  component: BaseStatusState,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['empty', 'error', 'success', 'notfound', 'denied', 'offline', 'maintenance'],
    },
    dense: { control: 'boolean' },
  },
  args: { variant: 'empty', description: '', dense: false },
}

const render = (args) => ({
  components: { BaseStatusState },
  setup: () => ({ args }),
  template: `
    <div class="tw:max-w-md tw:rounded-xl tw:border tw:border-divider tw:bg-card">
      <BaseStatusState v-bind="args">
        <template #action><button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm">Action</button></template>
      </BaseStatusState>
    </div>`,
})

export const Empty = { render, args: { description: 'No documents match your filters.' } }
export const Error = { render, args: { variant: 'error', description: "We couldn't load this list." } }
export const Success = { render, args: { variant: 'success', description: 'Everything is up to date.' } }
export const NotFound = { render, args: { variant: 'notfound', description: 'That record no longer exists.' } }
export const PermissionDenied = { render, args: { variant: 'denied', description: 'Ask an administrator for access to this module.' } }
export const Offline = { render, args: { variant: 'offline', description: 'Reconnect to sync the latest changes.' } }
export const Maintenance = { render, args: { variant: 'maintenance', description: "We'll be back shortly." } }
