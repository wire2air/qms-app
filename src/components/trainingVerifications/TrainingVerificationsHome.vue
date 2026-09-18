<script setup>
import { IconClipboardCheck, IconUsers } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'

const props = defineProps({
  // When provided, scope the page to a single instance (deep-link from instance detail page).
  instanceId: { type: String, default: null },
})

const userId = computed(() => currentSession.value?.userId)

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total` is a lazy getter that reads `filteredInstances`.
// NOTE: `empty` is intentionally omitted — this is a master-detail dashboard that
// always renders its two-column grid (the left list shows its own inline
// "no instances" message and the right panel shows a placeholder). Letting the
// layout swap to its empty-state would hide the search box + right panel and
// change behavior, so state stays 'ready' and inline empty handling is preserved.
const list = useListLayout({
  filters: { search: '' },
  total: () => filteredInstances.value.length,
  syncUrl: true,
})

// Trainings I manage, plus trainings with no manager set (fallback to launcher)
const myTrainings = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    if (!uid) return []
    const all = await db.Training.where().exec()
    return all.filter((t) => t.managerId === uid || !t.managerId)
  },

  { models: ['Training'], initial: [] },
)
const myTrainingIds = computed(() => myTrainings.value.map((t) => t.id))

// All my-training instances that have anything to verify or already verified.
// state='pending' when any assignee still awaits review (COMPLETED/FAILED),
// else 'completed' once everyone verifiable is VERIFIED.
const statusFilter = ref('pending') // 'all' | 'pending' | 'completed'
const verifiableInstances = useLiveQueryWithDeps(
  [() => myTrainingIds.value, () => props.instanceId],
  async (db, [ids, scopedInstanceId]) => {
    if (!ids?.length) return []
    let candidates
    if (scopedInstanceId) {
      const one = await db.TrainingInstance.findByPk(scopedInstanceId)
      candidates = one && ids.includes(one.trainingId) ? [one] : []
    } else {
      const all = await db.TrainingInstance.where().exec()
      candidates = all.filter((i) => ids.includes(i.trainingId))
    }
    const results = []
    for (const inst of candidates) {
      const assignees = await db.TrainingAssignee.where('trainingInstanceId', inst.id).exec()
      const pending = assignees.filter((a) => a.status === 'COMPLETED' || a.status === 'FAILED')
      const verified = assignees.filter((a) => a.status === 'VERIFIED')
      if (!pending.length && !verified.length) continue
      results.push({
        instance: inst,
        pendingCount: pending.length,
        verifiedCount: verified.length,
        totalCount: assignees.length,
        state: pending.length ? 'pending' : 'completed',
      })
    }
    results.sort(
      (a, b) =>
        (b.instance.createdAt?.toMillis?.() ?? 0) - (a.instance.createdAt?.toMillis?.() ?? 0),
    )
    return results
  },

  { models: ['TrainingInstance', 'TrainingAssignee'], initial: [] },
)

const statusChips = computed(() => [
  { value: 'all', label: 'All', count: verifiableInstances.value.length },
  {
    value: 'pending',
    label: 'Pending',
    count: verifiableInstances.value.filter((r) => r.state === 'pending').length,
  },
  {
    value: 'completed',
    label: 'Completed',
    count: verifiableInstances.value.filter((r) => r.state === 'completed').length,
  },
])

const filteredInstances = computed(() => {
  let rows = verifiableInstances.value
  if (statusFilter.value !== 'all') rows = rows.filter((r) => r.state === statusFilter.value)
  if (list.filters.value.search) {
    const needle = list.filters.value.search.toLowerCase()
    rows = rows.filter((r) => r.instance.snapshot?.title?.toLowerCase().includes(needle))
  }
  return rows
})

// Selected instance + auto-default to first available
const selectedInstanceId = ref(props.instanceId)
watchEffect(() => {
  if (!selectedInstanceId.value && filteredInstances.value.length > 0) {
    selectedInstanceId.value = filteredInstances.value[0].instance.id
  }
})

const selectedInstance = computed(
  () => verifiableInstances.value.find((r) => r.instance.id === selectedInstanceId.value)?.instance,
)

// Stats
const closedThisWeek = useLiveQuery(
  async (db) => {
    const all = await db.TrainingVerification.where().exec()
    const cutoff = DateTime.now().startOf('week')
    return all.filter((v) => v.signedAt && v.signedAt >= cutoff).length
  },

  { models: ['TrainingVerification'], initial: 0 },
)

function onVerified() {
  // The current instance may still have other pending assignees; the live query refreshes,
  // and if the instance disappears from the list (all verified), pick the next one.
  setTimeout(() => {
    const stillThere = verifiableInstances.value.some(
      (r) => r.instance.id === selectedInstanceId.value,
    )
    if (!stillThere) {
      selectedInstanceId.value = filteredInstances.value[0]?.instance.id ?? null
    }
  }, 0)
}
</script>

<template>
  <BaseListLayout
    helpSlug="KB/training/training-verification"
    title="Training Verification"
    :icon="IconClipboardCheck"
    width="standard"
    fullHeight
    :state="list.state.value"
  >
    <template #stats>
      <!-- Top stats -->
      <div
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:flex tw:items-center tw:justify-between"
      >
        <div>
          <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main">
            Training Verification Dashboard
          </h1>
          <p class="tw:text-sm tw:text-secondary">
            Manager review and competency verification queue
          </p>
        </div>
        <div class="tw:flex tw:gap-3">
          <div class="tw:bg-blue-50 tw:rounded-lg tw:px-4 tw:py-2 tw:border tw:border-blue-200">
            <p class="tw:text-xs tw:text-blue-700 tw:font-medium">Pending Instances</p>
            <p class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-blue-700">
              {{ filteredInstances.length }}
            </p>
          </div>
          <div class="tw:bg-green-50 tw:rounded-lg tw:px-4 tw:py-2 tw:border tw:border-green-200">
            <p class="tw:text-xs tw:text-green-700 tw:font-medium">Closed This Week</p>
            <p class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-green-700">
              {{ closedThisWeek }}
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Body: left list + right panel -->
    <div class="tw:grid tw:grid-cols-[minmax(320px,1fr)_2fr] tw:gap-4 tw:flex-1 tw:min-h-0">
      <!-- Pending instances list -->
      <div
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3 tw:overflow-y-auto"
      >
        <div>
          <p class="tw:text-sm tw:font-bold tw:text-on-sidebar">Pending Training Instances</p>
          <p class="tw:text-xs tw:text-secondary">Instances awaiting competency verification</p>
        </div>
        <BaseTextInput
          v-model="list.filters.value.search"
          placeholder="Search training..."
          size="sm"
        />

        <div class="tw:flex tw:gap-1.5">
          <button
            v-for="chip in statusChips"
            :key="chip.value"
            type="button"
            class="tw:px-3 tw:py-1 tw:text-xs tw:font-medium tw:rounded-full tw:border tw:transition-colors"
            :class="
              statusFilter === chip.value
                ? 'tw:bg-primary tw:text-white tw:border-primary'
                : 'tw:border-divider tw:text-secondary tw:hover:bg-main-hover'
            "
            @click="statusFilter = chip.value"
          >
            {{ chip.label }} ({{ chip.count }})
          </button>
        </div>

        <p
          v-if="!filteredInstances.length"
          class="tw:text-sm tw:text-secondary tw:italic tw:p-4 tw:text-center"
        >
          No {{ statusFilter === 'all' ? '' : statusFilter }} training instances.
        </p>

        <div v-else class="tw:flex tw:flex-col tw:gap-2">
          <BaseClickableRow
            v-for="row in filteredInstances"
            :key="row.instance.id"
            class="tw:p-3 tw:rounded-lg tw:border tw:transition-colors"
            :class="
              selectedInstanceId === row.instance.id
                ? 'tw:border-primary tw:bg-blue-50'
                : 'tw:border-divider tw:hover:bg-gray-50'
            "
            :aria-label="`Select training instance ${row.instance.snapshot?.title || ''}`"
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
              <span class="tw:ml-auto"
                >Launched {{ row.instance.createdAt?.formatDate('date') }}</span
              >
            </div>
          </BaseClickableRow>
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
        <div
          v-else
          class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-8 tw:text-center tw:text-secondary tw:italic"
        >
          <IconClipboardCheck :size="48" class="tw:mx-auto tw:mb-3 tw:text-gray-300" />
          <p>Select a training instance from the left to begin verification.</p>
        </div>
      </div>
    </div>
  </BaseListLayout>
</template>
