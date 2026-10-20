<script setup>
// Agent's own Support Desk preferences — part of the /desk workspace (no QMS chrome).
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <SupportAgentPreferences />
</template>
