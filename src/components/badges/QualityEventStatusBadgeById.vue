<script setup>
/**
 * Enum-pattern resolver: static map holds the data (id + name) for the fixed
 * quality_events lifecycle enum. No DB lookup. Falls back to the id verbatim
 * for any future status the FE doesn't yet know.
 */
import { QUALITY_EVENT_STATUS_MAP } from '@/utils/qualityEventStatuses'

const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const status = computed(
  () =>
    QUALITY_EVENT_STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <QualityEventStatusBadge v-if="status" :status="status" :showDot="showDot" v-bind="$attrs" />
</template>
