<script setup>
/**
 * Legacy document print URL. Forwards any old bookmarks to the centralised
 * /print?module=Document&id=...&versionId=... endpoint.
 *
 * Safe to delete once you're confident nothing links here directly.
 */
defineOptions({ name: 'DocumentPrintLegacyRedirect' })

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const { id, versionId } = route.query
  if (!id) {
    router.replace({ path: route.path.replace(/\/documents\/print$/, '/documents') })
    return
  }
  const params = { module: 'Document', id }
  if (versionId) params.versionId = versionId
  // Build path to /<companyCode>/print
  const newPath = route.path.replace(/\/documents\/print$/, '/print')
  router.replace({ path: newPath, query: params })
})
</script>

<template>
  <div class="tw:p-8 tw:text-secondary tw:text-sm">Redirecting…</div>
</template>
