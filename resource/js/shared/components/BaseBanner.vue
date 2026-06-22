<script setup>
import { IconX } from '@tabler/icons-vue'

const props = defineProps({
  tone: { type: String, default: 'info', validator: (v) => ['info', 'warning', 'danger', 'neutral'].includes(v) },
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  dismissible: { type: Boolean, default: false },
})
defineEmits(['dismiss'])

const TONE = {
  info: 'tw:bg-blue-50 tw:text-blue-800 tw:border-blue-200',
  warning: 'tw:bg-amber-50 tw:text-amber-800 tw:border-amber-200',
  danger: 'tw:bg-red-50 tw:text-red-800 tw:border-red-200',
  neutral: 'tw:bg-gray-50 tw:text-gray-700 tw:border-gray-200',
}
const toneClass = computed(() => TONE[props.tone] || TONE.info)
const ariaLive = computed(() => (props.tone === 'danger' ? 'assertive' : 'polite'))
</script>

<template>
  <div
    data-test="base-banner"
    role="status"
    :data-tone="tone"
    :aria-live="ariaLive"
    class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:px-4 tw:py-3"
    :class="toneClass"
  >
    <component :is="icon" v-if="icon" :size="18" class="tw:mt-0.5 tw:shrink-0" aria-hidden="true" />
    <div class="tw:min-w-0 tw:flex-1">
      <p class="tw:text-body tw:font-semibold">{{ title }}</p>
      <p v-if="message" class="tw:text-body tw:opacity-90">{{ message }}</p>
      <div v-if="$slots.actions" class="tw:mt-2 tw:flex tw:gap-2">
        <slot name="actions" />
      </div>
    </div>
    <button
      v-if="dismissible"
      type="button"
      data-test="banner-dismiss"
      aria-label="Dismiss"
      class="tw:shrink-0 tw:rounded tw:p-0.5 tw:opacity-70 tw:hover:opacity-100"
      @click="$emit('dismiss')"
    >
      <IconX :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
