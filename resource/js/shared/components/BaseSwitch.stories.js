import { ref } from 'vue'
import BaseSwitch from './BaseSwitch.vue'

/** Headless UI toggle switch (boolean v-model) with an accessible label. */
export default {
  title: 'Forms/BaseSwitch',
  component: BaseSwitch,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    label: { control: 'text' },
  },
  args: {
    label: 'Enable notifications',
    disabled: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseSwitch },
    setup() {
      const model = ref(false)
      return { args, model }
    },
    template: `<BaseSwitch v-bind="args" v-model="model" />`,
  }),
}

export const On = {
  render: (args) => ({
    components: { BaseSwitch },
    setup() {
      const model = ref(true)
      return { args, model }
    },
    template: `<BaseSwitch v-bind="args" v-model="model" />`,
  }),
}

export const Disabled = {
  args: { disabled: true },
  render: Default.render,
}

export const DisabledOn = {
  args: { disabled: true },
  render: (args) => ({
    components: { BaseSwitch },
    setup() {
      const model = ref(true)
      return { args, model }
    },
    template: `<BaseSwitch v-bind="args" v-model="model" />`,
  }),
}
