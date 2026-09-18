<script setup>
import {
  IconSparkles,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconAlertTriangle,
  IconExternalLink,
} from '@tabler/icons-vue'
import { useSimilarRecords } from '@/composables/useSimilarRecords'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * AI similarity panel (Phase 5).
 *
 * Mount on a create form. Pass reactive refs (title / description) via
 * getText. As the user types, the panel quietly fetches similar records
 * and shows the closest matches so they don't unknowingly duplicate
 * existing work.
 *
 * Default state is collapsed — the panel only auto-opens when there are
 * matches above a higher "concerning" similarity threshold (default 0.75).
 */

const props = defineProps({
  entityType: { type: String, required: true }, // 'Capa' | 'Nonconformance'
  getText: { type: Function, required: true },
  // Optional: restrict the search to specific types. Default: all source types.
  searchInTypes: { type: Array, default: null },
  // Cosine similarity floor — passed to find_similar. 0.6 is a reasonable
  // "show me anything resembling this" default; can be lowered.
  threshold: { type: Number, default: 0.6 },
  // Records above this similarity are flagged as potential duplicates and
  // auto-expand the panel.
  alarmThreshold: { type: Number, default: 0.78 },
  limit: { type: Number, default: 5 },
  minLength: { type: Number, default: 25 },
})

const { matches, loading, error } = useSimilarRecords({
  getText: () => props.getText(),
  entityTypes: props.searchInTypes,
  threshold: props.threshold,
  limit: props.limit,
  minLength: props.minLength,
})

const expanded = ref(false)

// Auto-expand when something concerning shows up.
const concerning = computed(() =>
  matches.value.filter((m) => m.similarity >= props.alarmThreshold),
)
watch(concerning, (rows) => {
  if (rows.length > 0) expanded.value = true
})

const headerLabel = computed(() => {
  if (loading.value && matches.value.length === 0) return 'Checking for similar records…'
  if (concerning.value.length > 0) {
    return `${concerning.value.length} record${concerning.value.length === 1 ? '' : 's'} look very similar`
  }
  if (matches.value.length > 0) {
    return `${matches.value.length} possibly similar record${matches.value.length === 1 ? '' : 's'}`
  }
  return 'No similar records — this looks new'
})

const headerSeverity = computed(() => {
  if (concerning.value.length > 0) return 'alarm'
  if (matches.value.length > 0) return 'info'
  return 'neutral'
})

const headerClass = computed(() => {
  switch (headerSeverity.value) {
    case 'alarm':
      return 'tw:border-amber-300 tw:bg-amber-50 tw:text-amber-900'
    case 'info':
      return 'tw:border-primary/20 tw:bg-primary/5 tw:text-on-main'
    case 'neutral':
    default:
      return 'tw:border-divider tw:bg-sidebar tw:text-secondary'
  }
})

function pathFor(match) {
  switch (match.entityType) {
    case 'Capa':
      return getCompanyPath(`/capas/${match.entityId}`)
    case 'Nonconformance':
      return getCompanyPath(`/nonconformances/${match.entityId}`)
    case 'Document':
      return getCompanyPath(`/documents/${match.entityId}`)
    default:
      return null
  }
}

function similarityPct(s) {
  return `${Math.round((s ?? 0) * 100)}%`
}

function statusClass(statusId) {
  // Best-effort coloring — defaults grey when we don't recognise the id.
  const closed = ['CLOSED', 'VERIFIED', 'COMPLETED', 'EFFECTIVE', 'ARCHIVED']
  const open = ['OPEN', 'IN_PROGRESS', 'DRAFT', 'IN_REVIEW']
  if (closed.includes(statusId)) return 'tw:bg-green-100 tw:text-green-800'
  if (open.includes(statusId)) return 'tw:bg-blue-100 tw:text-blue-800'
  return 'tw:bg-gray-100 tw:text-gray-700'
}
</script>

<template>
  <div
    class="tw:rounded-lg tw:border tw:overflow-hidden tw:transition-colors"
    :class="headerClass"
  >
    <button
      class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-left"
      @click="expanded = !expanded"
    >
      <IconSparkles :size="14" class="tw:flex-none tw:text-primary" />
      <span class="tw:flex-1">{{ headerLabel }}</span>
      <IconLoader2 v-if="loading" :size="14" class="tw:animate-spin tw:text-secondary tw:flex-none" />
      <component
        :is="expanded ? IconChevronDown : IconChevronRight"
        :size="14"
        class="tw:text-secondary tw:flex-none"
      />
    </button>

    <div v-if="expanded" class="tw:border-t tw:px-3 tw:py-2 tw:bg-main">
      <div
        v-if="concerning.length > 0"
        class="tw:flex tw:items-start tw:gap-2 tw:p-2 tw:mb-2 tw:rounded tw:bg-amber-100 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
      >
        <IconAlertTriangle :size="14" class="tw:mt-0.5 tw:flex-none" />
        <span>
          Before creating this {{ entityType === 'Capa' ? 'CAPA' : 'NC' }}, check whether the existing
          high-similarity records below already cover the situation. Creating a duplicate splits
          attention and weakens trend analysis.
        </span>
      </div>

      <div v-if="matches.length === 0 && !loading" class="tw:text-xs tw:text-secondary tw:py-1">
        Nothing similar found yet.
      </div>

      <div v-else class="tw:flex tw:flex-col tw:gap-1.5">
        <RouterLink
          v-for="m in matches"
          :key="`${m.entityType}-${m.entityId}`"
          :to="pathFor(m)"
          target="_blank"
          class="tw:flex tw:items-start tw:gap-2 tw:p-2 tw:rounded tw:border tw:border-divider tw:hover:bg-main-hover tw:transition-colors tw:no-underline"
        >
          <div class="tw:flex tw:flex-col tw:items-center tw:flex-none tw:w-12">
            <span
              class="tw:text-xs tw:font-bold"
              :class="m.similarity >= alarmThreshold ? 'tw:text-amber-700' : 'tw:text-primary'"
            >
              {{ similarityPct(m.similarity) }}
            </span>
            <span class="tw:text-micro tw:text-secondary">match</span>
          </div>
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
              <span
                v-if="m.code"
                class="tw:text-xs tw:px-1.5 tw:py-0.5 tw:rounded tw:bg-main-hover tw:text-secondary"
              >{{ m.code }}</span>
              <span
                class="tw:text-xs tw:px-1.5 tw:py-0.5 tw:rounded tw:font-semibold"
                :class="statusClass(m.statusId)"
              >
                {{ m.statusId || '—' }}
              </span>
              <span class="tw:text-xs tw:text-secondary">{{ m.entityType }}</span>
            </div>
            <div class="tw:text-sm tw:text-on-main tw:mt-0.5 tw:truncate">
              {{ m.title || '(no title)' }}
            </div>
          </div>
          <IconExternalLink :size="14" class="tw:text-secondary tw:flex-none tw:mt-0.5" />
        </RouterLink>
      </div>

      <div
        v-if="error"
        class="tw:flex tw:items-start tw:gap-2 tw:mt-2 tw:p-2 tw:rounded tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-xs"
      >
        <IconAlertTriangle :size="12" class="tw:mt-0.5 tw:flex-none" />
        <span>{{ error.message }}</span>
      </div>
    </div>
  </div>
</template>
