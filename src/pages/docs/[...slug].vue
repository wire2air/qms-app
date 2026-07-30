<script setup>
/**
 * /docs/<path> — catch-all for the Internal Docs Center. Resolves the path
 * against the manifest: a module slug renders the pack home (/docs/capa), a
 * doc id renders the reading view (/docs/capa/07-state-machine, /docs/workflows).
 */
import { IconBook } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineOptions({ name: 'InternalDocsSlugPage' })

const route = useRoute()
const { manifest, manifestError, loadManifest, resolvePath, openSearch } = useInternalDocs()

loadManifest().catch(() => {
  // handled by the error state below
})

const slugPath = computed(() => {
  const slug = route.params.slug
  return Array.isArray(slug) ? slug.join('/') : String(slug || '')
})

const resolved = computed(() => resolvePath(slugPath.value))

const headerTitle = computed(() => {
  if (resolved.value.kind === 'module') return resolved.value.module.name
  if (resolved.value.kind === 'doc') return resolved.value.doc.title
  return 'Internal Docs'
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
    <PageHeader :icon="IconBook" :title="headerTitle" />

    <div v-if="manifestError" class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-16">
      <p class="tw:text-secondary">Could not load the documentation manifest.</p>
      <button
        class="tw:rounded-lg tw:border tw:border-divider tw:px-4 tw:py-2 tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
        @click="loadManifest"
      >
        Retry
      </button>
    </div>

    <div v-else-if="!manifest" class="tw:flex tw:justify-center tw:py-16">
      <BaseSpinner />
    </div>

    <DocsPackHome v-else-if="resolved.kind === 'module'" :moduleSlug="resolved.module.slug" />
    <DocsDocView v-else-if="resolved.kind === 'doc'" :docId="resolved.doc.id" />

    <div v-else class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-16">
      <p class="tw:text-secondary">No doc at “{{ slugPath }}”.</p>
      <RouterLink
        :to="getCompanyPath('/docs')"
        class="tw:rounded-lg tw:border tw:border-divider tw:px-4 tw:py-2 tw:text-sm tw:text-on-main tw:no-underline tw:hover:bg-main-hover"
      >
        Back to Internal Docs
      </RouterLink>
    </div>

    <DocsSearchDialog />
  </BasePage>
</template>
