<script setup>
const props = defineProps({
  teamId: {
    type: String,
    default: null,
  },
})

const team = useLiveQueryWithDeps(
  [() => props.teamId],
  async (db, [teamId]) => {
    if (!teamId) return null
    return db.Team.findByPk(teamId)
  },

  { models: ['Team'], initial: null },
)
</script>

<template>
  <GroupBadge v-if="team" :team="team" v-bind="$attrs" />
</template>
