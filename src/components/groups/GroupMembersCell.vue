<script setup>
// Per-row member count for the Groups DataTable (live query — see UserRolesCell).
const props = defineProps({
  teamId: { type: String, required: true },
})

const count = useLiveQueryWithDeps(
  [() => props.teamId],
  async (db, [teamId]) => (await db.UserOnTeam.where('teamId', teamId).exec()).length,
  { models: ['UserOnTeam'], initial: 0 },
)
</script>

<template>
  <span class="tw:text-sm tw:text-on-main">{{ count }} member{{ count === 1 ? '' : 's' }}</span>
</template>
