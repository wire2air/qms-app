<script setup>
import { DateTime } from 'luxon'

/**
 * Enum-flavor badge with a twist: pass the whole retain sample (or statusId +
 * retainUntil) and the badge derives DUE (≤30 days out) / OVERDUE (past
 * retain-until) display states for RETAINED samples.
 */
const props = defineProps({
  statusId: { type: String, default: null },
  retainUntil: { type: Object, default: null }, // luxon DateTime | null
})

const STATUS_MAP = {
  RETAINED: { id: 'RETAINED', name: 'Retained' },
  DUE: { id: 'DUE', name: 'Due for Destruction' },
  OVERDUE: { id: 'OVERDUE', name: 'Overdue Destruction' },
  DISPOSED: { id: 'DISPOSED', name: 'Disposed' },
}

const status = computed(() => {
  let id = props.statusId
  if (id === 'RETAINED' && props.retainUntil?.isValid) {
    const days = props.retainUntil.diff(DateTime.now(), 'days').days
    if (days < 0) id = 'OVERDUE'
    else if (days <= 30) id = 'DUE'
  }
  return STATUS_MAP[id] || (id ? { id, name: id } : null)
})
</script>

<template>
  <RetainSampleStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
