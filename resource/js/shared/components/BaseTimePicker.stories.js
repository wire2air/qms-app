import { ref } from 'vue'
import BaseTimePicker from './BaseTimePicker.vue'

/**
 * BaseTimePicker — an hours/minutes time field. The v-model is `timeInMins`
 * (minutes since midnight), e.g. 540 = 09:00.
 */
export default {
  title: 'Forms/BaseTimePicker',
  component: BaseTimePicker,
  tags: ['autodocs'],
  argTypes: { disabled: { control: 'boolean' } },
  args: { disabled: false },
}

export const Default = {
  render: (args) => ({
    components: { BaseTimePicker },
    setup: () => ({ args, minutes: ref(540) }),
    template: `<div class="tw:max-w-xs"><BaseTimePicker v-bind="args" v-model:timeInMins="minutes" /></div>`,
  }),
}

export const Disabled = {
  render: () => ({
    components: { BaseTimePicker },
    setup: () => ({ minutes: ref(615) }),
    template: `<div class="tw:max-w-xs"><BaseTimePicker v-model:timeInMins="minutes" disabled /></div>`,
  }),
}
