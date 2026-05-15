<script setup>
const props = defineProps({
  userId: {
    type: String,
    default: null,
  },
  showCardOnClick: {
    type: Boolean,
    default: false,
  },
})

const user = useLiveQueryWithDeps(
  [() => props.userId],
  async (db, [userId]) => {
    if (!userId) return null
    return db.User.findByPk(userId)
  },
  { initial: null },
)
</script>

<template>
  <UserAvatar v-if="user" :user="user" :showCardOnClick="showCardOnClick" />
</template>
