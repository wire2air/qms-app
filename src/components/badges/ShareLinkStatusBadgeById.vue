<script setup>
const props = defineProps({
  statusId: { type: String, default: null },
})

/**
 * Enum flavour: there is no `share_link_statuses` table to resolve against.
 * The state is DERIVED from the row — revoked_at, then expires_at, then
 * neither — so the map lives here and the derivation lives in one place
 * (shareLinkStatus.js) rather than being re-implemented per call site.
 */
const STATUS_MAP = {
  ACTIVE: { id: 'ACTIVE', name: 'Active' },
  EXPIRED: { id: 'EXPIRED', name: 'Expired' },
  WITHDRAWN: { id: 'WITHDRAWN', name: 'Withdrawn' },
}

const status = computed(
  () =>
    STATUS_MAP[props.statusId] ||
    (props.statusId ? { id: props.statusId, name: props.statusId } : null),
)
</script>

<template>
  <ShareLinkStatusBadge v-if="status" :status="status" v-bind="$attrs" />
</template>
