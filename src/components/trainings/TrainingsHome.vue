<script setup>
import { IconBook, IconCircleCheck, IconClock, IconPlus, IconSchool } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canCreate = computed(() => isAllowed(['trainings:create']))
const canUpdate = computed(() => isAllowed(['trainings:update']))
const canDelete = computed(() => isAllowed(['trainings:delete']))

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `trainings`.
const list = useListLayout({
  filters: { status: null },
  total: () => trainings.value.length,
  empty: () => trainings.value.length === 0,
  syncUrl: true,
})

// Document-driven trainings (sourceDocumentId != null) are hidden — their config
// lives on the document and they're an implementation detail.
const allTrainings = useLiveQuery(
  async (db) => {
    const all = await db.Training.where().exec()
    return all.filter((t) => !t.sourceDocumentId)
  },

  { models: ['Training'], initial: [] },
)

const trainings = useLiveQueryWithDeps(
  [() => list.filters.value.status],
  async (db, [status]) => {
    let results = await db.Training.where().exec()
    results = results.filter((r) => !r.sourceDocumentId)
    if (status) results = results.filter((r) => r.status === status)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['Training'], initial: [] },
)

const stats = computed(() => {
  const all = allTrainings.value
  return {
    total: all.length,
    active: all.filter((t) => t.status === 'ACTIVE').length,
    draft: all.filter((t) => t.status === 'DRAFT').length,
    archived: all.filter((t) => t.status === 'ARCHIVED').length,
  }
})

const statusPills = computed(() => [
  { value: null, label: 'All' },
  { value: 'DRAFT', label: 'Draft', count: stats.value.draft },
  { value: 'ACTIVE', label: 'Active', count: stats.value.active },
  { value: 'ARCHIVED', label: 'Archived', count: stats.value.archived },
])
</script>

<template>
  <BaseListLayout
    title="Training Library"
    :icon="IconBook"
    subtitle="Create and manage training programs for your team."
    :state="list.state.value"
    :emptyIcon="IconBook"
    :emptyTitle="list.hasActiveFilters.value ? 'No trainings match your filters' : 'No trainings yet'"
  >
    <template #actions>
      <BaseButton
        v-if="canCreate"
        variant="primary"
        @click="router.push(getCompanyPath('/trainings/create'))"
      >
        <IconPlus :size="16" class="tw:mr-1" /> New Training
      </BaseButton>
    </template>

    <template #stats>
      <!-- Stat Cards -->
      <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3">
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconBook :size="20" />
          </div>
          <div>
            <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
              Total
            </div>
            <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ stats.total }}</div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-green-50 tw:text-green-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconCircleCheck :size="20" />
          </div>
          <div>
            <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
              Active
            </div>
            <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ stats.active }}</div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-50 tw:text-gray-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconClock :size="20" />
          </div>
          <div>
            <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
              Draft
            </div>
            <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ stats.draft }}</div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconSchool :size="20" />
          </div>
          <div>
            <div class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary">
              Archived
            </div>
            <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ stats.archived }}</div>
          </div>
        </div>
      </div>
    </template>

    <template #quick-filters>
      <BaseQuickFilterPills
        v-model="list.filters.value.status"
        ariaLabel="Training status quick filters"
        :pills="statusPills"
      />
    </template>

    <TrainingsTable :rows="trainings" :canUpdate="canUpdate" :canDelete="canDelete" />
  </BaseListLayout>
</template>
