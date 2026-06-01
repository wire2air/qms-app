<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: true },
})

const STATUS_MAP = {
  DRAFT: { id: 'DRAFT', name: 'Draft' },
  ACTIVE: { id: 'ACTIVE', name: 'Published' },
  ARCHIVED: { id: 'ARCHIVED', name: 'Archived' },
}

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <TrainingStatusBadge
    v-if="status"
    data-testid="training-status-badge"
    :status="status"
    :showDot="showDot"
    v-bind="$attrs"
  />
</template>
