<script setup>
// The knowledge base's API documentation portal: upload a spec, review it,
// publish endpoints, write around them. Inside the Support Desk shell — no QMS chrome.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <KbApiDocs />
</template>
