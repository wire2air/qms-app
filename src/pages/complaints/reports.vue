<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <CustomerComplaintReports backTo="/complaints" backLabel="Back to complaints" />
</template>
