import { ref } from 'vue'
import BaseDialog from './BaseDialog.vue'

/** Modal dialog (headless-ui) toggled by a boolean v-model; supports title, size and persistent. */
export default {
  title: 'Overlays/BaseDialog',
  component: BaseDialog,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', 'full'],
    },
    persistent: { control: 'boolean' },
    title: { control: 'text' },
  },
  args: {
    title: 'Example dialog',
    size: 'md',
    persistent: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseDialog },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = true">Open dialog</button>
        <BaseDialog v-bind="args" v-model="open">
          <p class="tw:text-sm tw:text-secondary">Dialog body content goes here. Click the backdrop or the X to close.</p>
        </BaseDialog>
      </div>`,
  }),
}

export const WithFooter = {
  render: (args) => ({
    components: { BaseDialog },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = true">Open dialog with footer</button>
        <BaseDialog v-bind="args" v-model="open" title="Dialog with footer">
          <p class="tw:text-sm tw:text-secondary">This dialog uses the footer slot for actions.</p>
          <template #footer="{ close }">
            <button class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm" @click="close">Cancel</button>
            <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="close">Save</button>
          </template>
        </BaseDialog>
      </div>`,
  }),
}

export const Persistent = {
  args: { persistent: true, title: 'Persistent dialog' },
  render: (args) => ({
    components: { BaseDialog },
    setup() {
      const open = ref(false)
      return { args, open }
    },
    template: `
      <div>
        <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = true">Open persistent dialog</button>
        <BaseDialog v-bind="args" v-model="open">
          <p class="tw:text-sm tw:text-secondary">Backdrop clicks and the X are disabled. Close it from a footer button.</p>
          <template #footer>
            <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm" @click="open = false">Close</button>
          </template>
        </BaseDialog>
      </div>`,
  }),
}

export const Large = {
  args: { size: '4xl', title: 'Large dialog' },
  render: Default.render,
}
