<script setup>
defineOptions({
  name: 'FormAssignmentsListPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <FormAssignmentsHome />
</template>
