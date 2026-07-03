<script setup>
import { DateTime } from 'luxon'
import {
  IconInfoCircle,
  IconCategory,
  IconBell,
  IconSitemap,
  IconFileDescription,
} from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'
import { linkSpawnedToFinding } from '@/utils/auditFindingLink.js'
import { required } from '@shared/components/form/validators.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'
import {
  CHANGE_NATURES,
  CHANGE_DURATIONS,
  YES_NO_OPTIONS,
} from '@/components/changeRequests/changeRequestOptions.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const saving = ref(false)
// Server-side save failure — surfaced persistently in the form footer.
const submitError = ref('')

// Admin-defined custom fields — held locally, persisted after the CR exists.
const customFieldsData = ref({})
const customFieldsRef = ref(null)

const CLASSIFICATIONS = [
  { id: 'MINOR', name: 'Minor' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'CRITICAL', name: 'Critical' },
]

// Cross-module shortcuts: a CR can be spawned from an NC, CAPA,
// audit, etc. via ?source=NC&sourceId=...; we pre-fill the source
// pointers and seed the title from the originating record.
const presetSourceType = computed(() => {
  const q = route.query?.source
  return typeof q === 'string' ? q : null
})
const presetSourceId = computed(() => {
  const q = route.query?.sourceId
  return typeof q === 'string' ? q : null
})

const sourceNc = useLiveQueryWithDeps(
  [() => presetSourceType.value, () => presetSourceId.value],
  async (db, [type, id]) => {
    if (type !== 'NC' || !id) return null
    return db.Nonconformance.findByPk(id)
  },
  { models: ['Nonconformance'] },
)

const sourceCapa = useLiveQueryWithDeps(
  [() => presetSourceType.value, () => presetSourceId.value],
  async (db, [type, id]) => {
    if (type !== 'CAPA' || !id) return null
    return db.Capa.findByPk(id)
  },
  { models: ['Capa'] },
)

// Audit-finding spawn deep link. When 'Spawn → New CR' on a finding,
// this page opens with ?findingId=<id>. Pre-fill from the finding +
// link back via /v1/services/auditFindings/<id>/link on save.
const presetFindingId = computed(() => {
  const q = route.query?.findingId
  return typeof q === 'string' ? q : null
})
const sourceFinding = useLiveQueryWithDeps(
  [() => presetFindingId.value],
  async (db, [id]) => {
    if (!id) return null
    return db.AuditFinding.findByPk(id)
  },
  { models: ['AuditFinding'] },
)

const form = ref({
  title: '',
  description: '',
  changeTypeId: null,
  classification: null,
  changeNature: null,
  changeDuration: null,
  regulatoryImpact: null,
  customerNotificationRequired: null,
  priorityId: 'MEDIUM',
  siteId: null,
  departmentId: null,
  ownerId: currentSession.value?.userId ?? null,
  initiatedAt: DateTime.now(),
  targetImplementationDate: null,
  dueDate: null,
  reasonForChange: '',
  businessJustification: '',
  sourceType: presetSourceType.value || 'DIRECT',
  sourceId: presetSourceId.value || null,
  workflowVersionId: null,
  requiresEffectivenessCheck: false,
  // Per-record cc recipients (notification engine).
  notifyGroupIds: [],
  notifyUserIds: [],
})

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })

// Confirm before abandoning a half-filled CR via in-app navigation (Cancel,
// back, sidebar). allowLeave() is called before the post-save redirect so a
// successful create doesn't prompt. BaseForm covers the browser-level exit.
const { allowLeave } = useUnsavedChangesGuard(isDirty)

