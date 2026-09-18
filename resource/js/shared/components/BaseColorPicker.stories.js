import { ref } from 'vue'
import BaseColorPicker from './BaseColorPicker.vue'

/** Native color input bound via v-model. Default value is #2563eb. */
export default {
  title: 'Primitives/BaseColorPicker',
  component: BaseColorPicker,
  tags: ['autodocs'],
  args: {},
}

export const Default = {
  render: () => ({
    components: { BaseColorPicker },
    setup() {
      const color = ref('#2563eb')
      return { color }
    },
    template: `<div class="tw:flex tw:items-center tw:gap-3">
      <BaseColorPicker v-model="color" />
      <span class="tw:text-sm tw:text-on-main">{{ color }}</span>
    </div>`,
  }),
}

export const PresetGreen = {
  render: () => ({
    components: { BaseColorPicker },
    setup() {
      const color = ref('#16a34a')
      return { color }
    },
    template: `<div class="tw:flex tw:items-center tw:gap-3">
      <BaseColorPicker v-model="color" />
      <span class="tw:text-sm tw:text-on-main">{{ color }}</span>
    </div>`,
  }),
}

export const Multiple = {
  render: () => ({
    components: { BaseColorPicker },
    setup() {
      const a = ref('#ef4444')
      const b = ref('#f59e0b')
      const c = ref('#6366f1')
      return { a, b, c }
    },
    template: `<div class="tw:flex tw:gap-3">
      <BaseColorPicker v-model="a" />
      <BaseColorPicker v-model="b" />
      <BaseColorPicker v-model="c" />
    </div>`,
  }),
}
