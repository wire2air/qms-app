<script setup>
import { IconClock, IconUsers, IconCircleCheck } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { DateTime } from 'luxon'

const props = defineProps({
  instance: { type: Object, required: true },
  showTrainingName: { type: Boolean, default: false },
  showManager: { type: Boolean, default: false },
})

const assignees = useLiveQueryWithDeps(
  [() => props.instance.id],
  async (db, [id]) => db.TrainingAssignee.where('trainingInstanceId', id).exec(),

  { models: ['TrainingAssignee'], initial: [] },
)

const training = useLiveQueryWithDeps(
  [() => props.instance.trainingId],

  async (db, [id]) => (id ? db.Training.findByPk(id) : null),
  { models: ['Training'] },
)

const stats = computed(() => {
  const all = assignees.value
  const total = all.length
  const completed = all.filter((a) => a.status === 'COMPLETED').length
  const failed = all.filter((a) => a.status === 'FAILED').length
  const submitted = completed + failed
  const progress = total > 0 ? Math.round((submitted / total) * 100) : 0
  const passRate = total > 0 ? Math.round((completed / total) * 100) : 0
  return { total, completed, failed, submitted, progress, passRate }
})

const isOverdue = computed(
  () =>
    props.instance.dueDate &&
    props.instance.dueDate < DateTime.now() &&
    props.instance.status === 'ACTIVE',
)

const completedAt = computed(() => {
  if (props.instance.status !== 'COMPLETED') return null
  const dates = assignees.value.map((a) => a.completedAt).filter(Boolean)
  if (!dates.length) return null
  return dates.reduce((max, d) => (d > max ? d : max), dates[0])
})
</script>

<template>
  <RouterLink
    :to="getCompanyPath(`/training-instances/${instance.id}`)"
    class="tw:flex tw:items-center tw:gap-4 tw:px-4 tw:py-3 tw:rounded-lg tw:border tw:bg-white tw:hover:bg-gray-50 tw:transition-colors tw:no-underline"
    :class="isOverdue ? 'tw:border-red-200' : 'tw:border-divider'"
  >
    <!-- Training name + manager (Instances menu only) -->
    <div v-if="showTrainingName" class="tw:flex tw:flex-col tw:min-w-0 tw:flex-1">
      <span class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:truncate">
        {{ instance.snapshot?.title || training?.title || '—' }}
      </span>
      <span
        v-if="showManager"
        class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1 tw:mt-0.5"
      >
        Manager:
        <UserBadgeById v-if="training?.managerId" :userId="training.managerId" />
        <span v-else>—</span>
      </span>
    </div>

    <!-- Launched -->
    <div class="tw:flex tw:flex-col tw:shrink-0 tw:w-24">
      <span class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider tw:font-medium">Launched</span>
      <span class="tw:text-sm tw:text-on-sidebar">{{
        instance.createdAt?.formatDate('date')
      }}</span>
    </div>

    <!-- Due / Completed -->
    <div class="tw:flex tw:flex-col tw:shrink-0 tw:w-36">
      <span
        v-if="completedAt"
        class="tw:text-caption tw:text-green-600 tw:uppercase tw:tracking-wider tw:font-medium tw:flex tw:items-center tw:gap-1"
      >
        <IconCircleCheck :size="11" />
        Completed
      </span>
      <span
        v-else
        class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider tw:font-medium tw:flex tw:items-center tw:gap-1"
      >
        <IconClock :size="11" />
        Due
      </span>
      <span v-if="completedAt" class="tw:text-sm tw:text-green-600 tw:font-medium">
        {{ completedAt.formatDate('date') }}
      </span>
      <span
        v-else
        class="tw:text-sm"
        :class="isOverdue ? 'tw:text-red-600 tw:font-medium' : 'tw:text-on-sidebar'"
      >
        {{ instance.dueDate ? instance.dueDate.formatDate('date') : '—' }}
        <span v-if="isOverdue" class="tw:text-xs">(overdue)</span>
      </span>
    </div>

    <!-- Assigned -->
    <div class="tw:flex tw:flex-col tw:shrink-0 tw:w-20">
      <span
        class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider tw:font-medium tw:flex tw:items-center tw:gap-1"
      >
        <IconUsers :size="11" />
        Assigned
      </span>
      <span class="tw:text-sm tw:font-medium tw:text-on-sidebar">{{ stats.total }}</span>
    </div>

    <!-- Completion progress -->
    <div class="tw:flex tw:flex-col tw:flex-1 tw:min-w-32">
      <div class="tw:flex tw:justify-between tw:items-baseline">
        <span class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider tw:font-medium">Progress</span>
        <span class="tw:text-xs tw:text-secondary">{{ stats.submitted }}/{{ stats.total }}</span>
      </div>
      <div class="tw:h-1.5 tw:bg-gray-100 tw:rounded-full tw:overflow-hidden tw:mt-1">
        <div
          class="tw:h-full tw:bg-primary tw:rounded-full tw:transition-all"
          :style="{ width: `${stats.progress}%` }"
        />
      </div>
    </div>

    <!-- Pass rate -->
    <div class="tw:flex tw:flex-col tw:shrink-0 tw:w-20 tw:items-end">
      <span class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider tw:font-medium">Pass rate</span>
      <span
        class="tw:text-sm tw:font-semibold"
        :class="
          stats.passRate >= 70
            ? 'tw:text-green-600'
            : stats.completed === 0 && stats.failed === 0
              ? 'tw:text-secondary'
              : 'tw:text-amber-600'
        "
      >
        {{ stats.passRate }}%
      </span>
    </div>

    <!-- Status -->
    <div class="tw:shrink-0">
      <TrainingInstanceStatusBadgeById :statusId="instance.status" />
    </div>
  </RouterLink>
</template>
