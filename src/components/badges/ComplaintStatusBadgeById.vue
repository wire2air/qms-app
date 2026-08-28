<script setup>
// Enum-flavor: the unified parent vocabulary (2026-08-28) — the same four
// every other parent record speaks. Conversion-to-NC is a record LINK, not a
// status, and renders where the link renders.
const props = defineProps({
  statusId: { type: String, default: null },
})

const STATUS_MAP = {
  DRAFT: { id: 'DRAFT', name: 'Draft' },
  OPEN: { id: 'OPEN', name: 'Open' },
  CLOSED: { id: 'CLOSED', name: 'Closed' },
  CANCELLED: { id: 'CANCELLED', name: 'Cancelled' },
}

const status = computed(
  () => STATUS_MAP[props.statusId] || (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <ComplaintStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
