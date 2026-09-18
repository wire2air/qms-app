<script setup>
/**
 * QA disposition action for a lot that is UNDER_REVIEW.
 *
 * Replaces the old two-step "pick disposition → Approve/Reject". The assigned
 * reviewer now picks ONE disposition (from the shared nc_disposition_types
 * lookup — the same list the NC uses) + records the reasoning and clicks a
 * single "Record Disposition" button. The disposition IS the decision and
 * becomes the lot's terminal status (Released / Rework / Hold / …).
 *
 * Mechanics: this component resolves the current user's actionable workflow task
 * for the lot (same lookup as TaskActionBar). On submit it persists the
 * disposition + notes on the lot, then completes the step via the standard
 * task-action endpoint (every disposition records as APPROVED; the backend
 * inspectionLotHandler reads the persisted disposition to set the final status
 * and email the notification groups the full results + attachment links).
 * E-signature is honoured when the workflow step requires it.
 */
import { IconGavel } from '@tabler/icons-vue'
import { patch, post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  lotId: { type: String, required: true },
})

const toast = useToast()

const ACTIONABLE_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED']

const lot = useLiveQueryWithDeps([() => props.lotId], async (db, [id]) => db.InspectionLot.findByPk(id))

// The current user's actionable task for this lot (mirrors TaskActionBar).
const taskInstance = useLiveQueryWithDeps(
  [() => props.lotId, () => currentSession.value?.userId],
  async (db, [lotId, userId]) => {
    if (!lotId || !userId) return null
    const tasks = await db.TaskInstance.where('[entityType+entityId]', ['InspectionLot', lotId]).exec()
    return tasks.find((t) => t.assignedTo === userId && ACTIONABLE_STATUSES.includes(t.statusId)) || null
  },
)

const instanceStep = useLiveQueryWithDeps(
  [() => taskInstance.value?.sourceId, () => taskInstance.value?.sourceType],
  async (db, [sourceId, sourceType]) => {
    if (!sourceId || sourceType !== 'WorkflowInstanceStep') return null
    return db.WorkflowInstanceStep.findByPk(sourceId)
  },
)

const workflowStep = useLiveQueryWithDeps(
  [() => instanceStep.value?.stepId],
  async (db, [stepId]) => (stepId ? db.WorkflowStep.findByPk(stepId) : null),
)

const requireEsignature = computed(() => Boolean(workflowStep.value?.requireEsignature))

// Local draft seeded from whatever's already on the lot.
const dispositionTypeId = ref(null)
const notes = ref('')
const seeded = ref(false)
watch(
  lot,
  (l) => {
    if (!l || seeded.value) return
    dispositionTypeId.value = l.dispositionTypeId || null
    notes.value = l.dispositionNotes || ''
    seeded.value = true
  },
  { immediate: true },
)

const submitting = ref(false)
const showEsignDialog = ref(false)

async function onRecord() {
  if (!dispositionTypeId.value) {
    toast.error('Pick a disposition first')
    return
  }
  if (requireEsignature.value) {
    showEsignDialog.value = true
    return
  }
  await record({})
}

function onEsignVerified(esign) {
  record(esign)
}

async function record({ method, provider, token } = {}) {
  if (submitting.value || !taskInstance.value) return
  submitting.value = true
  try {
    // 1. Persist the decision on the lot so the handler reads it.
    await patch(`/v1/services/qcInspection/lots/${props.lotId}`, {
      dispositionTypeId: dispositionTypeId.value,
      dispositionNotes: notes.value.trim() || null,
    })
    // 2. Complete the review step — every disposition records as APPROVED; the
    //    backend maps the persisted disposition to the terminal lot status.
    const body = { action: 'APPROVED' }
    if (notes.value.trim()) body.comment = notes.value.trim()
    if (method) body.method = method
    if (provider) body.provider = provider
    if (token) body.token = token
    await post(`/v1/services/taskInstances/${taskInstance.value.id}/action`, body)

    toast.success('Disposition recorded')
    showEsignDialog.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to record disposition')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="taskInstance" class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:flex-col tw:gap-1.5">
      <span class="tw:text-caption tw:font-semibold tw:text-amber-800 tw:uppercase tw:tracking-wider">Disposition</span>
      <NcDispositionTypeSelectMenu v-model="dispositionTypeId" :required="false" class="tw:w-72" />
    </div>

    <div class="tw:flex tw:flex-col tw:gap-1.5">
      <span class="tw:text-caption tw:font-semibold tw:text-amber-800 tw:uppercase tw:tracking-wider">Disposition notes</span>
      <BaseTextarea
        v-model="notes"
        :rows="3"
        autosize
        placeholder="Reasoning for this disposition (shared with the notification team)…"
      />
    </div>

    <div>
      <BaseButton variant="primary" :isLoading="submitting" :disabled="!dispositionTypeId" @click="onRecord">
        <template #icon>
          <IconGavel :size="16" />
        </template>
        Record Disposition
      </BaseButton>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
