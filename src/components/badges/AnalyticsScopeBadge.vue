<script setup>
/**
 * The access scope a metric was COMPUTED UNDER (`effective_scope`).
 *
 * This is load-bearing, not decoration: scope tiers are cumulative and NULL
 * dimensions are invisible to scoped viewers, so two people looking at the same
 * KPI key legitimately see different totals. Without the scope on the tile that
 * reads as a bug (analytics plan §5.1).
 */
defineProps({
  scope: { type: Object, required: true },
})

const SCHEME_MAP = {
  own: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  department: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  site: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  tenant: { class: 'tw:bg-blue-100 tw:text-blue-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(scope?.id).class">
    {{ scope?.name || scope?.id || '—' }}
  </BaseBadge>
</template>
