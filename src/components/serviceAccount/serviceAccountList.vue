<script setup>
defineProps({
  accounts: { type: Array, default: () => [] },
})

defineEmits(['toggle', 'delete', 'changed'])
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <ServiceAccountListItem
      v-for="account in accounts"
      :key="account.id"
      :account="account"
      @toggle="$emit('toggle', account)"
      @delete="$emit('delete', account)"
      @changed="$emit('changed')"
    />
  </div>
</template>
