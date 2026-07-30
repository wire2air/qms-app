<script setup>
/**
 * /docs — Internal Docs Center home. Platform operators only (permissionGuard
 * gates the /docs subtree on platform-admin standing; the backend re-checks
 * every call with requirePlatformAdmin('readonly')).
 */
import { IconBook } from '@tabler/icons-vue'

defineOptions({ name: 'InternalDocsIndexPage' })

const { loadManifest, openSearch } = useInternalDocs()

loadManifest().catch(() => {
  // handled by InternalDocsHome's error state
})

useHotkeys([
  {
    keys: '/',
    description: 'Search Internal Docs',
    group: 'Internal Docs',
    handler: openSearch,
  },
])
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconBook" title="Internal Docs" />

    <InternalDocsHome />
    <DocsSearchDialog />
  </BasePage>
</template>
