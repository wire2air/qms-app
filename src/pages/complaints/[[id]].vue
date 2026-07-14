<script setup>
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <QaComplaintsIndex :id="$route.params.id" />
</template>
