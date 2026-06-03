<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <ImpersonateIndex :companyId="$route.params.companyId" />
</template>
