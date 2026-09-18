<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <CustomerComplaintsIndex :id="$route.params.id" />
</template>
