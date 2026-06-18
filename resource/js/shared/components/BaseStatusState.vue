<script setup>
/**
 * BaseStatusState — a centered icon + title + description + action block for the
 * empty / error / success / not-found states (audit §3: one component with a
 * `variant`, not four near-identical files). Each variant supplies a default
 * icon + title + tint; override any of them per use.
 *
 *   <BaseStatusState variant="empty" description="No documents match your filters." />
 *   <BaseStatusState variant="error" title="Couldn't load" description="…">
 *     <template #action><BaseButton @click="retry">Retry</BaseButton></template>
 *   </BaseStatusState>
 *
 * (BaseEmptyState remains for the bare empty case; this is the superset.)
 */
import { IconSearchOff, IconAlertTriangle, IconCircleCheck, IconFileOff } from '@tabler/icons-vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'empty',
    validator: (v) => ['empty', 'error', 'success', 'notfound'].includes(v),
  },
  // Overrides for the variant defaults.
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  dense: { type: Boolean, default: false },
})

// Per-variant defaults. `tint` uses semantic tokens so it's theme-aware.
const VARIANT = {
  empty: { icon: IconSearchOff, title: 'No results found', tint: 'tw:text-secondary' },
  error: { icon: IconAlertTriangle, title: 'Something went wrong', tint: 'tw:text-bad' },
  success: { icon: IconCircleCheck, title: 'All done', tint: 'tw:text-good' },
  notfound: { icon: IconFileOff, title: 'Not found', tint: 'tw:text-secondary' },
}

const cfg = computed(() => VARIANT[props.variant] || VARIANT.empty)
const resolvedIcon = computed(() => props.icon || cfg.value.icon)
const resolvedTitle = computed(() => props.title || cfg.value.title)
</script>

<template>
  <div
    class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:text-center"
    :class="dense ? 'tw:py-4' : 'tw:py-12'"
  >
    <component
      :is="resolvedIcon"
      :size="dense ? 24 : 40"
      class="tw:opacity-60"
      :class="[cfg.tint, dense ? 'tw:mb-1' : 'tw:mb-3']"
      aria-hidden="true"
    />
    <p class="tw:font-semibold tw:text-on-main" :class="dense ? 'tw:text-xs' : 'tw:text-sm'">
      {{ resolvedTitle }}
    </p>
    <p v-if="description" class="tw:mt-1 tw:text-xs tw:text-secondary">{{ description }}</p>
    <div v-if="$slots.action" :class="dense ? 'tw:mt-2' : 'tw:mt-4'">
      <slot name="action" />
    </div>
  </div>
</template>
