<script setup>
defineOptions({
  name: 'FieldRecordsListPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <FieldRecordsHome />
</template>
