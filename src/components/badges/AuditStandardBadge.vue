<script setup>
/**
 * Renders an audit standard as a name + code chip. No SCHEME_MAP — the
 * standard itself doesn't have a status-colour dimension (that's on the
 * effective version, surfaced separately). Receives the full object;
 * AuditStandardBadgeById is the id-resolving wrapper.
 */
defineProps({
  standard: { type: Object, required: true },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200">
    <span class="tw:font-medium">{{ standard?.name || standard?.code || standard?.id || '—' }}</span>
    <code
      v-if="standard?.code && standard?.name"
      class="tw:text-[10px] tw:ml-1 tw:text-blue-500"
    >
      {{ standard.code }}
    </code>
  </BaseBadge>
</template>
