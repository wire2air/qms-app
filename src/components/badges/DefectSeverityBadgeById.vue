<script setup>
const props = defineProps({ severityId: { type: String, default: null } })

const STATUS_MAP = {
  CRITICAL: { id: 'CRITICAL', name: 'Critical' },
  MAJOR: { id: 'MAJOR', name: 'Major' },
  MINOR: { id: 'MINOR', name: 'Minor' },
}
const status = computed(
  () =>
    STATUS_MAP[props.severityId] ||
    (props.severityId ? { id: props.severityId, name: props.severityId } : null),
)
</script>

<template>
  <DefectSeverityBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
