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

// Unified parent vocabulary (2026-08-28) — execution detail renders via
// AuditPhaseBadgeById, not here.
const STATUS_MAP = {
  DRAFT:     { id: 'DRAFT',     name: 'Draft' },
  OPEN:      { id: 'OPEN',      name: 'Open' },
  CLOSED:    { id: 'CLOSED',    name: 'Closed' },
  CANCELLED: { id: 'CANCELLED', name: 'Cancelled' },
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
