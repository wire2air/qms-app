<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <MyTrainingPageId :id="$route.params.id" />
</template>
