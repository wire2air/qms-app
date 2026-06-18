import { IconDeviceFloppy } from '@tabler/icons-vue'
import BaseDialogFooter from './BaseDialogFooter.vue'

/** Standardized Cancel + Submit action row for dialogs, with loading / disabled / error states. */
export default {
  title: 'Overlays/BaseDialogFooter',
  component: BaseDialogFooter,
  tags: ['autodocs'],
  argTypes: {
    submitVariant: {
      control: 'select',
      options: ['primary', 'outline', 'danger', 'ghost'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    hideCancel: { control: 'boolean' },
    cancelLabel: { control: 'text' },
    submitLabel: { control: 'text' },
    error: { control: 'text' },
  },
  args: {
    cancelLabel: 'Cancel',
    submitLabel: 'Save',
    submitVariant: 'primary',
    loading: false,
    disabled: false,
    hideCancel: false,
    error: '',
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseDialogFooter },
    setup() {
      return { args }
    },
    template: `
      <div class="tw:w-96 tw:rounded-xl tw:border tw:border-divider tw:p-4">
        <BaseDialogFooter v-bind="args" @cancel="() => {}" @submit="() => {}" />
      </div>`,
  }),
}

export const Loading = {
  args: { loading: true, submitLabel: 'Saving…' },
  render: Default.render,
}

export const Disabled = {
  args: { disabled: true, submitTitle: 'Fix the form before saving' },
  render: Default.render,
}

export const WithError = {
  args: { error: 'Something went wrong while saving.' },
  render: Default.render,
}

export const WithSubmitIcon = {
  render: (args) => ({
    components: { BaseDialogFooter },
    setup() {
      return { args, IconDeviceFloppy }
    },
    template: `
      <div class="tw:w-96 tw:rounded-xl tw:border tw:border-divider tw:p-4">
        <BaseDialogFooter v-bind="args" @cancel="() => {}" @submit="() => {}">
          <template #submitIcon><IconDeviceFloppy :size="16" /></template>
        </BaseDialogFooter>
      </div>`,
  }),
}
