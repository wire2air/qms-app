<script setup>
/**
 * The outcome of one scheduled-report firing.
 *
 * PARTIAL is amber rather than red on purpose: it is what a HEALTHY system looks
 * like when somebody on the distribution list has lost export access. Colouring
 * it as a failure would train people to ignore it, and it is the one status that
 * carries the phase's exit criterion — a recipient who loses access stops
 * receiving, and that is visible nowhere else.
 */
defineProps({
  status: { type: Object, required: true },
})

const SCHEME_MAP = {
  RUNNING: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  SUCCEEDED: { class: 'tw:bg-green-100 tw:text-green-700' },
  PARTIAL: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  FAILED: { class: 'tw:bg-red-100 tw:text-red-700' },
  SKIPPED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
