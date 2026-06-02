<script setup>
import { IconBook, IconCircleCheck, IconClock, IconPlus, IconSchool } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canCreate = computed(() => isAllowed(['trainings:create']))
const canUpdate = computed(() => isAllowed(['trainings:update']))
const canDelete = computed(() => isAllowed(['trainings:delete']))

const filters = ref({ search: '', status: null })

// Document-driven trainings (sourceDocumentId != null) are hidden — their config
// lives on the document and they're an implementation detail.
const allTrainings = useLiveQuery(
  async (db) => {
    const all = await db.Training.where().exec()
    return all.filter((t) => !t.sourceDocumentId)
  },
  { initial: [] },
)

const trainings = useLiveQueryWithDeps(
  [() => filters.value.search, () => filters.value.status],
  async (db, [search, status]) => {
    let results = await db.Training.where().exec()
    results = results.filter((r) => !r.sourceDocumentId)
    if (status) results = results.filter((r) => r.status === status)
    if (search) {
      const q = search.toLowerCase()
      results = results.filter((r) => r.title?.toLowerCase().includes(q))
    }
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
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

const STATUS_OPTIONS = [
  { id: null, name: 'All' },
  { id: 'DRAFT', name: 'Draft' },
  { id: 'ACTIVE', name: 'Active' },
  { id: 'ARCHIVED', name: 'Archived' },
]
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Training Library</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton
        v-if="canCreate"
        variant="primary"
        @click="router.push(getCompanyPath('/trainings/create'))"
      >
        <IconPlus :size="16" class="tw:mr-1" /> New Training
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Training Library</div>
      <div class="tw:text-sm tw:text-secondary">
        Create and manage training programs for your team.
      </div>
    </div>

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
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Total
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.total }}</div>
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
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Active
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.active }}</div>
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
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Draft
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.draft }}</div>
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
          <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
            Archived
          </div>
          <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.archived }}</div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
      <BaseTextInput v-model="filters.search" placeholder="Search trainings..." class="tw:w-64" />
      <div class="tw:flex tw:gap-1">
        <button
          v-for="opt in STATUS_OPTIONS"
          :key="String(opt.id)"
          class="tw:px-3 tw:py-1.5 tw:rounded-lg tw:text-sm tw:font-medium tw:transition-colors"
          :class="
            filters.status === opt.id
              ? 'tw:bg-primary tw:text-white'
              : 'tw:bg-gray-100 tw:text-secondary tw:hover:bg-gray-200'
          "
          @click="filters.status = opt.id"
        >
          {{ opt.name }}
        </button>
      </div>
    </div>

    <TrainingsTable :rows="trainings" :canUpdate="canUpdate" :canDelete="canDelete" />
  </div>
</template>
