<script setup>
/**
 * CAPA effectiveness-check decision dialog.
 *
 * Industry-standard 3-way verdict (per 21 CFR 820.100, ISO 13485 §8.5.2,
 * and the practice of Greenlight Guru / MasterControl / ETQ in 2026):
 *
 *   Effective       — corrective action verified working. Terminal.
 *   Not Effective   — failed verification. Owner is expected to reopen
 *                     the CAPA or spawn a new linked CAPA afterwards;
 *                     surfaced as guidance in the dialog.
 *   Extend          — pick a new due date for another verification pass.
 *                     Capped at 2 extensions per chain.
 *
 * CFR 21 Part 11: all three are regulated decisions and require an
 * authenticated e-signature. The dialog collects the decision + comments
 * + (for extend) the new date, then opens the shared
 * WorkflowInstanceEsignAuthDialog. The verified handler POSTs to the
 * `/complete` or `/renew` endpoint.
 */

import { IconCircleCheck, IconCircleX, IconCalendarTime, IconShieldCheck } from '@tabler/icons-vue'
import { post } from '@/api'

const props = defineProps({
  capaId: { type: String, required: true },
  checkId: { type: String, default: null },
})

const emit = defineEmits(['completed'])
const isOpen = defineModel({ type: Boolean, default: false })
const toast = useToast()

// ─── State ───────────────────────────────────────────────────────────────────
// 'EFFECTIVE' | 'NOT_EFFECTIVE' | 'EXTEND' — null until the user picks.
const decision = ref(null)
const comments = ref('')
const newDueDate = ref(null) // DateTime when EXTEND
const showEsign = ref(false)
const saving = ref(false)

// Reset on each open so a previous selection doesn't leak through.
watch(isOpen, (open) => {
  if (open) {
    decision.value = null
    comments.value = ''
    newDueDate.value = null
  }
})

// ─── Extension cap visibility ────────────────────────────────────────────────
// Walk parentCheckId backwards from THIS check to count prior renewals in
// the chain. Cap is 2. Drives the "X of 2 extensions used" hint and
// disables the Extend option when at the limit.
const check = useLiveQueryWithDeps(
  [() => props.checkId],
  async (db, [id]) => (id ? db.CapaEffectivenessCheck.findByPk(id) : null),
)

const extensionsUsed = useLiveQueryWithDeps(
  [() => check.value?.parentCheckId],
  async (db, [parentId]) => {
    let count = 0
    let cursor = parentId
    while (cursor && count < 5) {
      const row = await db.CapaEffectivenessCheck.findByPk(cursor)
      if (!row) break
      count += 1
      cursor = row.parentCheckId ?? null
    }
    return count
  },
  { initial: 0 },
)
const MAX_EXTENSIONS = 2
const extensionsLeft = computed(() => Math.max(0, MAX_EXTENSIONS - extensionsUsed.value))
const canExtend = computed(() => extensionsLeft.value > 0)

// ─── Submit validity ─────────────────────────────────────────────────────────
const canSubmit = computed(() => {
  if (!decision.value) return false
  if (!comments.value.trim()) return false
  if (decision.value === 'EXTEND' && !newDueDate.value) return false
  if (decision.value === 'EXTEND' && !canExtend.value) return false
  return true
})

// ─── Submission flow ─────────────────────────────────────────────────────────
function openEsign() {
  if (!canSubmit.value) return
  showEsign.value = true
}

async function onEsignVerified({ method, provider, token }) {
  showEsign.value = false
  saving.value = true
  try {
    if (decision.value === 'EFFECTIVE' || decision.value === 'NOT_EFFECTIVE') {
      const response = await post(
        `/v1/services/capas/${props.capaId}/effectivenessChecks/${props.checkId}/complete`,
        {
          outcome: decision.value,
          comments: comments.value.trim(),
          method,
          provider: provider || null,
          token,
        },
      )
      toast.success(
        decision.value === 'EFFECTIVE'
          ? 'CAPA verified effective'
          : 'CAPA verified not effective — owner action recommended',
      )
      emit('completed', response.effectivenessCheck)
    } else if (decision.value === 'EXTEND') {
      const response = await post(
        `/v1/services/capas/${props.capaId}/effectivenessChecks/${props.checkId}/renew`,
        {
          dueAt: newDueDate.value.toISO(),
          comments: comments.value.trim(),
          method,
          provider: provider || null,
          token,
        },
      )
      toast.success('Effectiveness check extended')
      emit('completed', response.effectivenessCheck)
    }
    isOpen.value = false
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to submit decision' })
  } finally {
    saving.value = false
  }
}

