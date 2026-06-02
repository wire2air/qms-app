<script setup>
/**
 * Id → AuditFindingTypeBadge. Static enum (audit_finding_types is
 * `@behavior -insert -update -delete`). STATUS_MAP holds the display
 * label; styling lives in AuditFindingTypeBadge's SCHEME_MAP.
 */
const props = defineProps({
  typeId: { type: String, default: null },
})

const STATUS_MAP = {
  MAJOR_NC: { id: 'MAJOR_NC', name: 'Major NC' },
  MINOR_NC: { id: 'MINOR_NC', name: 'Minor NC' },
  OBSERVATION: { id: 'OBSERVATION', name: 'Observation' },
  OFI: { id: 'OFI', name: 'OFI' },
}

const type = computed(
  () =>
    STATUS_MAP[props.typeId] ||
    (props.typeId ? { id: props.typeId, name: props.typeId } : null),
)
</script>

<template>
  <AuditFindingTypeBadge v-if="type" :type="type" v-bind="$attrs" />
</template>
