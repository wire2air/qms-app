import { ref } from 'vue'
import BaseConfirmDialog from './BaseConfirmDialog.vue'

/** Confirm/cancel dialog wrapping BaseDialog (boolean v-model); emits ok / cancel. */
export default {
  title: 'Overlays/BaseConfirmDialog',
  component: BaseConfirmDialog,
  tags: ['autodocs'],
  argTypes: {
    okVariant: {
      control: 'select',
      options: ['primary', 'outline', 'danger', 'ghost'],
    },
    cancel: { control: 'boolean' },
    persistent: { control: 'boolean' },
    title: { control: 'text' },
    message: { control: 'text' },
    okLabel: { control: 'text' },
    cancelLabel: { control: 'text' },
  },
  args: {
    title: 'Confirm action',
    message: 'Are you sure you want to continue?',
    okLabel: 'Confirm',
    cancelLabel: 'Cancel',
    okVariant: 'primary',
    cancel: true,
    persistent: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseConfirmDialog },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = true">Open confirm</button>
        <BaseConfirmDialog v-bind="args" v-model="open" @ok="() => {}" @cancel="() => {}" />
      </div>`,
  }),
}

export const Destructive = {
  args: {
    title: 'Delete item',
    message: 'This will permanently delete the item. This action cannot be undone.',
    okLabel: 'Delete',
    okVariant: 'danger',
  },
  render: Default.render,
}

export const ConfirmOnly = {
  args: {
    title: 'Notice',
    message: 'Your session has been refreshed.',
    cancel: false,
    okLabel: 'Got it',
  },
  render: Default.render,
}