const DECISIONS = [
  {
    id: 'EFFECTIVE',
    label: 'Effective',
    description: 'Corrective action verified working. Closes this check.',
    icon: IconCircleCheck,
    classes: 'tw:border-green-500 tw:bg-green-50/40',
    iconClasses: 'tw:text-green-600',
  },
  {
    id: 'NOT_EFFECTIVE',
    label: 'Not Effective',
    description:
      'Corrective action did not prevent recurrence. After signing you should reopen the CAPA or open a new linked one.',
    icon: IconCircleX,
    classes: 'tw:border-red-500 tw:bg-red-50/40',
    iconClasses: 'tw:text-red-600',
  },
  {
    id: 'EXTEND',
    label: 'Extend',
    description:
      'Need more observation time. Pick a new due date — max 2 extensions per check.',
    icon: IconCalendarTime,
    classes: 'tw:border-amber-500 tw:bg-amber-50/40',
    iconClasses: 'tw:text-amber-600',
  },
]
</script>

<template>
  <BaseDialog v-model="isOpen" title="Effectiveness Check Decision" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Verify whether the corrective action achieved its objective. This is a
        controlled record under 21 CFR 820.100 / ISO 13485 §8.5.2 — your
        decision is recorded with an e-signature.
      </p>

      <!-- Decision picker -->
      <div class="tw:flex tw:flex-col tw:gap-2">
        <div
          v-for="opt in DECISIONS"
          :key="opt.id"
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:border tw:cursor-pointer tw:transition-colors"
          :class="[
            decision === opt.id
              ? opt.classes
              : 'tw:border-divider tw:hover:bg-main-hover',
            opt.id === 'EXTEND' && !canExtend
              ? 'tw:opacity-50 tw:cursor-not-allowed'
              : '',
          ]"
          :title="
            opt.id === 'EXTEND' && !canExtend
              ? `Maximum ${MAX_EXTENSIONS} extensions reached — pick Effective or Not Effective.`
              : undefined
          "
          @click="
            () => {
              if (opt.id === 'EXTEND' && !canExtend) return
              decision = opt.id
            }
          "
        >
          <component :is="opt.icon" :size="22" class="tw:mt-0.5 tw:shrink-0" :class="opt.iconClasses" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ opt.label }}</div>
              <span
                v-if="opt.id === 'EXTEND'"
                class="tw:text-[10px] tw:font-medium tw:px-1.5 tw:py-0.5 tw:rounded-full"
                :class="
                  canExtend
                    ? 'tw:bg-amber-100 tw:text-amber-700'
                    : 'tw:bg-red-100 tw:text-red-700'
                "
              >
                {{ extensionsUsed }} of {{ MAX_EXTENSIONS }} used
              </span>
            </div>
            <p class="tw:text-xs tw:text-secondary tw:mt-0.5 tw:leading-relaxed">
              {{ opt.description }}
            </p>
          </div>
        </div>
      </div>

      <!-- Extend: new date picker -->
      <div v-if="decision === 'EXTEND'">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          New Due Date <span class="tw:text-red-500">*</span>
        </p>
        <BaseDatePicker v-model="newDueDate" />
      </div>

      <!-- Not effective: hint about follow-up -->
      <div
        v-if="decision === 'NOT_EFFECTIVE'"
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-xs tw:text-amber-800"
      >
        <div class="tw:shrink-0 tw:mt-0.5">⚠</div>
        <div>
          After signing, decide whether to <strong>reopen this CAPA</strong>
          (push back a workflow step for revision) or <strong>open a new
          CAPA</strong> linked to this one. Audit will record this verdict
          either way.
        </div>
      </div>

      <!-- Comments — required per CFR 11 §11.70 (signature meaning) -->
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Verification Notes <span class="tw:text-red-500">*</span>
        </p>
        <p class="tw:text-[11px] tw:text-secondary tw:mb-1">
          What evidence supports this decision? Required for audit traceability.
        </p>
        <BaseTextarea
          v-model="comments"
          :rows="3"
          placeholder="e.g. 'Reviewed 90 days of complaint data — no recurrence observed.'"
        />
      </div>

      <!-- CFR 21 Part 11 notice -->
      <div class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800">
        <IconShieldCheck :size="14" class="tw:shrink-0 tw:mt-0.5" />
        <div>
          CFR 21 Part 11 — Submitting this decision requires your
          e-signature. You'll confirm your identity on the next step.
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="!canSubmit || saving" @click="openEsign">
        {{ saving ? 'Submitting…' : 'Sign &amp; Submit' }}
      </BaseButton>
    </template>

    <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
  </BaseDialog>
</template>
