<script setup>
/**
 * BaseSkeleton — content-shaped loading placeholder (no layout shift).
 *
 * Prefer this over a centered spinner for lists/tables/detail panels: it
 * preserves the page's shape while data loads, which reads far more premium.
 *
 *   <BaseSkeleton />                          // single text line, full width
 *   <BaseSkeleton :lines="3" />               // paragraph (last line short)
 *   <BaseSkeleton variant="circle" width="40px" height="40px" />  // avatar
 *   <BaseSkeleton variant="rect" height="120px" rounded="tw:rounded-lg" /> // card
 *   <BaseSkeleton variant="text" width="8rem" />
 */
const props = defineProps({
  // 'text' | 'rect' | 'circle'
  variant: { type: String, default: 'text' },
  // any CSS width/height (e.g. '100%', '8rem', '40px'); sensible defaults per variant
  width: { type: String, default: null },
  height: { type: String, default: null },
  // radius utility override (defaults per variant)
  rounded: { type: String, default: null },
  // text variant only: render N stacked lines, last one shorter
  lines: { type: Number, default: 1 },
})

const roundedClass = computed(() => {
  if (props.rounded) return props.rounded
  if (props.variant === 'circle') return 'tw:rounded-full'
  if (props.variant === 'rect') return 'tw:rounded-lg'
  return 'tw:rounded'
})

function barStyle(i) {
  const style = {}
  if (props.width) style.width = props.width
  if (props.height) style.height = props.height
  else if (props.variant === 'text') style.height = '0.75rem'
  // last line of a multi-line paragraph is shorter
  if (props.variant === 'text' && props.lines > 1 && i === props.lines - 1 && !props.width) {
    style.width = '60%'
  }
  return style
}
</script>

<template>
  <div
    v-if="variant === 'text' && lines > 1"
    class="tw:flex tw:flex-col tw:gap-2"
    role="status"
    aria-label="Loading"
  >
    <span
      v-for="i in lines"
      :key="i"
      class="tw:block tw:w-full tw:animate-pulse tw:motion-reduce:animate-none tw:bg-neutral-200 tw:dark:bg-neutral-700"
      :class="roundedClass"
      :style="barStyle(i - 1)"
    />
  </div>
  <span
    v-else
    class="tw:block tw:animate-pulse tw:motion-reduce:animate-none tw:bg-neutral-200 tw:dark:bg-neutral-700"
    :class="[roundedClass, variant === 'text' ? 'tw:w-full' : '']"
    :style="barStyle(0)"
    role="status"
    aria-label="Loading"
  />
</template>
