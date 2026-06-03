<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <WorkflowInstanceIndex :id="$route.params.id" />
</template>
