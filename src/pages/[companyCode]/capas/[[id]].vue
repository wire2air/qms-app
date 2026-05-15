<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <CapasIndex :id="$route.params.id" />
</template>
