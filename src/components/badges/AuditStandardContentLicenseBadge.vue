<script setup>
/**
 * Content-license chip for AuditStandard.
 * Enum (no SyncEngine model — the value lives directly on the
 * audit_standards row as a STRING ENUM, defended by the
 * audit_standards_content_license_chk CHECK constraint).
 */
defineProps({
  license: { type: Object, required: true },
})

const SCHEME_MAP = {
  STRUCTURAL_SHELL: { class: 'tw:bg-gray-100 tw:text-gray-700' },
  PUBLIC_DOMAIN: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  OFFICIAL_LICENSED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CUSTOMER_LICENSED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  CUSTOMER_AUTHORED: { class: 'tw:bg-violet-100 tw:text-violet-700' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(license?.id).class">
    {{ license?.name || license?.id || '—' }}
  </BaseBadge>
</template>
