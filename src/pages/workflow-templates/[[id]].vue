<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <WorkflowsIndex :id="$route.params.id" />
</template>
