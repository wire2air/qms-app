<script setup>
defineProps({
  tokens: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <AiPatListItem v-for="token in tokens" :key="token.id" :token="token" />
  </div>
</template>
