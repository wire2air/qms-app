<script setup>
import {
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-vue'

defineProps({
  id: { type: Number, required: true },
  type: { type: String, default: 'info' },
  message: { type: String, default: '' },
  caption: { type: String, default: '' },
  html: { type: Boolean, default: false },
  multiLine: { type: Boolean, default: false },
})

const emit = defineEmits(['dismiss'])

const typeConfig = {
  positive: {
    icon: IconCircleCheck,
    container: 'tw:bg-[var(--color-success-50)] tw:border-[var(--color-success-200)]',
    icon_color: 'tw:text-[var(--color-success-600)]',
    title_color: 'tw:text-[var(--color-success-700)]',
    caption_color: 'tw:text-[var(--color-success-600)]',
  },
  negative: {
    icon: IconCircleX,
    container: 'tw:bg-[var(--color-danger-50)] tw:border-[var(--color-danger-200)]',
    icon_color: 'tw:text-[var(--color-danger-600)]',
    title_color: 'tw:text-[var(--color-danger-700)]',
    caption_color: 'tw:text-[var(--color-danger-600)]',
  },
  warning: {
    icon: IconAlertTriangle,
    container: 'tw:bg-[var(--color-warning-50)] tw:border-[var(--color-warning-200)]',
    icon_color: 'tw:text-[var(--color-warning-600)]',
    title_color: 'tw:text-[var(--color-warning-700)]',
    caption_color: 'tw:text-[var(--color-warning-600)]',
  },
  info: {
    icon: IconInfoCircle,
    container: 'tw:bg-[var(--color-info-50)] tw:border-[var(--color-info-200)]',
    icon_color: 'tw:text-[var(--color-info-600)]',
    title_color: 'tw:text-[var(--color-info-700)]',
    caption_color: 'tw:text-[var(--color-info-600)]',
  },
}
</script>

<template>
  <div
    :class="[
      'tw:flex tw:items-start tw:gap-3 tw:w-80 tw:rounded-xl tw:border tw:p-3.5 tw:shadow-lg tw:pointer-events-auto',
      typeConfig[type]?.container || typeConfig.info.container,
    ]"
    role="alert"
  >
    <!-- Icon -->
    <component
      :is="typeConfig[type]?.icon || typeConfig.info.icon"
      :class="[
        'tw:size-5 tw:shrink-0 tw:mt-0.5',
        typeConfig[type]?.icon_color || typeConfig.info.icon_color,
      ]"
    />

    <!-- Content -->
    <div class="tw:flex-1 tw:min-w-0">
      <div
        v-if="html"
        :class="[
          'tw:text-sm tw:font-medium',
          typeConfig[type]?.title_color || typeConfig.info.title_color,
          { 'tw:whitespace-pre-line': multiLine },
        ]"
        v-html="message"
      />
      <div
        v-else
        :class="[
          'tw:text-sm tw:font-medium',
          typeConfig[type]?.title_color || typeConfig.info.title_color,
          { 'tw:whitespace-pre-line': multiLine },
        ]"
      >
        {{ message }}
      </div>
      <div
        v-if="caption"
        :class="[
          'tw:text-xs tw:mt-1',
          typeConfig[type]?.caption_color || typeConfig.info.caption_color,
        ]"
      >
        {{ caption }}
      </div>
    </div>

    <!-- Close -->
    <button
      :class="[
        'tw:shrink-0 tw:p-0.5 tw:rounded-md tw:transition-colors tw:cursor-pointer',
        typeConfig[type]?.icon_color || typeConfig.info.icon_color,
        'tw:hover:bg-black/5',
      ]"
      @click="emit('dismiss', id)"
    >
      <IconX class="tw:size-4" />
    </button>
  </div>
</template>
