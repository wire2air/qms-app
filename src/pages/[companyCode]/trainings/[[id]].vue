<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <TrainingsIndex :id="$route.params.id" />
</template>
