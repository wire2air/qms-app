<script setup>
import { IconSchool, IconCircleCheck, IconClock } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

const filters = ref({ status: 'ACTIVE', trainingId: null })

const instances = useLiveQueryWithDeps(
  [() => filters.value.status, () => filters.value.trainingId],
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

const STATUS_OPTIONS = [
  { id: null, name: 'All' },
  { id: 'ACTIVE', name: 'Active' },
  { id: 'PENDING_VERIFICATION', name: 'Pending Verification' },
  { id: 'COMPLETED', name: 'Completed' },
  { id: 'CANCELLED', name: 'Cancelled' },
]
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconSchool"
      title="Training Instances"
      subtitle="Track launched trainings and assignee progress."
    />

    <!-- Stat Cards -->
    <div class="tw:grid tw:grid-cols-3 tw:gap-3">
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

    <!-- Filters -->
    <div class="tw:flex tw:gap-1 tw:flex-wrap">
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

    <!-- Instances list -->
    <div class="tw:flex tw:flex-col tw:gap-2">
      <p
        v-if="!instances.length"
        class="tw:text-sm tw:text-secondary tw:italic tw:p-4 tw:text-center"
      >
        No instances found.
      </p>
      <TrainingInstanceRow
        v-for="instance in instances"
        :key="instance.id"
        :instance="instance"
        :showTrainingName="true"
        :showManager="true"
      />
    </div>
  </BasePage>
</template>
