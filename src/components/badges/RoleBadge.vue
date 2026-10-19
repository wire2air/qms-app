<script setup>
defineProps({
  role: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <BaseBadge
    v-bind="$attrs"
    :class="role.isSupportRole ? 'tw:bg-teal-100 tw:text-teal-800' : ''"
    :title="role.isSupportRole ? 'Support Desk role — never combined with QMS roles' : undefined"
  >
    {{ role.name }}
  </BaseBadge>
</template>
