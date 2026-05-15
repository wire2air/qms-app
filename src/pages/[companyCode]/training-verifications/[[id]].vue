<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <TrainingVerificationsHome :instanceId="$route.params.id || null" />
</template>
