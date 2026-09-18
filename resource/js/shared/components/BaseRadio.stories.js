import { ref } from 'vue'
import BaseRadio from './BaseRadio.vue'

/**
 * BaseRadio — a single radio control (hidden native input + styled dot, with a
 * peer-focus ring). The v-model is the selected value; give every radio in a
 * group the same `name`.
 */
export default {
  title: 'Forms/BaseRadio',
  component: BaseRadio,
  tags: ['autodocs'],
  argTypes: { disabled: { control: 'boolean' } },
  args: { disabled: false },
}

export const Group = {
  render: (args) => ({
    components: { BaseRadio },
    setup: () => ({ args, size: ref('md') }),
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseRadio v-bind="args" v-model="size" value="sm" name="size" label="Small" />
        <BaseRadio v-bind="args" v-model="size" value="md" name="size" label="Medium" />
        <BaseRadio v-bind="args" v-model="size" value="lg" name="size" label="Large" />
        <p class="tw:text-caption tw:text-secondary">Selected: <span class="">{{ size }}</span></p>
      </div>`,
  }),
}

export const Disabled = {
  render: () => ({
    components: { BaseRadio },
    setup: () => ({ size: ref('md') }),
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseRadio v-model="size" value="md" name="d" label="Medium (selected)" disabled />
        <BaseRadio v-model="size" value="lg" name="d" label="Large" disabled />
      </div>`,
  }),
}
