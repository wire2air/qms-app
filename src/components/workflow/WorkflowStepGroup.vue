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
import { IconLayersSubtract, IconDots, IconSignature, IconUserShare } from '@tabler/icons-vue'
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
          <!-- Hand a single step to someone else without breaking the rest of
               the run apart: the group recomputes from the live assignments. -->
          <BaseTooltip content="Reassign this step to someone else">
            <button
              type="button"
              class="tw:ml-auto tw:shrink-0 tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-primary"
              :aria-label="`Reassign ${step.name || 'step ' + step.stepNumber}`"
              @click="emit('reassign', step.id)"
            >
              <IconUserShare :size="16" />
            </button>
          </BaseTooltip>
        </div>

        <p v-if="step.description" class="tw:mb-3 tw:text-sm tw:text-secondary">
          {{ step.description }}
        </p>

        <!-- Steps after the first cannot be saved as drafts — they have no task
             to attach a record to until they activate. Say so next to the form
             rather than letting someone type for ten minutes and lose it. -->
        <p
          v-if="hasForm(step) && i > 0"
          class="tw:mb-2 tw:rounded-md tw:bg-amber-50 tw:px-2.5 tw:py-1.5 tw:text-xs tw:text-amber-800 tw:dark:bg-amber-950/30 tw:dark:text-amber-200"
        >
          Not saved until you complete the group — this step has not started yet, so there is
          nothing to hold a draft.
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
      <BaseButton
        v-if="canAct"
        :disabled="submitting"
        :loading="submitting"
        @click="onCompleteClick"
      >
        Complete {{ steps.length }} steps
      </BaseButton>
    </div>

    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
