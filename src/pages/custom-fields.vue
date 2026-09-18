<script setup>
// Settings → Custom Fields. Full-canvas builder, so hide the app MainHeader
// (the FormBuilder renders its own title bar + Save button). The sidebar stays
// for navigation.
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: false,
}
</script>

<template>
  <CustomFieldsHome />
</template>
