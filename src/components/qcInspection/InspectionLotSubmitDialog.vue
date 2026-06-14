<script setup>
/**
 * Submit an Inspection Lot for QA Disposition. The submitter picks the QA
 * reviewer — the workflow engine assigns them the APPROVAL task. Reviewer
 * defaults to the current user (they can change it). On approval the lot is
 * released; on rejection a Nonconformance is auto-created.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({ lotId: { type: String, required: true } })
const emit = defineEmits(['submitted'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

// Load the lot's workflow to get the first APPROVAL step id.
// Falls back to a simple single-reviewer flow.
// Before submission the workflow instance doesn't exist yet — just present
// a single reviewer picker; the backend maps the ids to the first step.
const reviewerIds = ref([])

// Default to current user as reviewer.
watch(show, (v) => {
  if (v) {
    const me = currentSession.value?.userId
    reviewerIds.value = me ? [me] : []
  }
})

const canSubmit = computed(() => reviewerIds.value.length > 0)

async function onSubmit() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    // We don't know the step id yet (workflow not yet created).
    // POST to /submit — the controller will create the workflow instance.
    // Pass pickedReviewers with key '__default__' (a signal to the backend
    // to assign to the first step). The workflowInstanceService interprets
    // a missing step key as "use the first active step".
    // Simpler: just send the reviewer ids; backend resolves the step.
    await post(`/v1/services/qcInspection/lots/${props.lotId}/submit`, {
      reviewerIds: reviewerIds.value,
    })
    toast.success('Lot submitted for QA disposition')
    show.value = false
    emit('submitted')
  } catch (err) {
    toast.error(err?.message || 'Submission failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Submit for QA Disposition" :persistent="true">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800">
        <p class="tw:font-medium">QA disposition creates a formal approval record.</p>
        <p class="tw:text-xs tw:mt-1">The selected reviewer will receive a task. On <strong>Approval</strong> the lot is released. On <strong>Rejection</strong> a Nonconformance is automatically raised.</p>
      </div>

      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:mb-2">
          QA Reviewer <span class="tw:text-bad">*</span>
        </label>
        <UserSelectMenu v-model="reviewerIds" :multiple="true" />
        <p class="tw:text-[11px] tw:text-secondary tw:mt-1">Defaults to you — change to assign to a different QA person.</p>
      </div>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-5 tw:pb-5">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="!canSubmit || saving" :loading="saving" @click="onSubmit">
        Submit for Disposition
      </BaseButton>
    </div>
  </BaseDialog>
</template>
