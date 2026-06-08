<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <SuppliersIndex :id="$route.params.id" />
</template>
