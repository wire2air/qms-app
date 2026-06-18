<script setup>
import { IconX, IconChevronDown } from '@tabler/icons-vue'

const props = defineProps({
  clearable: { type: Boolean, default: false },
  // Accessible name for the clear button (rule #8 — it's a real <button>).
  clearLabel: { type: String, default: 'Remove' },
  selectable: { type: Boolean, default: false },
  showDot: { type: Boolean, default: false },
  // 'sm' | 'md' (default). Folded in from the former BaseChip.
  size: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md'].includes(v),
  },
})

const emit = defineEmits(['clear'])

// Size affects padding + text only (md = the original badge metrics).
const sizeClass = computed(() =>
  props.size === 'sm' ? 'tw:px-2 tw:py-0.5 tw:text-xs' : 'tw:px-3 tw:py-1 tw:text-sm',
)

// Status badges bring their own color via a SCHEME_MAP `bg-*` class ($attrs);
// entity badges (Site/Department/User/…) pass none. A select TRIGGER with no
// scheme would otherwise be a transparent pill with only a `current`-tinted
// border — which reads as a washed-out light chip in dark mode. Give those a
// theme-aware control fill instead. Display badges + scheme badges are untouched.
const attrs = useAttrs()
const isPlainTrigger = computed(() => !/tw:bg-/.test(String(attrs.class || '')))
</script>

<template>
  <div
    class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:font-medium tw:w-fit tw:transition-all tw:duration-200"
    :class="[
      sizeClass,
      selectable && 'tw:cursor-pointer',
      selectable && isPlainTrigger
        ? 'tw:bg-main-hover tw:border-divider tw:text-on-main'
        : 'tw:border-current/20',
    ]"
  >
    <div
      v-if="showDot"
      class="tw:w-2 tw:h-2 tw:rounded-full tw:bg-current tw:animate-pulse tw:shrink-0"
    />
    <span v-if="$slots.icon" class="tw:shrink-0">
      <slot name="icon" />
    </span>
    <slot />
    <button
      v-if="clearable"
      type="button"
      :aria-label="clearLabel"
      class="tw:flex tw:shrink-0 tw:ml-0.5 tw:rounded-full tw:opacity-60 tw:hover:opacity-100 tw:transition-opacity tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
      @click.prevent.stop="emit('clear')"
    >
      <IconX class="tw:size-3.5" />
    </button>
    <IconChevronDown
      v-else-if="selectable"
      class="tw:size-3.5 tw:shrink-0 tw:ml-0.5 tw:opacity-60"
    />
  </div>
</template>
