<script setup>
/**
 * One doc pack on the Docs Home grid: name, readiness ring, verdict, cycle,
 * plus quick links to the three most-wanted docs. The card body navigates to
 * the pack home; quick links are separate targets below it (never nested <a>).
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  module: { type: Object, required: true },
})

const { quickLinksFor, cycleLabel } = useInternalDocs()

const quick = computed(() => quickLinksFor(props.module))
const quickEntries = computed(() =>
  [
    { doc: quick.value.overview, label: 'Overview' },
    { doc: quick.value.qaGuide, label: 'QA Guide' },
    { doc: quick.value.execSummary, label: 'Exec Summary' },
  ].filter((q) => q.doc),
)
</script>

<template>
  <div
    class="tw:flex tw:flex-col tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:shadow-flat tw:transition-shadow tw:hover:shadow-raised"
  >
    <RouterLink
      :to="getCompanyPath(`/docs/${module.slug}`)"
      class="tw:flex tw:flex-1 tw:flex-col tw:gap-3 tw:p-4 tw:no-underline"
      :aria-label="`Open ${module.name} documentation pack`"
    >
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
        <span class="tw:text-label tw:font-semibold tw:text-on-main tw:leading-snug">
          {{ module.name }}
        </span>
        <DocsScoreRing :score="module.score" :size="40" />
      </div>
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <DocsVerdictBadge :verdict="module.verdict" />
      </div>
      <div class="tw:mt-auto tw:flex tw:items-center tw:gap-3 tw:text-caption tw:text-secondary">
        <span v-if="module.cycle">Cycle {{ cycleLabel(module.cycle) }}</span>
        <span>{{ module.docCount }} docs</span>
      </div>
    </RouterLink>

    <div
      v-if="quickEntries.length"
      class="tw:flex tw:items-center tw:gap-1 tw:border-t tw:border-divider tw:px-2 tw:py-1.5"
    >
      <RouterLink
        v-for="q in quickEntries"
        :key="q.doc.id"
        :to="getCompanyPath(`/docs/${q.doc.id}`)"
        class="tw:rounded-md tw:px-2 tw:py-1 tw:text-caption tw:text-secondary tw:no-underline tw:transition-colors tw:hover:bg-main-hover tw:hover:text-primary"
      >
        {{ q.label }}
      </RouterLink>
    </div>
  </div>
</template>
