<script setup>
defineProps({
  product: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:max-w-72 tw:min-w-0" :title="`${product.name} ${product.sku || ''}`">
    <span class="tw:truncate tw:min-w-0">{{ product.name }}</span>
    <span class="tw:text-xs tw:opacity-60 tw:shrink-0">{{ product.sku }}</span>
  </BaseBadge>
</template>
