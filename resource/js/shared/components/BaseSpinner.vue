<script setup>
/**
 * BaseSpinner — the canonical loading indicator.
 *
 * Replaces the hand-rolled `tw:animate-spin tw:rounded-full ... tw:border-t-transparent`
 * blocks scattered across the app. Token-driven, theme-aware, accessible.
 *
 *   <BaseSpinner />                      // default md, primary
 *   <BaseSpinner size="sm" />            // inside buttons / inline
 *   <BaseSpinner size="lg" centered />   // full-area loader
 *   <BaseSpinner color="white" />        // on a colored surface
 */
const props = defineProps({
  // xs | sm | md | lg | xl — or a raw pixel number
  size: { type: [String, Number], default: 'md' },
  // 'primary' (default) | 'secondary' | 'white' | 'current'
  color: { type: String, default: 'primary' },
  // wrap in a centered flex container that fills its parent
  centered: { type: Boolean, default: false },
  // accessible label announced to screen readers
  label: { type: String, default: 'Loading' },
})

const SIZE_MAP = {
  xs: { box: 16, border: 2 },
  sm: { box: 20, border: 2 },
  md: { box: 28, border: 3 },
  lg: { box: 40, border: 4 },
  xl: { box: 56, border: 4 },
}

const COLOR_MAP = {
  primary: 'tw:border-primary tw:border-t-transparent',
  secondary: 'tw:border-secondary tw:border-t-transparent',
  white: 'tw:border-white tw:border-t-transparent',
  current: 'tw:border-current tw:border-t-transparent',
}

const dims = computed(() => {
  if (typeof props.size === 'number') return { box: props.size, border: props.size >= 40 ? 4 : 3 }
  return SIZE_MAP[props.size] || SIZE_MAP.md
})

const colorClass = computed(() => COLOR_MAP[props.color] || COLOR_MAP.primary)

const spinnerStyle = computed(() => ({
  width: `${dims.value.box}px`,
  height: `${dims.value.box}px`,
  borderWidth: `${dims.value.border}px`,
}))
</script>

<template>
  <div
    v-if="centered"
    class="tw:flex tw:h-full tw:w-full tw:items-center tw:justify-center"
  >
    <span
      class="tw:inline-block tw:animate-spin tw:rounded-full tw:border-solid"
      :class="colorClass"
      :style="spinnerStyle"
      role="status"
      :aria-label="label"
    />
  </div>
  <span
    v-else
    class="tw:inline-block tw:animate-spin tw:rounded-full tw:border-solid"
    :class="colorClass"
    :style="spinnerStyle"
    role="status"
    :aria-label="label"
  />
</template>
