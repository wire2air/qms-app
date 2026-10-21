<script setup>
// One knowledge base article, inside the Support Desk shell — no QMS chrome.
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: false }
</script>

<template>
  <KbArticleEditor :articleId="$route.params.id" />
</template>
