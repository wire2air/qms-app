<script setup>
defineProps({
  product: {
    type: Object,
    required: true,
  },
})
</script>

<template>
  <BaseBadge v-bind="$attrs" class="tw:max-w-72 tw:min-w-0" :title="`${product.sku ? `${product.sku} - ` : ''}${product.name}`">
    <span v-if="product.sku" class="tw:font-medium tw:shrink-0">{{ product.sku }}</span>
    <span v-if="product.sku" class="tw:opacity-40 tw:shrink-0">-</span>
    <span class="tw:truncate tw:min-w-0">{{ product.name }}</span>
  </BaseBadge>
</template>
