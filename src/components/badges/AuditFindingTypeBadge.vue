<script setup>
/**
 * Finding-type chip — MAJOR_NC / MINOR_NC / OBSERVATION / OFI.
 * Static enum (no SyncEngine model — audit_finding_types is BE-fixed).
 * SCHEME_MAP carries the colour-coding (red ramp for NCs, blue for
 * observations, violet for OFI).
 */
defineProps({
  type: { type: Object, required: true },
})

const SCHEME_MAP = {
  MAJOR_NC: { class: 'tw:bg-red-100 tw:text-red-700' },
  MINOR_NC: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  OBSERVATION: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  OFI: { class: 'tw:bg-violet-100 tw:text-violet-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(type?.id).class">
    {{ type?.name || type?.id || '—' }}
  </BaseBadge>
</template>
