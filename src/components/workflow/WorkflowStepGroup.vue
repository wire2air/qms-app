<script setup>
/**
 * One card for a run of consecutive steps all assigned to the same person.
 *
 * Users pushed back on opening and completing three of their own steps in a
 * row. This shows the run as a single card — each step's form stacked, one
 * Complete — and posts once to `/taskInstances/:id/completeGroup`.
 *
 * ── Rendered only when a run exists ──────────────────────────────────────────
 * WorkflowStepList decides. With STEP_GROUPING_ENABLED false no run is ever
 * built, this component never mounts, and every step renders through the
 * existing WorkflowStep card exactly as before.
 *
 * ── Why one request rather than a loop ───────────────────────────────────────
 * Steps 2..N are PENDING with no task instance, so their records cannot be
 * written from here at all. The server walks the run in one transaction: a
 * failure anywhere rolls the whole thing back, rather than leaving someone
 * halfway through what we presented as a single action.
 *
 * ── Leaving the group ────────────────────────────────────────────────────────
 * Two ways, and reassigning is usually the one you want:
 *
 *   Reassign  give a step to someone else. The run is recomputed from a LIVE
 *             query of the assignments, so the group re-forms by itself — the
 *             reassigned step drops out and any remaining consecutive steps
 *             still held by one person stay grouped. Nothing needs ungrouping
 *             first, and the engine accepts reassignment of a step that has not
 *             activated yet (PENDING | IN_PROGRESS | SENT_BACK).
 *
 *   Ungroup   keep the assignments, just stop collapsing them. Local and
 *             non-destructive: the steps fall back to individual cards and the
 *             ordinary per-step path. Nothing is written, nothing to undo.
 *             Useful when the steps really are all yours but you want to
 *             complete them one at a time, or add a sub-task to one.
 */
import {
  IconLayersSubtract,
  IconDots,
  IconSignature,
  IconUserShare,
  IconDeviceFloppy,
  IconBan,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  /** The run, ordered; [0] is the active step whose task the user holds. */
  steps: { type: Array, required: true },
  module: { type: Object, required: true },
  resourceId: { type: String, required: true },
  /** Task on the head step belonging to the current user — null when the run
   *  is somebody else's, in which case the card is descriptive only. */
  headTaskId: { type: String, default: null },
  canAct: { type: Boolean, default: false },
  /** Whose run this is, for the header. Empty means "you". */
  ownerName: { type: String, default: '' },
  isOwner: { type: Boolean, default: false },
})

const emit = defineEmits(['ungroup', 'reassign'])

const toast = useToast()

const submitting = ref(false)
const showEsignDialog = ref(false)
/** One form ref per step that has a form, keyed by instance step id. */
const formRefs = ref({})

function setFormRef(stepId, el) {
  if (el) formRefs.value[stepId] = el
  else delete formRefs.value[stepId]
}

const tail = computed(() => props.steps.slice(1))

function hasForm(step) {
  return Array.isArray(step?.formSchema) && step.formSchema.length > 0
}

const requiresEsignature = computed(() => props.steps.some((s) => s.requireEsignature))

const stepNumberRange = computed(() => {
  const nums = props.steps.map((s) => s.stepNumber).filter((n) => n != null)
  if (!nums.length) return ''
  return `Steps ${Math.min(...nums)}–${Math.max(...nums)}`
})

/**
 * Validate every form and collect its payload. Returns null if any step fails
 * validation — each form surfaces its own missing-field message, so nothing
 * is submitted until they all pass.
 */
async function collectPayloads() {
  const payloads = {}
  for (const step of props.steps) {
    if (!hasForm(step)) continue
    const form = formRefs.value[step.id]
    if (!form) continue
    const result = await form.submit()
    if (!result || typeof result.payload === 'undefined') return null
    payloads[step.id] = result.payload
  }
  return payloads
}

// ─── Per-step Cancel (owner) ─────────────────────────────────────────────────
// Mirrors WorkflowStep's owner inline button, including its gates: the engine
// allows cancelling a step in PENDING / IN_PROGRESS / SENT_BACK, so a step that
// has not started yet can be cancelled out of the run.
const CANCELLABLE_STATUSES = ['PENDING', 'IN_PROGRESS', 'SENT_BACK']
const cancelTarget = ref(null)
const cancelReason = ref('')
const cancelling = ref(false)

// Mirrors WorkflowStep's canReassign: the OWNER may hand a step to someone
// else while it is PENDING, IN_PROGRESS or SENT_BACK — including one already
// assigned to another person, which is the whole point of the control.
function canReassign(step) {
  return props.isOwner && CANCELLABLE_STATUSES.includes(step.statusId)
}

