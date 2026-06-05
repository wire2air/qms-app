<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <FormTemplatesIndex :id="$route.params.id" />
</template>
