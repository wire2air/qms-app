<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <DocumentTemplatesIndex :id="$route.params.id" />
</template>
