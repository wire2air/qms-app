<script setup>
defineOptions({ name: 'QcInspectionPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <QcInspectionHome />
</template>
