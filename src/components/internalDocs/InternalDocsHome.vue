<script setup>
/**
 * Docs Home — landing page body of the Internal Docs Center: search trigger,
 * continue-reading and pinned rows, the module-pack card grid, and the
 * top-level platform docs grouped by category.
 */
import { IconSearch, IconBook, IconStar, IconHistory, IconFiles } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const {
  manifest,
  manifestError,
  loadManifest,
  docsById,
  totalDocCount,
  recentIds,
  favoriteIds,
  openSearch,
} = useInternalDocs()

loadManifest().catch(() => {
  // surfaced via manifestError + the request wrapper's toast
})

const FLAT_CATEGORY_ORDER = [
  'Cross-cutting systems',
  'Runbooks',
  'Plans',
  'Design notes (superseded)',
]

function resolveDocs(ids) {
  return ids.map((id) => docsById.value.get(id)).filter(Boolean)
}

const recentDocs = computed(() => resolveDocs(recentIds.value))
const favoriteDocs = computed(() => resolveDocs(favoriteIds.value))

/**
 * Readiness filter — "show me the packs scoring under N". Deliberately a
 * below-threshold filter rather than a range: the question this grid gets asked
 * is "what is weakest", never "what sits between 40 and 60".
 *
 * No `required` on the BaseSelect — it auto-selects the first option when set,
 * which would silently apply a filter nobody chose.
 */
const SCORE_THRESHOLDS = [
  { label: 'Under 80', value: 80 },
  { label: 'Under 70', value: 70 },
  { label: 'Under 60', value: 60 },
  { label: 'Under 50', value: 50 },
  { label: 'Under 40', value: 40 },
]

const scoreThreshold = ref(null)

const visibleModules = computed(() => {
  const all = manifest.value?.modules ?? []
  if (scoreThreshold.value == null) return all
  // A pack whose exec summary has no parseable score is not "under" anything —
  // excluding it beats implying a readiness we never measured.
  return all
    .filter((m) => m.score != null && m.score < scoreThreshold.value)
    .sort((a, b) => a.score - b.score)
})

const scoredCount = computed(
  () => (manifest.value?.modules ?? []).filter((m) => m.score != null).length,
)

const flatByCategory = computed(() => {
  const groups = new Map()
  for (const d of manifest.value?.platformDocs ?? []) {
    if (!groups.has(d.category)) groups.set(d.category, [])
    groups.get(d.category).push(d)
  }
  return [...groups.entries()]
    .map(([category, docs]) => ({ category, docs }))
    .sort(
      (a, b) => FLAT_CATEGORY_ORDER.indexOf(a.category) - FLAT_CATEGORY_ORDER.indexOf(b.category),
    )
})

function docSubtitle(doc) {
  return doc.flat ? doc.groupLabel : `${doc.moduleName} · ${doc.groupLabel}`
}
</script>

<template>
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

  <template v-else>
    <!-- Search trigger -->
    <button
      class="tw:flex tw:w-full tw:items-center tw:gap-3 tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:px-4 tw:py-3 tw:text-left tw:text-secondary tw:shadow-flat tw:transition-shadow tw:hover:shadow-raised"
      aria-label="Search internal docs"
      @click="openSearch"
    >
      <IconSearch :size="18" />
      <span>Search {{ totalDocCount }} docs — try “TC-12”, “state machine”, “RLS”…</span>
      <kbd
        class="tw:ml-auto tw:rounded tw:border tw:border-divider tw:px-1.5 tw:py-0.5 tw:text-caption"
        >/</kbd
      >
    </button>

    <!-- Pinned -->
    <PageSection v-if="favoriteDocs.length" title="Pinned" :icon="IconStar">
      <div class="tw:flex tw:flex-wrap tw:gap-2">
        <RouterLink
          v-for="doc in favoriteDocs"
          :key="doc.id"
          :to="getCompanyPath(`/docs/${doc.id}`)"
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm tw:text-on-main tw:no-underline tw:hover:bg-main-hover"
        >
          {{ doc.title }}
          <span class="tw:text-caption tw:text-secondary"> · {{ docSubtitle(doc) }}</span>
        </RouterLink>
      </div>
    </PageSection>

    <!-- Continue reading -->
    <PageSection v-if="recentDocs.length" title="Continue reading" :icon="IconHistory">
      <div class="tw:flex tw:flex-wrap tw:gap-2">
        <RouterLink
          v-for="doc in recentDocs"
          :key="doc.id"
          :to="getCompanyPath(`/docs/${doc.id}`)"
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm tw:text-on-main tw:no-underline tw:hover:bg-main-hover"
        >
          {{ doc.title }}
          <span class="tw:text-caption tw:text-secondary"> · {{ docSubtitle(doc) }}</span>
        </RouterLink>
      </div>
    </PageSection>

    <!-- Module packs -->
    <PageSection title="Module Packs" :icon="IconBook">
      <template #actions>
        <div
          role="group"
          aria-label="Filter module packs by readiness score"
          class="tw:flex tw:items-center tw:gap-2"
        >
          <span v-if="scoreThreshold != null" class="tw:text-caption tw:text-secondary">
            {{ visibleModules.length }} of {{ scoredCount }}
          </span>
          <BaseSelect
            v-model="scoreThreshold"
            :options="SCORE_THRESHOLDS"
            optionLabel="label"
            optionValue="value"
            nullLabel="All scores"
            :clearable="true"
          />
        </div>
      </template>

      <ContentGrid v-if="visibleModules.length" min="17rem">
        <DocsModuleCard v-for="m in visibleModules" :key="m.slug" :module="m" />
      </ContentGrid>
      <p v-else class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary">
        No module pack scores under {{ scoreThreshold }}.
      </p>
    </PageSection>

    <!-- Platform docs -->
    <PageSection title="Platform Docs" :icon="IconFiles">
      <div class="tw:flex tw:flex-col tw:gap-5">
        <div v-for="group in flatByCategory" :key="group.category">
          <p class="tw:mb-2 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
            {{ group.category }}
          </p>
          <div class="tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider tw:bg-card">
            <RouterLink
              v-for="doc in group.docs"
              :key="doc.id"
              :to="getCompanyPath(`/docs/${doc.id}`)"
              class="tw:flex tw:items-baseline tw:gap-3 tw:px-4 tw:py-2.5 tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
            >
              <span class="tw:shrink-0 tw:text-sm tw:font-medium tw:text-on-main">{{ doc.title }}</span>
              <span
                v-if="doc.supersededBy"
                class="tw:shrink-0 tw:rounded-full tw:bg-main-hover tw:px-2 tw:py-0.5 tw:text-caption tw:text-secondary"
              >
                Superseded
              </span>
              <span v-if="doc.description" class="tw:truncate tw:text-caption tw:text-secondary">
                {{ doc.description }}
              </span>
            </RouterLink>
          </div>
        </div>
      </div>
    </PageSection>
  </template>
</template>
