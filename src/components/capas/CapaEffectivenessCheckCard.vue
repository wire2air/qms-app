<script setup>
import { IconCalendarPlus, IconRefresh, IconCheck } from '@tabler/icons-vue'

const props = defineProps({
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const checks = useLiveQueryWithDeps(
  [() => props.capaId],
  async (db, [capaId]) => {
    if (!capaId) return []
    const all = await db.CapaEffectivenessCheck.where('capaId', capaId).exec()
    // Newest first (createdAt desc).
    return all.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const activeCheck = computed(() =>
  checks.value.find((c) => c.statusId === 'PENDING' || c.statusId === 'IN_PROGRESS'),
)

const completedBys = useLiveQueryWithDeps(
  [() => checks.value.map((c) => c.completedBy).filter(Boolean).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const ids = [...new Set(idsStr.split(','))]
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]))
  },
  { initial: {} },
)

function getUserName(userId) {
  const u = completedBys.value[userId]
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}

const showSchedule = ref(false)
const showComplete = ref(false)
const showRenew = ref(false)

function openComplete() {
  if (!activeCheck.value) return
  showComplete.value = true
}

function openRenew() {
  if (!activeCheck.value) return
  showRenew.value = true
}
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div
        class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
      >
        Effectiveness Check
      </div>
      <BaseButton
        v-if="isOwner && !activeCheck"
        variant="outline"
        size="sm"
        @click="showSchedule = true"
      >
        <template #icon><IconCalendarPlus :size="14" /></template>
        Schedule check
      </BaseButton>
    </div>

    <!-- Active check (PENDING or IN_PROGRESS) -->
    <div v-if="activeCheck" class="tw:flex tw:flex-col tw:gap-3">
      <div
        class="tw:flex tw:items-center tw:justify-between tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-3"
      >
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <div class="tw:flex tw:items-center tw:gap-2">
            <CapaEffectivenessCheckStatusBadgeById :statusId="activeCheck.statusId" />
            <span class="tw:text-sm tw:font-medium tw:text-on-main">
              Due {{ activeCheck.dueAt?.formatDate('date') || '—' }}
            </span>
          </div>
          <span class="tw:text-xs tw:text-secondary">
            Reminder will create a task for the CAPA owner on the due date.
          </span>
        </div>
        <div v-if="isOwner" class="tw:flex tw:items-center tw:gap-2">
          <BaseButton variant="outline" size="sm" @click="openRenew">
            <template #icon><IconRefresh :size="14" /></template>
            Renew
          </BaseButton>
          <BaseButton variant="primary" size="sm" @click="openComplete">
            <template #icon><IconCheck :size="14" /></template>
            Complete
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- No active + non-owner readout -->
    <p
      v-else-if="!checks.length"
      class="tw:text-sm tw:text-secondary tw:italic"
    >
      No effectiveness check scheduled.
    </p>

    <!-- History (completed / renewed / cancelled rows) -->
    <div
      v-if="checks.filter((c) => !['PENDING', 'IN_PROGRESS'].includes(c.statusId)).length"
      class="tw:mt-4"
    >
      <div
        class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mb-2"
      >
        History
      </div>
      <div class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="check in checks.filter((c) => !['PENDING', 'IN_PROGRESS'].includes(c.statusId))"
          :key="check.id"
          class="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
        >
          <div class="tw:flex tw:items-center tw:justify-between">
            <div class="tw:flex tw:items-center tw:gap-2">
              <CapaEffectivenessCheckStatusBadgeById :statusId="check.statusId" />
              <span class="tw:text-xs tw:text-secondary">
                Due {{ check.dueAt?.formatDate('date') || '—' }}
              </span>
            </div>
            <span v-if="check.completedAt" class="tw:text-xs tw:text-secondary">
              by {{ getUserName(check.completedBy) }} —
              {{ check.completedAt.formatDate('dateTime') }}
            </span>
          </div>
          <p
            v-if="check.comments"
            class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap tw:mt-1"
          >
            {{ check.comments }}
          </p>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <CapaEffectivenessCheckScheduleDialog v-model="showSchedule" :capaId="capaId" />
    <CapaEffectivenessCheckCompleteDialog
      v-model="showComplete"
      :capaId="capaId"
      :checkId="activeCheck?.id"
    />
    <CapaEffectivenessCheckRenewDialog
      v-model="showRenew"
      :capaId="capaId"
      :checkId="activeCheck?.id"
    />
  </div>
</template>
