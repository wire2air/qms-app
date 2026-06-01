<script setup>
defineProps({
  issueType: {
    type: Object,
    required: true,
  },
})

// Keyed off the SCREAMING_SNAKE_CASE code (stable per-tenant), not the
// UUID id. Default seed set: OUT_OF_SPEC / RECEIVING / MISSING_STANDARD.
// Tenant-added codes fall through to the neutral grey.
const SCHEME_MAP = {
  OUT_OF_SPEC: { class: 'tw:bg-rose-100 tw:text-rose-700' },
  RECEIVING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  MISSING_STANDARD: { class: 'tw:bg-slate-100 tw:text-slate-700' },
}

const scheme = (code) => SCHEME_MAP[code] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(issueType.code).class">
    {{ issueType.name || issueType.code || '—' }}
  </BaseBadge>
</template>
