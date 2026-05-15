<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

const route = useRoute()
const taskKindId = computed(() => route.query.taskKindId || null)
</script>

<template>
  <TaskInstancesHome :taskKindId="taskKindId" />
</template>
