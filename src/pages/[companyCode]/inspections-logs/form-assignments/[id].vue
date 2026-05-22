<script setup>
defineOptions({
  name: 'FormAssignmentEditPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <FormAssignmentEditor :id="$route.params.id" />
</template>
