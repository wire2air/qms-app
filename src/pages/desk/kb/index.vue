<script setup>
// Knowledge base inside the Support Desk shell — no QMS chrome.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <KbHome />
</template>
