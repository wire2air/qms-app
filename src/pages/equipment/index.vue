<script setup>
defineOptions({
  name: 'EquipmentPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}
</script>

<template>
  <EquipmentHome />
</template>
