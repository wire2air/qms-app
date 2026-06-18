import { ref } from 'vue'
import BaseImageCropper from './BaseImageCropper.vue'

/** BaseImageCropper — crop/zoom before upload (needs a real DOM; verify here). */
export default {
  title: 'Media/BaseImageCropper',
  component: BaseImageCropper,
  tags: ['autodocs'],
  args: { src: 'https://picsum.photos/seed/qms/800/500', aspectRatio: null, height: 320 },
}

export const Freeform = {
  render: (args) => ({
    components: { BaseImageCropper },
    setup: () => ({ args, cropped: ref('') }),
    template: `
      <div class="tw:max-w-xl tw:flex tw:flex-col tw:gap-2">
        <BaseImageCropper v-bind="args" @change="(d) => (cropped = d)" />
        <p class="tw:text-caption tw:text-secondary">{{ cropped ? 'Crop captured ✓' : 'Drag to crop' }}</p>
      </div>`,
  }),
}

export const SquareAvatar = { ...Freeform, args: { src: 'https://picsum.photos/seed/qms/800/500', aspectRatio: 1, height: 320 } }
