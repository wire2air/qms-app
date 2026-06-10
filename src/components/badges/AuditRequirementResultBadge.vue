<script setup>
/**
 * Per-result colour chip for audit_finding_results.
 *
 * Enum pattern (no SyncEngine model — the BE table is
 * `@behavior -insert -update -delete`, so the labels live inline).
 * `result` is either { id, name } (matching the enum-badge contract)
 * or null. SCHEME_MAP holds the colour-coding only; STATUS_MAP (inside
 * AuditRequirementResultBadgeById) holds the display labels.
 */
defineProps({
  result: { type: Object, default: null },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  CONFORMING: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  MINOR_NC: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  MAJOR_NC: { class: 'tw:bg-red-100 tw:text-red-700' },
  OBSERVATION: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  OFI: { class: 'tw:bg-violet-100 tw:text-violet-700' },
  NA: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-if="result" v-bind="$attrs" :class="scheme(result.id).class" :showDot="showDot">
    {{ result.name || result.id }}
  </BaseBadge>
</template>
