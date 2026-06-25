<script setup>
/**
 * Unified non-data state for the table: empty / no-results / error / denied /
 * offline. Each variant has a sensible icon + copy that the consumer can override
 * via props or the `#default` (body) and `#action` slots.
 */
import {
  IconTableOff,
  IconSearchOff,
  IconAlertTriangle,
  IconLock,
  IconWifiOff,
  IconRefresh,
} from '@tabler/icons-vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'empty',
    validator: (v) => ['empty', 'no-results', 'error', 'denied', 'offline'].includes(v),
  },
  title: { type: String, default: null },
  description: { type: String, default: null },
  // Error detail (string or Error); only shown for the `error` variant.
  error: { type: [String, Object], default: null },
  // Show a retry button (error/offline variants default it on).
  retryable: { type: Boolean, default: null },
})

const emit = defineEmits(['retry'])

const PRESETS = {
  empty: { icon: IconTableOff, title: 'No data yet', description: 'There is nothing to show here.' },
  'no-results': {
    icon: IconSearchOff,
    title: 'No matching results',
    description: 'Try adjusting your search or filters.',
  },
  error: {
    icon: IconAlertTriangle,
    title: 'Something went wrong',
    description: 'We could not load this data.',
  },
  denied: {
    icon: IconLock,
    title: 'You don’t have access',
    description: 'You don’t have permission to view these records.',
  },
  offline: {
    icon: IconWifiOff,
    title: 'You’re offline',
    description: 'Reconnect to load the latest data.',
  },
}

const preset = computed(() => PRESETS[props.variant] ?? PRESETS.empty)
const icon = computed(() => preset.value.icon)
const resolvedTitle = computed(() => props.title ?? preset.value.title)
const resolvedDescription = computed(() => props.description ?? preset.value.description)
const errorText = computed(() => {
  if (!props.error) return null
  return typeof props.error === 'string' ? props.error : props.error.message || String(props.error)
})
const showRetry = computed(() =>
  props.retryable == null ? ['error', 'offline'].includes(props.variant) : props.retryable,
)
const isError = computed(() => props.variant === 'error')
</script>

<template>
  <div
    class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:px-4 tw:py-16 tw:text-center"
    :role="isError ? 'alert' : 'status'"
  >
    <div
      :class="[
        'tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-full',
        isError ? 'tw:bg-red-100 tw:text-red-500' : 'tw:bg-main-hover tw:text-placeholder',
      ]"
    >
      <component :is="icon" :size="26" />
    </div>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <p class="tw:text-sm tw:font-semibold tw:text-on-main">{{ resolvedTitle }}</p>
      <p class="tw:max-w-sm tw:text-sm tw:text-secondary">{{ resolvedDescription }}</p>
      <p v-if="errorText" class="tw:mt-1 tw:font-mono tw:text-xs tw:text-red-500/80">
        {{ errorText }}
      </p>
    </div>

    <!-- Custom body (e.g. a "Create" CTA for the empty state). -->
    <slot />

    <slot name="action">
      <button
        v-if="showRetry"
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-md tw:border tw:border-divider tw:bg-main tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:text-on-main tw:transition-colors tw:hover:bg-main-hover tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/50"
        @click="emit('retry')"
      >
        <IconRefresh :size="15" />
        Retry
      </button>
    </slot>
  </div>
</template>
