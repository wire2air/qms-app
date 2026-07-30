<script setup>
/**
 * Pack home — the landing page of one module's documentation pack: readiness
 * header (verdict, score, cycle) plus the grouped, annotated table of contents
 * (Understand / How It Works / Quality & Testing / Assessment / Prior Cycle).
 */
import { IconArrowLeft, IconSearch } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  moduleSlug: { type: String, required: true },
})

const { modulesBySlug, quickLinksFor, cycleLabel, openSearch } = useInternalDocs()

const module = computed(() => modulesBySlug.value.get(props.moduleSlug))

const quickEntries = computed(() => {
  if (!module.value) return []
  const quick = quickLinksFor(module.value)
  return [
    { doc: quick.execSummary, label: 'Read Exec Summary' },
    { doc: quick.qaGuide, label: 'QA Guide' },
    { doc: quick.overview, label: 'Overview' },
  ].filter((q) => q.doc)
})
</script>

<template>
  <div v-if="module" class="tw:flex tw:flex-col tw:gap-6">
    <RouterLink
      :to="getCompanyPath('/docs')"
      class="tw:flex tw:items-center tw:gap-1.5 tw:self-start tw:text-caption tw:text-secondary tw:no-underline tw:hover:text-primary"
    >
      <IconArrowLeft :size="14" /> All docs
    </RouterLink>

    <!-- Pack header -->
    <div
      class="tw:flex tw:flex-wrap tw:items-center tw:gap-4 tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-5 tw:shadow-flat"
    >
      <DocsScoreRing :score="module.score" :size="56" />
      <div class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-1.5">
        <span class="tw:text-section-title tw:font-semibold tw:text-on-main">{{ module.name }}</span>
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-caption tw:text-secondary">
          <DocsVerdictBadge :verdict="module.verdict" />
          <span v-if="module.cycle">Cycle {{ cycleLabel(module.cycle) }} · source-verified</span>
          <span>{{ module.docCount }} docs</span>
        </div>
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-2">
        <RouterLink
          v-for="q in quickEntries"
          :key="q.doc.id"
          :to="getCompanyPath(`/docs/${q.doc.id}`)"
          class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm tw:text-on-main tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
        >
          {{ q.label }}
        </RouterLink>
        <button
          type="button"
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm tw:text-on-main tw:transition-colors tw:hover:bg-main-hover"
          aria-label="Search internal docs"
          @click="openSearch"
        >
          <IconSearch :size="15" /> Search
        </button>
      </div>
    </div>

    <!-- Grouped doc index -->
    <PageSection v-for="group in module.groups" :key="group.key" :title="group.label">
      <div
        class="tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider tw:bg-card"
      >
        <RouterLink
          v-for="doc in group.docs"
          :key="doc.id"
          :to="getCompanyPath(`/docs/${doc.id}`)"
          class="tw:flex tw:items-baseline tw:gap-3 tw:px-4 tw:py-3 tw:no-underline tw:transition-colors tw:hover:bg-main-hover"
        >
          <span
            v-if="doc.number != null"
            class="tw:w-7 tw:shrink-0 tw:text-caption tw:tabular-nums tw:text-secondary"
          >
            {{ String(doc.number).padStart(2, '0') }}
          </span>
          <span class="tw:shrink-0 tw:text-sm tw:font-medium tw:text-on-main">{{ doc.title }}</span>
          <span
            v-if="doc.superseded"
            class="tw:shrink-0 tw:rounded-full tw:bg-main-hover tw:px-2 tw:py-0.5 tw:text-caption tw:text-secondary"
          >
            Superseded
          </span>
          <span v-if="doc.description" class="tw:truncate tw:text-caption tw:text-secondary">
            {{ doc.description }}
          </span>
        </RouterLink>
      </div>
    </PageSection>
  </div>
</template>
