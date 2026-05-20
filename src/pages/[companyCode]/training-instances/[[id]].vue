<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <TrainingInstancesIndex :id="$route.params.id" />
</template>
