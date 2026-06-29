<script setup>
import { IconSchool, IconCircleCheck, IconClock } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `instances`.
const list = useListLayout({
  filters: { status: 'ACTIVE', trainingId: null },
  total: () => instances.value.length,
  empty: () => instances.value.length === 0,
  syncUrl: true,
})

const instances = useLiveQueryWithDeps(
  [() => list.filters.value.status, () => list.filters.value.trainingId],
  async (db, [status, trainingId]) => {
    let results = await db.TrainingInstance.where().exec()
    if (status) results = results.filter((r) => r.status === status)
    if (trainingId) results = results.filter((r) => r.trainingId === trainingId)
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },

  { models: ['TrainingInstance'], initial: [] },
)

const allInstances = useLiveQuery((db) => db.TrainingInstance.where().exec(), {
  models: ['TrainingInstance'],
  initial: [],
})

const stats = computed(() => {
  const all = allInstances.value
  const now = DateTime.now()
  return {
    active: all.filter((i) => i.status === 'ACTIVE').length,
    completed: all.filter((i) => i.status === 'COMPLETED').length,
    overdue: all.filter((i) => i.status === 'ACTIVE' && i.dueDate && i.dueDate < now).length,
  }
})

const STATUS_PILLS = [
  { value: null, label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]
</script>

<template>
  <BaseListLayout
    title="Training Instances"
    :icon="IconSchool"
    subtitle="Track launched trainings and assignee progress."
    :state="list.state.value"
    :emptyIcon="IconSchool"
    :emptyTitle="
      list.hasActiveFilters.value
        ? 'No instances match your filters'
        : 'No instances found'
    "
  >
    <template #stats>
      <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3">
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconSchool :size="20" />
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
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-green-50 tw:text-green-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconCircleCheck :size="20" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Completed
            </div>
            <div class="tw:text-2xl tw:font-black tw:text-on-sidebar">{{ stats.completed }}</div>
          </div>
        </div>
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:gap-4"
        >
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
          >
            <IconClock :size="20" />
          </div>
          <div>
            <div class="tw:text-xs tw:uppercase tw:tracking-tight tw:font-bold tw:text-secondary">
              Overdue
            </div>
            <div
              class="tw:text-2xl tw:font-black"
              :class="stats.overdue > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
            >
              {{ stats.overdue }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #quick-filters>
      <BaseQuickFilterPills
        v-model="list.filters.value.status"
        ariaLabel="Training instance status filters"
        :pills="STATUS_PILLS"
      />
    </template>

    <!-- Instances list -->
    <div class="tw:flex tw:flex-col tw:gap-2">
      <TrainingInstanceRow
        v-for="instance in instances"
        :key="instance.id"
        :instance="instance"
        :showTrainingName="true"
        :showManager="true"
      />
    </div>
  </BaseListLayout>
</template>
