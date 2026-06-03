<script setup>
defineOptions({
  name: 'LogBookDetailPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <LogBookDetailPage :id="$route.params.id" />
</template>
