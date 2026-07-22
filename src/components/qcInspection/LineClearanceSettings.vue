<script setup>
/**
 * QC Inspection → Line Clearance. Configure the per-company line-clearance /
 * sanitation checklist (a FormTemplate marked internalName 'QC_LINE_CLEARANCE')
 * and whether a passed clearance is REQUIRED before an in-process inspection can
 * start. QA edits the questions in the form builder; changes save via syncEngine.
 */
import { isAllowed } from '@/utils/currentSession.js'

const toast = useToast()
const canManage = computed(() => isAllowed(['inspection_qc:create']))

const template = useLiveQuery(
  async (db) => (await db.FormTemplate.where().exec()).find((t) => t.internalName === 'QC_LINE_CLEARANCE') ?? null,
  { models: ['FormTemplate'], initial: undefined },
)

const required = computed({
  get: () => !!template.value?.config?.lineClearanceRequired,
  set: (v) => setRequired(v),
})

async function setRequired(v) {
  if (!template.value || !canManage.value) return
  try {
    template.value.config = { ...(template.value.config || {}), lineClearanceRequired: v }
    await template.value.save()
    toast.success(v ? 'Line clearance is now required before start' : 'Line clearance is now optional')
  } catch (err) {
    toast.error(err?.message || 'Failed to update setting')
  }
}

async function saveSchema(schema) {
  if (!template.value || !canManage.value) return
  try {
    template.value.schema = Array.isArray(schema) ? schema : []
    await template.value.save()
    toast.success('Checklist saved')
  } catch (err) {
    toast.error(err?.message || 'Failed to save checklist')
  }
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

      <!-- Checklist builder -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:overflow-hidden">
        <div class="tw:px-4 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">Line Clearance Checklist</div>
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            Questions QA answers before releasing the line. Edit and Save to update.
          </p>
        </div>
        <div class="tw:p-4">
          <FormBuilder
            v-if="canManage"
            title="Line Clearance Checklist"
            :initialSchema="template.schema || []"
            @save="saveSchema"
          />
          <FormSchemaReadonlyView v-else :fields="template.schema || []" />
        </div>
      </div>
    </template>
  </div>
</template>
