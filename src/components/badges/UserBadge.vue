<script setup>
defineProps({
  user: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:border-0">
    <template #icon>
      <UserAvatar :user="user" :showBadge="false" class="tw:size-6" :bordered="false" />
    </template>
    {{ user.firstName }} {{ user.lastName }}
  </BaseBadge>
</template>
