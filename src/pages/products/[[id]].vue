<script setup>
defineOptions({
  name: 'ProductsPage',
})
</script>

<template>
  <ProductsIndex :id="$route.params.id" />
</template>

