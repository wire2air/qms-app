<script setup>
defineProps({
  issueType: {
    type: Object,
    required: true,
  },
})

// Seeded set today: OUT_OF_SPEC / RECEIVING / MISSING_STANDARD. Tenant
// extensions fall through to the neutral default.
const SCHEME_MAP = {
  OUT_OF_SPEC: { class: 'tw:bg-rose-100 tw:text-rose-700' },
  RECEIVING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  MISSING_STANDARD: { class: 'tw:bg-slate-100 tw:text-slate-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(issueType.id).class">
    {{ issueType.name || issueType.id || '—' }}
  </BaseBadge>
</template>
