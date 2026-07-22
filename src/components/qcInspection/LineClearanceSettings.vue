<script setup>
/**
 * QC Inspection → Line Clearance. Configure the per-company line-clearance /
 * sanitation checklist (a FormTemplate marked internalName 'QC_LINE_CLEARANCE'):
 * the "require before start" gate + the checklist questions.
 *
 * The checklist DEFINITION is a controlled artifact: editing puts it in DRAFT;
 * "Submit for approval" routes it through the QC / generic Approval workflow; a
 * reviewer approves → APPROVED. (This governs the checklist itself, not per-lot
 * clearance entries.) Approval state lives in config.approvalStatus.
 */
import { isAllowed } from '@/utils/currentSession.js'

const toast = useToast()
const canManage = computed(() => isAllowed(['inspection_qc:create']))
const showSubmit = ref(false)

const template = useLiveQuery(
  async (db) => (await db.FormTemplate.where().exec()).find((t) => t.internalName === 'QC_LINE_CLEARANCE') ?? null,
  { models: ['FormTemplate'], initial: undefined },
)

// Missing = grandfather existing checklists as APPROVED (already in use).
const approvalStatus = computed(() => template.value?.config?.approvalStatus ?? 'APPROVED')
const isDraft = computed(() => approvalStatus.value === 'DRAFT')
const isPending = computed(() => approvalStatus.value === 'PENDING_APPROVAL')
const isApproved = computed(() => approvalStatus.value === 'APPROVED')
const STATUS_LABEL = { DRAFT: 'Draft', PENDING_APPROVAL: 'Pending approval', APPROVED: 'Approved' }
const STATUS_CLASS = {
  DRAFT: 'tw:bg-amber-100 tw:text-amber-700',
  PENDING_APPROVAL: 'tw:bg-blue-100 tw:text-blue-700',
  APPROVED: 'tw:bg-green-100 tw:text-green-700',
}

const required = computed({
  get: () => !!template.value?.config?.lineClearanceRequired,
  set: (v) => setRequired(v),
})

async function patchConfig(patch, successMsg) {
  if (!template.value || !canManage.value) return
  try {
    template.value.config = { ...(template.value.config || {}), ...patch }
    await template.value.save()
    if (successMsg) toast.success(successMsg)
  } catch (err) {
    toast.error(err?.message || 'Failed to save')
  }
}

function setRequired(v) {
  patchConfig({ lineClearanceRequired: v }, v ? 'Line clearance is now required before start' : 'Line clearance is now optional')
}

async function saveSchema(schema) {
  if (!template.value || !canManage.value) return
  try {
    template.value.schema = Array.isArray(schema) ? schema : []
    // Editing invalidates any prior approval — back to DRAFT until re-approved.
    template.value.config = { ...(template.value.config || {}), approvalStatus: 'DRAFT' }
    await template.value.save()
    toast.success('Checklist saved (draft) — submit for approval when ready')
  } catch (err) {
    toast.error(err?.message || 'Failed to save checklist')
  }
}

function reviseChecklist() {
  patchConfig({ approvalStatus: 'DRAFT' }, 'Checklist reopened for editing')
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div v-if="template === undefined" class="tw:text-sm tw:text-secondary">Loading…</div>

    <div
      v-else-if="!template"
      class="tw:rounded-lg tw:border tw:border-amber-200 tw:bg-amber-50 tw:px-4 tw:py-3 tw:text-sm tw:text-amber-900"
    >
      No line clearance checklist exists for this company yet. Run
      <code class="tw:px-1">db:reseed:company</code> (or reset) to seed the default checklist,
      then edit it here.
    </div>

    <template v-else>
      <!-- Gate toggle -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:p-4 tw:flex tw:items-start tw:justify-between tw:gap-4">
        <div class="tw:text-sm">
          <div class="tw:font-semibold tw:text-on-main">Require line clearance before start</div>
          <p class="tw:text-secondary tw:mt-0.5">
            When on, you cannot collect samples against an in-process (IPQC) production lot until
            that lot's line clearance is recorded and <strong>passed</strong>. Each new lot is a
            line changeover, so clearance is captured per lot.
          </p>
        </div>
        <BaseSwitch v-model="required" :disabled="!canManage" label="Require line clearance before start" />
      </div>

      <!-- Checklist builder + approval -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:overflow-hidden">
        <div class="tw:px-4 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:flex tw:items-center tw:gap-2">
              Line Clearance Checklist
              <span class="tw:text-micro tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full" :class="STATUS_CLASS[approvalStatus]">
                {{ STATUS_LABEL[approvalStatus] }}
              </span>
            </div>
            <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
              The checklist definition is controlled — edit → submit → a reviewer approves.
            </p>
          </div>
          <div v-if="canManage" class="tw:flex tw:items-center tw:gap-2">
            <BaseButton v-if="isDraft" variant="primary" size="sm" @click="showSubmit = true">
              Submit for approval
            </BaseButton>
            <BaseButton v-else-if="isApproved" variant="outline" size="sm" @click="reviseChecklist">
              Revise checklist
            </BaseButton>
          </div>
        </div>

        <!-- Pending banner + reviewer action -->
        <div
          v-if="isPending"
          class="tw:px-4 tw:py-3 tw:border-b tw:border-blue-200 tw:bg-blue-50 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap"
        >
          <span class="tw:text-sm tw:text-blue-800">
            Pending approval — assigned to a reviewer. Editing is locked until it's approved.
          </span>
          <TaskActionBar entityType="LineClearanceChecklist" :entityId="template.id" />
        </div>

        <div class="tw:p-4">
          <!-- Editable only while DRAFT; otherwise read-only. -->
          <FormBuilder
            v-if="canManage && isDraft"
            title="Line Clearance Checklist"
            :initialSchema="template.schema || []"
            @save="saveSchema"
          />
          <FormSchemaReadonlyView v-else :fields="template.schema || []" />
        </div>
      </div>
    </template>

    <QcApprovalSubmitDialog
      v-model="showSubmit"
      submitUrl="/v1/services/qcInspection/line-clearance-checklist/submit"
      title="Submit Line Clearance checklist for approval"
      intro="The selected reviewer receives a task; on approval the checklist becomes the approved, usable definition."
    />
  </div>
</template>
