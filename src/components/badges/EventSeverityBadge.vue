<script setup>
/**
 * Object → display for a per-tenant event severity. SCHEME_MAP is keyed off the
 * stable SCREAMING_SNAKE_CASE code (Low/Medium/High/Critical); tenant-added
 * codes fall through to neutral grey.
 */
defineProps({
  severity: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
})

const SCHEME_MAP = {
  LOW: { class: 'tw:bg-green-100 tw:text-green-700' },
  MEDIUM: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  HIGH: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  CRITICAL: { class: 'tw:bg-red-100 tw:text-red-700' },
}

const scheme = (code) => SCHEME_MAP[code] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(severity?.code).class" :showDot="showDot">
    {{ severity?.name || severity?.code || '—' }}
  </BaseBadge>
</template>
