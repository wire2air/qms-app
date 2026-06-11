<script setup>
const props = defineProps({ statusId: { type: String, default: null } })
const MAP = {
  DRAFT: { id: 'DRAFT', name: 'Draft' },
  EFFECTIVE: { id: 'EFFECTIVE', name: 'Effective' },
  SUPERSEDED: { id: 'SUPERSEDED', name: 'Superseded' },
}
const status = computed(
  () => MAP[props.statusId] || (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <SpecificationStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