function canCancel(step) {
  return props.isOwner && step.stepType !== 'DELAY' && CANCELLABLE_STATUSES.includes(step.statusId)
}

function openCancel(step) {
  cancelTarget.value = step
  cancelReason.value = ''
}

async function confirmCancel() {
  if (!cancelTarget.value || cancelling.value) return
  cancelling.value = true
  try {
    await post(`/v1/services/${props.module.apiPath}/${props.resourceId}/cancelStep`, {
      workflowInstanceStepId: cancelTarget.value.id,
      comment: cancelReason.value.trim() || null,
    })
    toast.success('Step cancelled')
    cancelTarget.value = null
  } catch (e) {
    toast.error(e?.message || 'Could not cancel this step')
  } finally {
    cancelling.value = false
  }
}

const savingDraft = ref(false)

/** Steps whose form can be persisted. Since migration 20260818000100 a draft
 *  no longer needs a task, so this is every editable step in the run. */
const draftableCount = computed(
  () => props.steps.filter((st) => formRefs.value[st.id]?.canSaveDraft).length,
)

/**
 * One Save draft for the run: fan out to every step that can hold one.
 *
 * Every step in the run can hold a draft now — a step record models a draft as
 * `submitted_at IS NULL`, and task_instance_id became nullable in migration
 * 20260818000100, so a step that has not activated can still be saved. The task
 * is bound to the row when the step activates and the record is submitted.
 */
async function onSaveDraftClick() {
  if (savingDraft.value) return
  savingDraft.value = true
  let saved = 0
  try {
    for (const st of props.steps) {
      const form = formRefs.value[st.id]
      if (!form?.canSaveDraft) continue
      await form.saveDraft()
      saved += 1
    }
    if (saved) toast.success(`Draft saved for ${saved} step${saved === 1 ? '' : 's'}.`)
    else toast.info('Nothing to save yet.')
  } catch (e) {
    toast.error(e?.message || 'Could not save the draft')
  } finally {
    savingDraft.value = false
  }
}

function onCompleteClick() {
  if (!props.canAct || submitting.value) return
  if (requiresEsignature.value) showEsignDialog.value = true
  else submitGroup()
}

function onEsignVerified({ method, provider, token }) {
  showEsignDialog.value = false
  submitGroup({ method, provider, token })
}

