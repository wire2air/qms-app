<script setup>
/**
 * Verdict pill for a doc pack — parsed from the pack's 20-executive-summary
 * (READY WITH CONDITIONS / NOT READY / NOT READY (URGENT)). Pure display.
 */
const props = defineProps({
  verdict: { type: String, default: null },
})

const scheme = computed(() => {
  const v = (props.verdict || '').toUpperCase()
  if (!v) return { class: 'tw:bg-main-hover tw:text-secondary', label: 'No verdict' }
  if (v.includes('URGENT')) return { class: 'tw:bg-red-600 tw:text-white', label: props.verdict }
  if (v.startsWith('NOT READY'))
    return { class: 'tw:bg-red-100 tw:text-red-700 tw:dark:bg-red-950 tw:dark:text-red-300', label: props.verdict }
  if (v.includes('CONDITIONS'))
    return {
      class: 'tw:bg-amber-100 tw:text-amber-700 tw:dark:bg-amber-950 tw:dark:text-amber-300',
      label: props.verdict,
    }
  return {
    class: 'tw:bg-green-100 tw:text-green-700 tw:dark:bg-green-950 tw:dark:text-green-300',
    label: props.verdict,
  }
})
</script>

<template>
  <span
    class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2 tw:py-0.5 tw:text-caption tw:font-medium tw:whitespace-nowrap"
    :class="scheme.class"
  >
    {{ scheme.label }}
  </span>
</template>
