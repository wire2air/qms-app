<script setup>
// Roles are syncEngine-backed (C3) — no shared axios state to provide; each
// child reads/writes db.Role directly.
const props = defineProps({
  id: {
    type: String,
    default: null,
  },
})
</script>

<template>
  <RolePageId v-if="props.id" :id="props.id" />
  <RolesHome v-else />
</template>
