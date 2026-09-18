<script setup>
// Generic route for every admin-defined module: /m/:moduleKey(/:id?).
// moduleKey = the form template's internalName. The Index branches
// list / create / detail, mirroring the per-module page wrappers.
const route = useRoute()
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }
</script>

<template>
  <GenericModuleIndex :id="route.params.id" :moduleKey="route.params.moduleKey" />
</template>
