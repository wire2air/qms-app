<script setup>
// Support Desk settings inside the desk shell — no QMS chrome.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <SupportDeskSettings />
</template>
