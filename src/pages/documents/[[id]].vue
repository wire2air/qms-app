<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <DocumentsIndex :id="$route.params.id" />
</template>
