<script setup>
import { IconClipboardCheck, IconUsers } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'

const props = defineProps({
  // When provided, scope the page to a single instance (deep-link from instance detail page).
  instanceId: { type: String, default: null },
})

const userId = computed(() => currentSession.value?.userId)
const search = ref('')

// Trainings I manage
const myTrainings = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    if (!uid) return []
    const all = await db.Training.where().exec()
    return all.filter((t) => t.managerId === uid)
  },
  { initial: [] },
)
const myTrainingIds = computed(() => myTrainings.value.map((t) => t.id))

// Instances that still need manager verification — either explicitly in
// PENDING_VERIFICATION or legacy COMPLETED instances with un-verified assignees.
const pendingInstancesWithCounts = useLiveQueryWithDeps(
  [() => myTrainingIds.value, () => props.instanceId],
  async (db, [ids, scopedInstanceId]) => {
    if (!ids?.length) return []
    let candidates
    if (scopedInstanceId) {
      const one = await db.TrainingInstance.findByPk(scopedInstanceId)
      if (!one || !ids.includes(one.trainingId)) return []
      if (!['PENDING_VERIFICATION', 'COMPLETED'].includes(one.status)) return []
      candidates = [one]
    } else {
      const all = await db.TrainingInstance.where().exec()
      candidates = all.filter(
        (i) => ['PENDING_VERIFICATION', 'COMPLETED'].includes(i.status) && ids.includes(i.trainingId),
      )
    }
    const results = []
    for (const inst of candidates) {
      const assignees = await db.TrainingAssignee.where('trainingInstanceId', inst.id).exec()
      const pending = assignees.filter((a) => a.status === 'COMPLETED')
      if (pending.length > 0) {
        results.push({ instance: inst, pendingCount: pending.length, totalCount: assignees.length })
      }
    }
    // Newest first
    results.sort((a, b) => (b.instance.createdAt?.toMillis?.() ?? 0) - (a.instance.createdAt?.toMillis?.() ?? 0))
    return results
  },
  { initial: [] },
)

const filteredInstances = computed(() => {
  if (!search.value) return pendingInstancesWithCounts.value
  const needle = search.value.toLowerCase()
  return pendingInstancesWithCounts.value.filter((row) =>
    row.instance.snapshot?.title?.toLowerCase().includes(needle),
  )
})

// Selected instance + auto-default to first available
const selectedInstanceId = ref(props.instanceId)
watchEffect(() => {
  if (!selectedInstanceId.value && filteredInstances.value.length > 0) {
    selectedInstanceId.value = filteredInstances.value[0].instance.id
  }
})

const selectedInstance = computed(() =>
  pendingInstancesWithCounts.value.find((r) => r.instance.id === selectedInstanceId.value)?.instance,
)

// Stats
const closedThisWeek = useLiveQuery(
  async (db) => {
    const all = await db.TrainingVerification.where().exec()
    const cutoff = DateTime.now().startOf('week')
    return all.filter((v) => v.signedAt && v.signedAt >= cutoff).length
  },
  { initial: 0 },
)

function onVerified() {
  // The current instance may still have other pending assignees; the live query refreshes,
  // and if the instance disappears from the list (all verified), pick the next one.
  setTimeout(() => {
    const stillThere = pendingInstancesWithCounts.value.some((r) => r.instance.id === selectedInstanceId.value)
    if (!stillThere) {
      selectedInstanceId.value = filteredInstances.value[0]?.instance.id ?? null
    }
  }, 0)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Training Verification</h2>
      </div>
    </SafeTeleport>

    <!-- Top stats -->
    <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:justify-between">
      <div>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-sidebar">Training Verification Dashboard</h1>
        <p class="tw:text-sm tw:text-secondary">Manager review and competency verification queue</p>
      </div>
      <div class="tw:flex tw:gap-3">
        <div class="tw:bg-blue-50 tw:rounded-lg tw:px-4 tw:py-2 tw:border tw:border-blue-200">
          <p class="tw:text-xs tw:text-blue-700 tw:font-medium">Pending Instances</p>
          <p class="tw:text-2xl tw:font-black tw:text-blue-700">{{ filteredInstances.length }}</p>
        </div>
        <div class="tw:bg-green-50 tw:rounded-lg tw:px-4 tw:py-2 tw:border tw:border-green-200">
          <p class="tw:text-xs tw:text-green-700 tw:font-medium">Closed This Week</p>
          <p class="tw:text-2xl tw:font-black tw:text-green-700">{{ closedThisWeek }}</p>
        </div>
      </div>
    </div>

    <!-- Body: left list + right panel -->
    <div class="tw:grid tw:grid-cols-[minmax(320px,1fr)_2fr] tw:gap-4 tw:flex-1 tw:min-h-0">
      <!-- Pending instances list -->
      <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3 tw:overflow-y-auto">
        <div>
          <p class="tw:text-sm tw:font-bold tw:text-on-sidebar">Pending Training Instances</p>
          <p class="tw:text-xs tw:text-secondary">Instances awaiting competency verification</p>
        </div>
        <BaseTextInput v-model="search" placeholder="Search training..." size="sm" />

        <p v-if="!filteredInstances.length" class="tw:text-sm tw:text-secondary tw:italic tw:p-4 tw:text-center">
          No instances pending verification.
        </p>

        <div v-else class="tw:flex tw:flex-col tw:gap-2">
          <div
            v-for="row in filteredInstances"
            :key="row.instance.id"
            class="tw:p-3 tw:rounded-lg tw:border tw:cursor-pointer tw:transition-colors"
            :class="selectedInstanceId === row.instance.id ? 'tw:border-primary tw:bg-blue-50' : 'tw:border-divider tw:hover:bg-gray-50'"
            @click="selectedInstanceId = row.instance.id"
          >
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
              <span class="tw:text-sm tw:font-semibold tw:text-on-sidebar tw:truncate">
                {{ row.instance.snapshot?.title || '—' }}
              </span>
              <TrainingInstanceStatusBadgeById :statusId="row.instance.status" :showDot="false" />
            </div>
            <div class="tw:flex tw:items-center tw:gap-3 tw:mt-2 tw:text-xs tw:text-secondary">
              <span class="tw:flex tw:items-center tw:gap-1 tw:font-medium tw:text-amber-700">
                <IconUsers :size="12" />
                {{ row.pendingCount }} pending
              </span>
              <span>/ {{ row.totalCount }} total</span>
              <span class="tw:ml-auto">Launched {{ row.instance.createdAt?.formatDate('date') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right panel -->
      <div class="tw:overflow-y-auto">
        <TrainingVerificationPanel
          v-if="selectedInstance"
          :key="selectedInstance.id"
          :instance="selectedInstance"
          @verified="onVerified"
        />
        <div v-else class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-8 tw:text-center tw:text-secondary tw:italic">
          <IconClipboardCheck :size="48" class="tw:mx-auto tw:mb-3 tw:text-gray-300" />
          <p>Select a training instance from the left to begin verification.</p>
        </div>
      </div>
    </div>
  </div>
</template>
