import { ref } from 'vue'
import BaseFormDialog from './BaseFormDialog.vue'

/** BaseDialog preset for create/edit forms: title + body slot + standardized footer (boolean v-model). */
export default {
  title: 'Overlays/BaseFormDialog',
  component: BaseFormDialog,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', 'full'],
    },
    submitVariant: {
      control: 'select',
      options: ['primary', 'outline', 'danger', 'ghost'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    persistent: { control: 'boolean' },
    title: { control: 'text' },
    submitLabel: { control: 'text' },
    error: { control: 'text' },
  },
  args: {
    title: 'New product',
    size: 'md',
    submitLabel: 'Create',
    cancelLabel: 'Cancel',
    submitVariant: 'primary',
    loading: false,
    disabled: false,
    persistent: false,
    error: '',
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseFormDialog },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = true">Open form dialog</button>
        <BaseFormDialog v-bind="args" v-model="open" @submit="open = false" @cancel="() => {}">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <label class="tw:text-sm tw:text-secondary">Name</label>
            <input class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm" placeholder="Enter a name" />
          </div>
        </BaseFormDialog>
      </div>`,
  }),
}

export const Loading = {
  args: { loading: true, submitLabel: 'Creating…' },
  render: Default.render,
}

export const InvalidWithError = {
  args: { disabled: true, error: 'Name is required.' },
  render: Default.render,
}
