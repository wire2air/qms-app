<script setup>
// Tenant lifecycle status badge (enum-style — platform data has no syncEngine
// model). Colour map mirrors COMPANY_STATUSES in @/api/platform.js.
import { COMPANY_STATUSES } from '@/api/platform.js'

const props = defineProps({
  status: { type: String, default: null },
})

const meta = computed(
  () =>
    COMPANY_STATUSES.find((s) => s.id === props.status) || {
      label: props.status || '—',
      class: 'tw:bg-gray-100 tw:text-gray-600',
    },
)
</script>

<template>
  <span
    class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
    :class="meta.class"
  >
    {{ meta.label }}
  </span>
</template>
