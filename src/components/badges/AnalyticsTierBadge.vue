<script setup>
/**
 * The read tier a metric came from — T1 Live / T2 Rollup / T3 Snapshot.
 * A 15-minute-old rollup number looks identical to a live one, so the tier and
 * the timestamp travel together on every tile (analytics plan §11).
 */
defineProps({
  tier: { type: Object, required: true },
})

const SCHEME_MAP = {
  T1: { class: 'tw:bg-green-100 tw:text-green-700' },
  T2: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  T3: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(tier?.id).class">
    {{ tier?.name || tier?.id || '—' }}
  </BaseBadge>
</template>