async function submitGroup(esign = null) {
  if (submitting.value) return
  submitting.value = true
  try {
    const payloads = await collectPayloads()
    if (payloads === null) return // a form reported its own missing fields

    const body = {
      stepIds: tail.value.map((s) => s.id),
      payloads,
    }
    if (esign?.method) body.method = esign.method
    if (esign?.token) body.token = esign.token
    if (esign?.provider) body.provider = esign.provider

    const res = await post(`/v1/services/taskInstances/${props.headTaskId}/completeGroup`, body)
    const n = res?.completedStepIds?.length ?? props.steps.length
    toast.success(`${n} steps completed`)
  } catch (e) {
    // The server rolls the whole run back, so the record is exactly as it was.
    toast.error(e?.message || 'Could not complete these steps — no changes were saved.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="tw:rounded-xl tw:border tw:border-primary/40 tw:bg-card tw:overflow-hidden">
    <!-- Header: say plainly that several steps are being completed at once,
         so nobody clicks Complete thinking it applies to one. -->
    <div
      class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:border-b tw:border-divider tw:bg-primary/5 tw:px-4 tw:py-3"
    >
      <div class="tw:flex tw:items-start tw:gap-2 tw:min-w-0">
        <IconLayersSubtract :size="18" class="tw:mt-0.5 tw:shrink-0 tw:text-primary" />
        <div class="tw:min-w-0">
          <BaseText variant="body" weight="medium" class="tw:block">
            {{ steps.length }} steps assigned to you
          </BaseText>
          <BaseCaption>
            {{ stepNumberRange }} — completing these finishes all {{ steps.length }} in order.
          </BaseCaption>
        </div>
      </div>

      <BasePopover placement="bottom-end">
        <template #button>
          <button
            type="button"
            class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
            aria-label="Group actions"
          >
            <IconDots :size="18" />
          </button>
        </template>
        <template #content="{ close }">
          <button
            type="button"
            class="tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
            @click="
              () => {
                close()
                emit('ungroup')
              }
            "
          >
            Ungroup — complete these separately
          </button>
        </template>
      </BasePopover>
    </div>

    <!-- One block per step, each keeping its own name, instructions and form. -->
    <div class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <section v-for="(step, i) in steps" :key="step.id" class="tw:px-4 tw:py-4">
        <div class="tw:mb-2 tw:flex tw:items-center tw:gap-2">
          <span
            class="tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-xs tw:font-semibold tw:text-primary"
          >
            {{ i + 1 }}
          </span>
          <BaseText variant="body" weight="medium">{{
            step.name || `Step ${step.stepNumber}`
          }}</BaseText>
          <IconSignature
            v-if="step.requireEsignature"
            :size="15"
            class="tw:text-secondary"
            title="Requires an electronic signature"
          />
          <!-- Step-level actions stay per step, by design: only Complete and
               Save draft moved to the group.

               The HEAD is active, so it gets the ordinary actions menu with
               Complete hidden (the group's button owns that) — same component
               and same behaviour as an ungrouped step, rather than a parallel
               set that can drift.

               Later steps have not started: cancel / send back / request info
               are meaningless on them, and the engine would refuse. Reassign is
               the exception the engine does allow on a PENDING step, and it is
               how you take one step out of the run. -->
          <!-- Reassign and Cancel are the OWNER's inline controls on every
               step, head included. WorkflowStepActionsMenu deliberately hides
               REASSIGN / CANCEL / REQUEST_INFO (ALWAYS_HIDDEN_OUTCOMES), so
               giving the head only the menu left it with no way to reassign —
               something a standalone step has always allowed, even when the
               step belongs to someone else (reported 2026-08-18). -->
          <div class="tw:ml-auto tw:flex tw:shrink-0 tw:items-center tw:gap-1">
            <BaseTooltip v-if="canReassign(step)" content="Reassign this step to someone else">
              <button
                type="button"
                class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-primary"
                :aria-label="`Reassign ${step.name || 'step ' + step.stepNumber}`"
                @click="emit('reassign', step.id)"
              >
                <IconUserShare :size="16" />
              </button>
            </BaseTooltip>
            <BaseTooltip v-if="canCancel(step)" content="Cancel this step">
              <button
                type="button"
                class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-bad"
                :aria-label="`Cancel ${step.name || 'step ' + step.stepNumber}`"
                @click="openCancel(step)"
              >
                <IconBan :size="16" />
              </button>
            </BaseTooltip>
            <!-- Outcome actions (send back, etc.) apply only to the active
                 head; later steps have no task to act on. -->
            <WorkflowStepActionsMenu
              v-if="i === 0"
              :module="module"
              :instanceStepId="step.id"
              :resourceId="resourceId"
              :isOwner="isOwner"
              :requireEsignature="!!step.requireEsignature"
              :hideOutcomes="['COMPLETE_AND_ADVANCE']"
            />
          </div>
        </div>

        <p v-if="step.description" class="tw:mb-3 tw:text-sm tw:text-secondary">
          {{ step.description }}
        </p>

        <!-- collectOnly: validate and hand back the payload. Steps 2..N have no
             task instance yet, so their records are written server-side. -->
        <WorkflowStepForm
          v-if="hasForm(step)"
          :ref="(el) => setFormRef(step.id, el)"
          :module="module"
          :instanceStepId="step.id"
          :resourceId="resourceId"
          collectOnly
          hideSubmit
        />
      </section>
    </div>

    <div
      class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:border-t tw:border-divider tw:px-4 tw:py-3"
    >
      <BaseCaption v-if="canAct && requiresEsignature">
        You'll sign once; a signature is recorded against each step.
      </BaseCaption>
      <BaseCaption v-else-if="!canAct"> Waiting on {{ ownerName || 'the assignee' }}. </BaseCaption>
      <span v-else />
      <div v-if="canAct" class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="draftableCount > 0"
          variant="outline"
          :disabled="savingDraft || submitting"
          :loading="savingDraft"
          @click="onSaveDraftClick"
        >
          <template #icon><IconDeviceFloppy :size="16" /></template>
          Save draft
        </BaseButton>
        <BaseButton
          :disabled="submitting || savingDraft"
          :loading="submitting"
          @click="onCompleteClick"
        >
          Complete {{ steps.length }} steps
        </BaseButton>
      </div>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <BaseDialog
      :modelValue="!!cancelTarget"
      title="Cancel this step"
      maxWidth="sm"
      @update:modelValue="(v) => !v && (cancelTarget = null)"
    >
      <BaseCaption class="tw:mb-3">
        Cancelling removes
        <strong>{{ cancelTarget?.name || 'this step' }}</strong>
        from the workflow. The rest of the run is unaffected.
      </BaseCaption>
      <BaseField label="Reason" optional>
        <BaseTextarea v-model="cancelReason" :rows="3" placeholder="Why is this step not needed?" />
      </BaseField>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Cancel step"
          :loading="cancelling"
          @cancel="
            () => {
              cancelTarget = null
              close()
            }
          "
          @submit="confirmCancel"
        />
      </template>
    </BaseDialog>
  </div>
</template>
