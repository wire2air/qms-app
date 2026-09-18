<script setup>
defineProps({
  status: { type: Object, required: true },
})

// `user_statuses` holds exactly these two rows, and `users.user_status_id` is
// FK-constrained to them. An INVITED entry lived here and could never be
// reached — UserStatusBadgeById resolves through db.UserStatus, so a status
// that is not in the table cannot be rendered. Invited-but-not-accepted is
// INACTIVE + inviteSent and is badged separately by UserCard.
const SCHEME_MAP = {
  ACTIVE: { class: 'tw:bg-green-100 tw:text-green-700' },
  INACTIVE: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
