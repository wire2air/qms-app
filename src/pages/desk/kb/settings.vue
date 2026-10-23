<script setup>
// The knowledge base's public help center: live/address, home page, links,
// contact, appearance. Inside the Support Desk shell — no QMS chrome.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <KbHelpCenterSettings />
</template>
