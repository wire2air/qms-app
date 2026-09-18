<script setup>
const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
})

const user = useLiveQueryWithDeps(
  [() => props.userId],
  async (db, [userId]) => {
    if (!userId) return null
    return db.User.findByPk(userId)
  },

  { models: ['User'], initial: null },
)
</script>

<template>
  <UserBadge v-if="user" :user="user" v-bind="$attrs" />
</template>
