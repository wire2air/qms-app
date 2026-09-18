<script setup>
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }

const route = useRoute()

// Catch-all param: unplugin-vue-router gives `slug` as a string with slashes
// (or an array of segments depending on match) — normalize to `KB/quality/capas`.
const slug = computed(() => {
  const s = route.params.slug
  return Array.isArray(s) ? s.join('/') : (s ?? '')
})
</script>

<template>
  <HelpArticleView :slug="slug" />
</template>
