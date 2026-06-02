<script setup>
/**
 * Enum-pattern resolver: static STATUS_MAP holds the data (id + name)
 * for the global audit_instance_statuses table. No DB lookup needed —
 * the values are stable global constants seeded once in updates.sql.
 *
 * If a future status id surfaces that isn't in the map, falls back to
 * showing the id verbatim — keeps the page from rendering blank if a
 * tenant ends up on a status the FE hasn't been deployed to know about.
 */
const props = defineProps({
  statusId: { type: String, default: null },
  showDot: { type: Boolean, default: false },
})

const STATUS_MAP = {
  DRAFT:       { id: 'DRAFT',       name: 'Draft' },
  SCHEDULED:   { id: 'SCHEDULED',   name: 'Scheduled' },
  IN_PROGRESS: { id: 'IN_PROGRESS', name: 'In Progress' },
  REVIEW:      { id: 'REVIEW',      name: 'Review' },
  REJECTED:    { id: 'REJECTED',    name: 'Rejected' },
  COMPLETED:   { id: 'COMPLETED',   name: 'Completed' },
  CLOSED:      { id: 'CLOSED',      name: 'Closed' },
  CANCELLED:   { id: 'CANCELLED',   name: 'Cancelled' },
}

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <AuditInstanceStatusBadge
    v-if="status"
    :status="status"
    :showDot="showDot"
    v-bind="$attrs"
  />
</template>
