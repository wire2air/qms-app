<script setup>
defineProps({
  id: {
    type: String,
    default: undefined,
  },
})
</script>

<template>
  <ProductDetail v-if="id" :id="id" :key="id" />
  <ProductsHome v-else />
</template>