// Seed title + site + department from the originating record so the
// owner doesn't have to retype context.
watch(sourceNc, (nc) => {
  if (!nc) return
  if (!form.value.title) {
    form.value.title = `Change from NC ${nc.ncNumber || nc.title}`
  }
  if (!form.value.siteId) form.value.siteId = nc.siteId
  if (!form.value.departmentId) form.value.departmentId = nc.departmentId
})
watch(sourceCapa, (capa) => {
  if (!capa) return
  if (!form.value.title) {
    form.value.title = `Change from CAPA ${capa.capaNumber || capa.title}`
  }
  if (!form.value.siteId) form.value.siteId = capa.siteId
  if (!form.value.departmentId) form.value.departmentId = capa.departmentId
})
watch(sourceFinding, (f) => {
  if (!f) return
  if (!form.value.title) {
    form.value.title = `Change from Audit Finding ${f.findingNumber || ''}`.trim()
  }
  if (!form.value.reasonForChange) form.value.reasonForChange = f.description ?? ''
  if (!form.value.departmentId && f.departmentId) {
    form.value.departmentId = f.departmentId
  }
})

watch(
  () => form.value.siteId,
  () => {
    form.value.departmentId = null
  },
)

// Only show workflows scoped to the Change Control module.
const workflows = useLiveQuery(
  async (db) => {
    const all = await db.Workflow.where().exec()
    return all.filter((w) => w.moduleId === 'CHANGE_CONTROL' && w.statusId === 'ACTIVE')
  },
  { models: ['Workflow'], initial: [] },
)
const activeWorkflowVersions = useLiveQueryWithDeps(
  [() => workflows.value.map((w) => w.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const versions = await Promise.all(
      ids.map((id) =>
        db.WorkflowVersion.where('workflowId', id).orderBy('createdAt', 'desc').first(),
      ),
    )
    return versions.filter((v) => v?.statusId === 'PUBLISHED')
  },
  { models: ['WorkflowVersion'], initial: [] },
)

const workflowVersionOptions = computed(() =>
  activeWorkflowVersions.value.map((v) => {
    const wf = workflows.value.find((w) => w.id === v.workflowId)
    return {
      id: v.id,
      name: wf ? `${wf.name} v${v.versionMajor}.${v.versionMinor}` : `Version ${v.id.slice(0, 8)}`,
    }
  }),
)

// Sticky section nav (FormProgressNav). Section ids mirror the FormSection ids
// below; status shows a check once a section's required fields are satisfied.
const classificationComplete = computed(
  () =>
    !!form.value.changeTypeId &&
    !!form.value.priorityId &&
    !!form.value.siteId &&
    !!form.value.departmentId &&
    !!form.value.ownerId &&
    !!form.value.initiatedAt,
)
const navSections = computed(() => [
  {
    id: 'cr-basic',
    label: 'Basic',
    icon: IconInfoCircle,
    status: form.value.title ? 'complete' : null,
  },
  {
    id: 'cr-classification',
    label: 'Classification',
    icon: IconCategory,
    status: classificationComplete.value ? 'complete' : null,
  },
  { id: 'cr-context', label: 'Context', icon: IconFileDescription, status: null },
  { id: 'cr-notify', label: 'Notify', icon: IconBell, status: null },
  {
    id: 'cr-workflow',
    label: 'Workflow',
    icon: IconSitemap,
    status: form.value.workflowVersionId ? 'complete' : null,
  },
])

// No form-level escape-hatch validation needed — all required values have
// labeled BaseField wrappers with per-field :rules.
function validate() {
  return []
}

// Fires only after validate() and all per-field rules pass. Runs the async
// custom-fields check (which surfaces its own inline errors), then submits.
async function onSubmit() {
  if ((await customFieldsRef.value?.validate()) === false) return

  saving.value = true
  submitError.value = ''
  try {
    const payload = {
      ...form.value,
      initiatedAt: form.value.initiatedAt?.toISODate?.() ?? form.value.initiatedAt,
      targetImplementationDate:
        form.value.targetImplementationDate?.toISODate?.() ?? form.value.targetImplementationDate,
      dueDate: form.value.dueDate?.toISODate?.() ?? form.value.dueDate,
    }
    const response = await post('/v1/services/changeRequests', payload) // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    if (presetFindingId.value && response.changeRequest?.id) {
      try {
        await linkSpawnedToFinding({
          findingId: presetFindingId.value,
          kind: 'CR',
          targetId: response.changeRequest.id,
        })
      } catch (linkErr) {
        toast.notify({
          type: 'warning',
          message:
            linkErr?.message ||
            "CR created, but couldn't link it to the finding — attach manually from the audit page",
        })
      }
    }
    // Persist custom fields against the new CR (best-effort).
    try {
      await customFieldsRef.value?.persist(response.changeRequest.id)
    } catch (cfErr) {
      toast.notify({
        type: 'warning',
        message:
          cfErr?.message ||
          'CR created, but custom fields could not be saved — add them on the CR page',
      })
    }
    allowLeave() // saved — don't prompt on the redirect
    router.push(getCompanyPath(`/change-requests/${response.changeRequest.id}`))
  } catch (e) {
    submitError.value = e.message || 'Failed to create Change Request'
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push(getCompanyPath('/change-requests'))
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs
          :items="[
            { label: 'Change Requests', to: getCompanyPath('/change-requests') },
            { label: 'New Change Request' },
          ]"
        />
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:sticky tw:top-0 tw:z-10 tw:bg-main">
        <FormProgressNav :sections="navSections" />
      </div>
      <BaseForm
        class="tw:py-6"
        :validate="validate"
        :dirty="isDirty"
        :loading="saving"
        :submitError="submitError"
        submitLabel="Create Draft"
        @submit="onSubmit"
        @cancel="goBack"
      >
        <!-- Basic information -->
        <FormSection id="cr-basic" title="Basic information" :icon="IconInfoCircle">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              id="cr-title"
              label="Title"
              required
              :value="form.title"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.title"
                  placeholder="Short summary of the change"
                />
              </template>
            </BaseField>
            <BaseField label="Description">
              <div class="create-cr-editor">
                <BaseRichTextEditor
                  v-model="form.description"
                  placeholder="What is being changed and why?"
                />
              </div>
            </BaseField>
          </div>
        </FormSection>

        <!-- Admin-defined custom fields. Self-hides when none configured. -->
        <CustomFieldsCreateSection
          ref="customFieldsRef"
          v-model="customFieldsData"
          entityType="ChangeRequest"
        />

        <!-- Classification -->
        <FormSection id="cr-classification" title="Classification" :icon="IconCategory">
          <BaseFieldRow :columns="2">
            <BaseField
              id="cr-change-type"
              label="Change Type"
              required
              :value="form.changeTypeId"
              :rules="[required()]"
            >
              <template #default="field">
                <ChangeTypeSelectMenu v-bind="field" v-model="form.changeTypeId" :required="true" />
              </template>
            </BaseField>
            <BaseField label="Classification" optional>
              <BaseSelect
                v-model="form.classification"
                :options="CLASSIFICATIONS"
                optionLabel="name"
                optionValue="id"
                nullLabel="— Select classification —"
              />
            </BaseField>
            <BaseField label="Planned or Emergency" optional>
              <BaseSelect
                v-model="form.changeNature"
                :options="CHANGE_NATURES"
                optionLabel="name"
                optionValue="id"
                nullLabel="— Select —"
              />
            </BaseField>
            <BaseField label="Temporary or Permanent" optional>
              <BaseSelect
                v-model="form.changeDuration"
                :options="CHANGE_DURATIONS"
                optionLabel="name"
                optionValue="id"
                nullLabel="— Select —"
              />
            </BaseField>
            <BaseField label="Regulatory Impact" optional>
              <BaseSelect
                v-model="form.regulatoryImpact"
                :options="YES_NO_OPTIONS"
                optionLabel="name"
                optionValue="id"
                nullLabel="— Select —"
              />
            </BaseField>
            <BaseField label="Customer Notification Required" optional>
              <BaseSelect
                v-model="form.customerNotificationRequired"
                :options="YES_NO_OPTIONS"
                optionLabel="name"
                optionValue="id"
                nullLabel="— Select —"
              />
            </BaseField>
            <BaseField
              id="cr-priority"
              label="Priority"
              required
              :value="form.priorityId"
              :rules="[required()]"
            >
              <template #default="field">
                <ChangeRequestPrioritySelectMenu
                  v-bind="field"
                  v-model="form.priorityId"
                  :required="true"
                />
              </template>
            </BaseField>
            <BaseField
              id="cr-site"
              label="Site"
              required
              :value="form.siteId"
              :rules="[required()]"
            >
              <template #default="field">
                <SiteSelectMenu v-bind="field" v-model="form.siteId" required />
              </template>
            </BaseField>
            <BaseField
              id="cr-department"
              label="Department"
              required
              :value="form.departmentId"
              :rules="[required()]"
            >
              <template #default="field">
                <DepartmentSelectMenu
                  v-bind="field"
                  v-model="form.departmentId"
                  :siteId="form.siteId"
                  required
                />
              </template>
            </BaseField>
            <BaseField
              id="cr-owner"
              label="Responsible party"
              required
              hint="Drives the change request to closure. You remain the initiator."
              :value="form.ownerId"
              :rules="[required()]"
            >
              <template #default="field">
                <UserSelectMenu v-bind="field" v-model="form.ownerId" required />
              </template>
            </BaseField>
            <BaseField
              id="cr-initiated"
              label="Initiated"
              required
              :value="form.initiatedAt"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseDateField v-bind="field" v-model="form.initiatedAt" mode="date" />
              </template>
            </BaseField>
            <BaseField label="Target Implementation Date" optional>
              <BaseDateField v-model="form.targetImplementationDate" mode="date" />
            </BaseField>
            <BaseField label="Due Date" optional>
              <BaseDateField v-model="form.dueDate" mode="date" />
            </BaseField>
          </BaseFieldRow>
        </FormSection>

        <!-- Context (optional) -->
        <FormSection
          id="cr-context"
          title="Context"
          :icon="IconFileDescription"
          optional
          collapsible
          :defaultOpen="false"
        >
          <div class="tw:flex tw:flex-col tw:gap-4">
            <BaseField label="Reason for Change">
              <div class="create-cr-editor">
                <BaseRichTextEditor
                  v-model="form.reasonForChange"
                  placeholder="What's driving this change? (audit finding, regulatory update, NC, supplier change, etc.)"
                />
              </div>
            </BaseField>
            <BaseField label="Business Justification">
              <div class="create-cr-editor">
                <BaseRichTextEditor
                  v-model="form.businessJustification"
                  placeholder="Why is this change worth the effort? Cost / quality / compliance impact."
                />
              </div>
            </BaseField>
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch v-model="form.requiresEffectivenessCheck" />
              <div>
                <div class="tw:text-sm tw:font-semibold tw:text-on-main">
                  Requires effectiveness check
                </div>
                <div class="tw:text-xs tw:text-secondary">
                  Track post-implementation verification. CAPA-style — recommended for MAJOR or
                  CRITICAL changes.
                </div>
              </div>
            </label>
          </div>
        </FormSection>

        <!-- Notify (cc) — engine fans out in-app + email on create / status change -->
        <FormSection
          id="cr-notify"
          title="Notify (cc)"
          :icon="IconBell"
          optional
          collapsible
          :defaultOpen="false"
        >
          <NotificationCcField
            v-model:groupIds="form.notifyGroupIds"
            v-model:userIds="form.notifyUserIds"
          />
        </FormSection>

        <!-- Workflow -->
        <FormSection id="cr-workflow" title="Workflow" :icon="IconSitemap">
          <BaseField
            id="cr-workflow-version"
            label="Workflow"
            required
            :value="form.workflowVersionId"
            :rules="[required()]"
          >
            <template #default="field">
              <BaseSelect
                v-bind="field"
                v-model="form.workflowVersionId"
                :options="workflowVersionOptions"
                optionLabel="name"
                optionValue="id"
                :required="true"
                nullLabel="— Select workflow —"
              />
            </template>
          </BaseField>
        </FormSection>
      </BaseForm>
    </div>
  </BasePage>
</template>

<style scoped>
.create-cr-editor :deep(.rich-text-editor-content) {
  max-height: 10rem;
  overflow-y: auto;
}
</style>
