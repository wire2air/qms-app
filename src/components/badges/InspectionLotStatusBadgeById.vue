<script setup>
const props = defineProps({ statusId: { type: String, default: null } })
// Unified parent vocabulary (2026-08-28). Execution detail renders via
// InspectionLotPhaseBadgeById; the disposition outcome via its type badge.
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
  <InspectionLotStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
