<script setup>
defineOptions({
  name: 'FormAssignmentCreatePage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <FormAssignmentEditor />
</template>
