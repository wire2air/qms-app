<script setup>
defineOptions({ name: 'PlatformCompaniesPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <PlatformCompanies />
</template>
