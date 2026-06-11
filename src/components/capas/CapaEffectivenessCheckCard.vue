<script setup>
import { IconCheck } from '@tabler/icons-vue'

/**
 * Effectiveness-check section on the CAPA detail page.
 *
 * Two modes:
 *   1. **Planning mode** — CAPA is DRAFT or PENDING. No EC row exists yet
 *      (per ISO 13485 §8.5.2 / 21 CFR 820.100(a)(4), EC is post-close).
 *      We render a small preset picker so the owner can indicate intent:
 *      "default to N days from close". Persists to capa.ecIntervalDays;
 *      the Close dialog reads this as its default preset.
 *
 *   2. **Tracking mode** — CAPA is CLOSED. An EC row exists (created by
 *      closeCapa). We render the active row + history; verification
 *      happens via the EC task that the worker creates at due_at →
 *      CapaEffectivenessCheckCompleteDialog (3-way verdict + esign).
 *
 * The standalone "Schedule check" button has been removed — scheduling
 * is now a side-effect of closing the CAPA so verification can't fire
 * before the corrective actions are complete.
 */

const props = defineProps({
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const capa = useLiveQueryWithDeps([() => props.capaId], async (db, [id]) =>
  id ? db.Capa.findByPk(id) : null,
)

const isTerminal = computed(
  () => capa.value?.statusId === 'CLOSED' || capa.value?.statusId === 'CANCELLED',
)
const isClosed = computed(() => capa.value?.statusId === 'CLOSED')

const checks = useLiveQueryWithDeps(
  [() => props.capaId],
  async (db, [capaId]) => {
    if (!capaId) return []
    const all = await db.CapaEffectivenessCheck.where('capaId', capaId).exec()
    return all.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const activeCheck = computed(() =>
  checks.value.find((c) => c.statusId === 'PENDING' || c.statusId === 'IN_PROGRESS'),
)
const historyChecks = computed(() =>
  checks.value.filter((c) => !['PENDING', 'IN_PROGRESS'].includes(c.statusId)),
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

const OUTCOME_LABELS = {
  EFFECTIVE: 'Effective',
  NOT_EFFECTIVE: 'Not Effective',
}
const OUTCOME_CLASSES = {
  EFFECTIVE: 'tw:bg-green-100 tw:text-green-700',
  NOT_EFFECTIVE: 'tw:bg-red-100 tw:text-red-700',
}

// ─── Planning mode: editable preset for ecIntervalDays ───────────────────────
const EC_PRESETS = [
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: '180 days', days: 180 },
  { label: '365 days', days: 365 },
]
const savingInterval = ref(false)

async function setEcInterval(days) {
  if (!capa.value || isTerminal.value || !props.isOwner) return
  if (capa.value.ecIntervalDays === days) return
  savingInterval.value = true
  try {
    capa.value.ecIntervalDays = days
    await capa.value.save()
  } finally {
    savingInterval.value = false
  }
}

// ─── Verification dialog state (post-close tracking mode) ───────────────────
const showComplete = ref(false)
function openComplete() {
  if (!activeCheck.value) return
  showComplete.value = true
}
</script>

<template>
  <div
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
    data-testid="capa-ec-card"
  >
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
        Effectiveness Check
      </div>
      <span v-if="savingInterval" class="tw:text-xs tw:text-secondary">Saving…</span>
    </div>

    <!-- ─── Planning mode (DRAFT / PENDING) ────────────────────────────── -->
    <div v-if="!isClosed && capa" class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-xs tw:text-secondary">
        Set how soon after close the CAPA owner should verify the
        corrective action's effectiveness. You can still override this
        when you click <strong>Close CAPA</strong>.
      </p>
      <div class="tw:flex tw:flex-wrap tw:gap-2">
        <button
          v-for="preset in EC_PRESETS"
          :key="preset.days"
          type="button"
          class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          :class="
            capa.ecIntervalDays === preset.days
              ? 'tw:bg-primary tw:text-white tw:border-primary'
              : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
          "
          :disabled="!isOwner || isTerminal || savingInterval"
          @click="setEcInterval(preset.days)"
        >
          {{ preset.label }}
        </button>
      </div>
      <p class="tw:text-[11px] tw:text-secondary">
        Current preference: <strong>{{ capa.ecIntervalDays ?? 90 }} days after close</strong>.
        No verification task is created until the CAPA is closed.
      </p>
    </div>

    <!-- ─── Tracking mode (CLOSED): active EC + history ─────────────────── -->
    <div v-if="isClosed && activeCheck" class="tw:flex tw:flex-col tw:gap-3">
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
          <BaseButton variant="primary" size="sm" @click="openComplete">
            <template #icon><IconCheck :size="14" /></template>
            Verify
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- ─── Empty state when CLOSED but no EC row (shouldn't normally happen) ─── -->
    <p
      v-else-if="isClosed && !checks.length"
      class="tw:text-sm tw:text-secondary tw:italic"
    >
      No effectiveness check on file for this closed CAPA.
    </p>

    <!-- ─── History (completed / renewed / cancelled rows) ─────────────── -->
    <div v-if="historyChecks.length" class="tw:mt-4">
      <div
        class="tw:text-[11px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mb-2"
      >
        History
      </div>
      <div class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="check in historyChecks"
          :key="check.id"
          class="tw:flex tw:flex-col tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
        >
          <div class="tw:flex tw:items-center tw:justify-between tw:flex-wrap tw:gap-2">
            <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
              <CapaEffectivenessCheckStatusBadgeById :statusId="check.statusId" />
              <span
                v-if="check.outcome"
                class="tw:text-[10px] tw:px-1.5 tw:py-0.5 tw:rounded-full tw:font-semibold"
                :class="OUTCOME_CLASSES[check.outcome]"
              >
                {{ OUTCOME_LABELS[check.outcome] || check.outcome }}
              </span>
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

    <CapaEffectivenessCheckCompleteDialog
      v-model="showComplete"
      :capaId="capaId"
      :checkId="activeCheck?.id"
    />
  </div>
</template>
