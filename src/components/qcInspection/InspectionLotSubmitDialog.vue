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

// Optional workflow override. Normally the disposition workflow comes from the
// inspection plan (or the company default) and the backend resolves it — the
// user leaves this blank. When there's no plan / no default, the user can pick
// a QC disposition workflow here instead of hitting the "no workflow" dead-end.
const workflowVersionId = ref(null)

// QC disposition workflows (module QC_INSPECTION), one entry per active
// workflow's current version — the same shape the plan/default would resolve to.
const qcWorkflows = useLiveQuery((db) => db.Workflow.where('moduleId', 'QC_INSPECTION').exec(), {
  models: ['Workflow'],
  initial: [],
})
const qcVersions = useLiveQuery((db) => db.WorkflowVersion.where().exec(), {
  models: ['WorkflowVersion'],
  initial: [],
})
const workflowResolution = computed(() => {
  const active = (qcWorkflows.value || []).filter((w) => w.statusId === 'ACTIVE')
  const currentByWorkflow = new Map()
  for (const v of qcVersions.value || []) {
    if (!active.some((w) => w.id === v.workflowId)) continue
    const cur = currentByWorkflow.get(v.workflowId)
    // Prefer the flagged-current version; otherwise the highest version number.
    if (!cur || v.isCurrent || (!cur.isCurrent && v.versionMajor > cur.versionMajor)) {
      currentByWorkflow.set(v.workflowId, v)
    }
  }
  const options = active
    .map((w) => {
      const v = currentByWorkflow.get(w.id)
      return v
        ? { id: v.id, name: `${w.name} (v${v.versionMajor}.${v.versionMinor})`, isDefault: !!w.isDefault }
        : null
    })
    .filter(Boolean)
  // Company default = the QC workflow flagged isDefault, else the first one.
  const fallback = options.find((o) => o.isDefault) || options[0] || null
  return { options, defaultVersionId: fallback?.id || null }
})
const workflowOptions = computed(() => workflowResolution.value.options)

// Does this lot's inspection plan already carry a disposition workflow? A lot
// with a template always does (workflowVersionId is required on the template);
// a plan-less (ad-hoc) lot does not, so we preselect a workflow for the user.
const lot = useLiveQueryWithDeps([() => props.lotId], async (db, [id]) =>
  id ? db.InspectionLot.findByPk(id) : null,
)
const planTemplate = useLiveQueryWithDeps([() => lot.value?.templateId], async (db, [tid]) =>
  tid ? db.QcInspectionTemplate.findByPk(tid) : null,
)
const hasPlanWorkflow = computed(() => Boolean(planTemplate.value?.workflowVersionId))

// Default to current user as reviewer; clear any prior workflow choice.
const preselectDone = ref(false)
watch(show, (v) => {
  if (v) {
    const me = currentSession.value?.userId
    reviewerIds.value = me ? [me] : []
    workflowVersionId.value = null
    preselectDone.value = false
  }
})

// When the dialog opens for a lot with no inspection-plan workflow, preselect
// the default (or first) QC workflow so the user isn't left with a blank field.
// Runs once per open, then the user is free to change it.
watch(
  [show, lot, planTemplate, workflowOptions],
  () => {
    if (!show.value || preselectDone.value) return
    if (lot.value === undefined) return // lot still loading
    if (lot.value?.templateId && planTemplate.value === undefined) return // template still loading
    if (hasPlanWorkflow.value) {
      preselectDone.value = true // plan provides the workflow; keep the picker blank
      return
    }
    const opts = workflowOptions.value
    if (!opts.length) return // options not loaded yet — retry on the next change
    workflowVersionId.value = workflowResolution.value.defaultVersionId || opts[0].id
    preselectDone.value = true
  },
  { immediate: true },
)

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
      // Blank → backend resolves from the inspection plan / company default.
      workflowVersionId: workflowVersionId.value || null,
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

      <BaseField label="QA Reviewer" required hint="Defaults to you — change to assign to a different QA person.">
        <UserSelectMenu v-model="reviewerIds" :multiple="true" />
      </BaseField>

      <BaseField
        label="Disposition Workflow"
        hint="Uses the inspection plan's workflow by default. Pick one here if this lot has no plan."
      >
        <BaseSelect
          v-model="workflowVersionId"
          :options="workflowOptions"
          optionLabel="name"
          optionValue="id"
          nullLabel="Use inspection plan / default"
          :clearable="true"
          placeholder="Use inspection plan / default"
        />
        <p v-if="!workflowOptions.length" class="tw:mt-1 tw:text-xs tw:text-amber-700">
          No QC disposition workflow exists yet. Create one under Workflows, or run db:reset to seed the default.
        </p>
      </BaseField>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Submit for Disposition"
        :loading="saving"
        :disabled="!canSubmit"
        @cancel="show = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
