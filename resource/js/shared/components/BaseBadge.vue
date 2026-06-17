<script setup>
import { IconX, IconChevronDown } from '@tabler/icons-vue'

defineProps({
  clearable: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  showDot: { type: Boolean, default: false },
})

const emit = defineEmits(['clear'])

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
    class="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1 tw:rounded-full tw:border tw:text-sm tw:font-medium tw:w-fit tw:transition-all tw:duration-200"
    :class="[
      selectable && 'tw:cursor-pointer',
      selectable && isPlainTrigger ? 'tw:bg-main-hover tw:border-divider' : 'tw:border-current/20',
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
    <IconX
      v-if="clearable"
      class="tw:size-3.5 tw:shrink-0 tw:ml-0.5 tw:opacity-60 tw:hover:opacity-100 tw:cursor-pointer tw:transition-opacity"
      @click.prevent.stop="emit('clear')"
    />
    <IconChevronDown
      v-else-if="selectable"
      class="tw:size-3.5 tw:shrink-0 tw:ml-0.5 tw:opacity-60"
    />
  </div>
</template>
