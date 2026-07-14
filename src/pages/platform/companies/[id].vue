<script setup>
defineOptions({ name: 'PlatformTenantPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
const route = useRoute()
</script>

<template>
  <PlatformTenant360 :companyId="route.params.id" />
</template>
