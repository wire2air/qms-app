import BaseToast from './BaseToast.vue'

/** A single toast notification (positive / negative / warning / info) rendered with static props. */
export default {
  title: 'Overlays/BaseToast',
  component: BaseToast,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['positive', 'negative', 'warning', 'info'],
    },
    message: { control: 'text' },
    caption: { control: 'text' },
    multiLine: { control: 'boolean' },
  },
  args: {
    id: 1,
    type: 'positive',
    message: 'Saved',
    caption: '',
    multiLine: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseToast },
    setup() {
      return { args }
    },
    template: `<BaseToast v-bind="args" @dismiss="() => {}" />`,
  }),
}

export const Success = {
  args: { type: 'positive', message: 'Changes saved', caption: 'Your edits are live.' },
  render: Default.render,
}

export const Error = {
  args: { id: 2, type: 'negative', message: 'Save failed', caption: 'Please try again.' },
  render: Default.render,
}

export const Warning = {
  args: { id: 3, type: 'warning', message: 'Unsaved changes' },
  render: Default.render,
}

export const Info = {
  args: { id: 4, type: 'info', message: 'Sync in progress', caption: 'This may take a moment.' },
  render: Default.render,
}
