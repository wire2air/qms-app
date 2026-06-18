import { ref } from 'vue'
import BaseSignaturePad from './BaseSignaturePad.vue'

/** BaseSignaturePad — draw-to-sign canvas (needs a real DOM; verify here). */
export default {
  title: 'Media/BaseSignaturePad',
  component: BaseSignaturePad,
  tags: ['autodocs'],
  argTypes: { disabled: { control: 'boolean' }, height: { control: 'number' } },
  args: { height: 180, disabled: false },
}

export const Default = {
  render: (args) => ({
    components: { BaseSignaturePad },
    setup: () => ({ args, sig: ref('') }),
    template: `
      <div class="tw:max-w-md tw:flex tw:flex-col tw:gap-2">
        <BaseSignaturePad v-bind="args" v-model="sig" />
        <p class="tw:text-caption tw:text-secondary">{{ sig ? 'Signed ✓ (data URL captured)' : 'Empty' }}</p>
      </div>`,
  }),
}
