<script setup>
import { DateTime } from 'luxon'
import {
  IconInfoCircle,
  IconCategory,
  IconPackage,
  IconBell,
  IconSitemap,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'
import WorkflowReviewerPickerDialog from '@/components/workflow/WorkflowReviewerPickerDialog.vue'
import WorkflowVersionSelect from '@/components/documents/WorkflowVersionSelect.vue'
import { NC_MODULE, CAPA_MODULE } from '@/components/workflow/workflowModule.js'
import { linkSpawnedToFinding } from '@/utils/auditFindingLink.js'
import { required, requiredWhen } from '@shared/components/form/validators.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const workflowPickerRef = ref(null)
// The person raising the NC. Fed to the reviewer picker as the smart
// default: any step whose candidate pool includes the initiator is
// pre-assigned to them (user rule 2026-08-10) — changeable per step.
const initiatorId = computed(() => currentSession.value?.userId ?? null)

// Two-screen wizard (user decision 2026-08-10): screen 1 is ONLY the
// workflow choice — clicking a card (or Continue on the pre-selected
// default) advances to screen 2, the NC details form. A "Change" button
// on the details screen returns to screen 1 with everything preserved.
const screen = ref('workflow')

function goToDetails() {
  if (!form.value.workflowVersionId) return
  screen.value = 'details'
}
const saving = ref(false)
// Server-side save failure — surfaced persistently in the form footer.
const submitError = ref('')

const SEVERITY_OPTIONS = [
  { label: 'Minor', value: 'MINOR' },
  { label: 'Major', value: 'MAJOR' },
  { label: 'Critical', value: 'CRITICAL' },
]
const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
]

// Admin-defined custom fields (Settings → Custom Fields). The NC doesn't exist
// yet, so answers live here and are persisted after creation via cfRef.persist.
const customFieldsData = ref({})
const customFieldsRef = ref(null)

// ── Supplier shortcut: raise NC + linked 8D CAPA in one go ────────────
// For supplier-facing NCs the Submit button opens a small dialog asking
// "Create a linked CAPA?" + a CAPA workflow (defaulted to the SCAR 8D).
// The backend creates + auto-assigns + opens both records.
const showCapaShortcut = ref(false)
const createCapa = ref(true)
const capaWorkflowVersionId = ref(null)

const capaWorkflows = useLiveQuery(
  async (db) => db.Workflow.where('moduleId', CAPA_MODULE.workflowVersionModuleId).exec(),
  { initial: [] },
)
const capaVersions = useLiveQuery(async (db) => db.WorkflowVersion.where().exec(), { initial: [] })

// Resolve the seeded "SCAR (Supplier 8D Response)" published version to default the picker.
const scar8dVersionId = computed(() => {
  const scar = capaWorkflows.value.find(
    (w) => w.statusId === 'ACTIVE' && /scar|8d/i.test(w.name || ''),
  )
  if (!scar) return null
  return (
    capaVersions.value.find((v) => v.workflowId === scar.id && v.statusId === 'PUBLISHED')?.id ??
    null
  )
})

// ── Audit-finding spawn deep link ─────────────────────────────────
// When the user clicks 'Spawn → New NC' on an audit finding, this
// page opens with ?findingId=<id>. We pre-fill common fields from
// the finding (title, description, source=AUDIT, type=AUDIT_FINDING,
// department, supplier) and link the resulting NC back to the
// finding on save.
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
  siteId: null,
  departmentId: null,
  typeId: null,
  sourceId: null,
  severityId: 'MINOR',
  detectedAt: DateTime.now(),
  ownerId: currentSession.value?.userId ?? null,
  productId: null,
  supplierId: null,
  // When true, the workflow attached to this NC routes every step's
  // assignee from supplier users (entity.supplierId) instead of the
  // internal role pool. The internal creator stays as owner; supplier
  // users get co-owner access via the workflow auto-share. Backend
  // requires supplierId to be set when this is true, and refuses
  // changes once the NC leaves DRAFT.
  isSupplierFacing: false,
  // Top-section classification / commercial-reference fields (added
  // 2026-05-29). All optional — intake may not know any of these yet.
  ncIssueTypeId: null,
  priorityId: null,
  dueDate: null,
  poNumber: '',
  orderNumber: '',
  lotNumber: '',
  qtyAffected: null,
  unitOfMeasure: '',
  workflowVersionId: null,
  immediateContainmentAction: '',
  // Groups emailed when the NC is raised and when it closes. Email-only —
  // no tasks, no access granted (unlike workflow step assignment).
  notifyGroupIds: [],
  notifyUserIds: [],
})

// Resolve the chosen workflow's name + version for the details screen's
// context strip (versions don't carry the name — the parent Workflow does).
// NOTE: must sit BELOW the `form` declaration — useLiveQueryWithDeps
// evaluates dep getters eagerly at setup (same TDZ crash class as the
// FieldRecordsList incident).
const selectedWorkflowVersion = useLiveQueryWithDeps(
  [() => form.value.workflowVersionId],
  async (db, [id]) => (id ? db.WorkflowVersion.findByPk(id) : null),
  { models: ['WorkflowVersion'] },
)
const selectedWorkflow = useLiveQueryWithDeps(
  [() => selectedWorkflowVersion.value?.workflowId],
  async (db, [id]) => (id ? db.Workflow.findByPk(id) : null),
  { models: ['Workflow'] },
)
const selectedWorkflowLabel = computed(() => {
  const v = selectedWorkflowVersion.value
  if (!v) return ''
  const name = selectedWorkflow.value?.name || 'Workflow'
  return `${name} · v${v.versionLabel || `${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`}`
})

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })

// Confirm before abandoning a half-filled NC via in-app navigation (Cancel,
// back, sidebar). allowLeave() is called before the post-save redirect so a
// successful raise doesn't prompt. BaseForm covers the browser-level exit.
const { allowLeave } = useUnsavedChangesGuard(isDirty)

// When the source finding loads, seed the title / description /
// source / type / department / supplier so the user doesn't have
// to retype the context. nc_sources 'AUDIT' + nc_types
// 'AUDIT_FINDING' are global seeds (see database.sql).
watch(sourceFinding, (f) => {
  if (!f) return
  if (!form.value.title) {
    form.value.title = `Audit Finding ${f.findingNumber || ''}`.trim()
  }
  if (!form.value.description) form.value.description = f.description ?? ''
  if (!form.value.sourceId) form.value.sourceId = 'AUDIT'
  if (!form.value.typeId) form.value.typeId = 'AUDIT_FINDING'
  if (!form.value.departmentId && f.departmentId) {
    form.value.departmentId = f.departmentId
  }
  if (!form.value.supplierId && f.supplierId) {
    form.value.supplierId = f.supplierId
  }
})

// Rich-text "has content": an empty editor still emits markup ('<p></p>'),
// so required checks must strip tags before testing.
function richTextFilled(v) {
  return !!v && v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
}

// Sticky section nav (FormProgressNav). Section ids mirror the FormSection ids
// below; status shows a check once a section's required fields are satisfied.
const classificationComplete = computed(
  () =>
    !!form.value.siteId &&
    !!form.value.departmentId &&
    !!form.value.typeId &&
    !!form.value.sourceId &&
    !!form.value.severityId &&
    !!form.value.detectedAt &&
    !!form.value.ownerId,
)
// (No Workflow entry — the workflow is chosen on its own screen before
// this form is reachable; the context strip above the form shows it.)
const navSections = computed(() => [
  {
    id: 'nc-basic',
    label: 'Basic',
    icon: IconInfoCircle,
    status:
      form.value.title && richTextFilled(form.value.immediateContainmentAction)
        ? 'complete'
        : null,
  },
  {
    id: 'nc-classification',
    label: 'Classification',
    icon: IconCategory,
    status: classificationComplete.value ? 'complete' : null,
  },
  {
    id: 'nc-product',
    label: 'Product',
    icon: IconPackage,
    status: form.value.productId ? 'complete' : null,
  },
  { id: 'nc-notify', label: 'Notify', icon: IconBell, status: null },
])

// Per-field rules live on each <BaseField :rules> (see validators.js). The
// workflow is picked on its own screen before this form is reachable, so this
// check is a safety net only (e.g. the selection was somehow cleared) — it
// bounces the user back to the workflow screen.
function validate() {
  if (!form.value.workflowVersionId) {
    screen.value = 'workflow'
    return [
      { id: 'nc-workflow', label: 'Workflow', message: 'Pick a workflow before submitting.' },
    ]
  }
  return []
}

// Fires only after `validate()` passes. Runs the async custom-fields check
// (which surfaces its own inline errors), then branches: supplier-facing →
// the CAPA shortcut dialog; internal → the per-step reviewer picker.
async function onSubmit() {
  if ((await customFieldsRef.value?.validate()) === false) return

  if (form.value.isSupplierFacing) {
    createCapa.value = true
    capaWorkflowVersionId.value = scar8dVersionId.value
    showCapaShortcut.value = true
    return
  }

  workflowPickerRef.value.submit()
}

function goBack() {
  router.push(getCompanyPath('/nonconformances'))
}

// Supplier shortcut confirm — POST the combined raise endpoint.
async function confirmSupplierRaise() {
  if (createCapa.value && !capaWorkflowVersionId.value) {
    toast.notify({ type: 'negative', message: 'Pick a CAPA workflow' })
    return
  }
  saving.value = true
  try {
    const { nonconformance, capa, opened } = await post('/v1/services/nonconformances/raise', {
      ...form.value,
      createCapa: createCapa.value,
      capaWorkflowVersionId: createCapa.value ? capaWorkflowVersionId.value : null,
    })
    if (!opened) {
      toast.notify({
        type: 'warning',
        message:
          'Created as Draft — invite a supplier portal user for this supplier, then Open the NC/CAPA to start the workflow.',
      })
    } else {
      toast.notify({
        type: 'positive',
        message: capa ? `NC raised + ${capa.capaNumber} opened` : 'NC raised',
      })
    }
    // Persist custom fields against the new NC (best-effort — a values save
    // failure must not lose the NC; the user can fill them on the detail page).
    try {
      await customFieldsRef.value?.persist(nonconformance.id)
    } catch (cfErr) {
      toast.notify({
        type: 'warning',
        message:
          cfErr?.message ||
          'NC raised, but custom fields could not be saved — add them on the NC page',
      })
    }
    showCapaShortcut.value = false
    allowLeave() // saved — don't prompt on the redirect
    router.push(getCompanyPath(`/nonconformances/${nonconformance.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to raise NC' })
  } finally {
    saving.value = false
  }
}

async function handleReviewersConfirmed(reviewers) {
  saving.value = true
  submitError.value = ''
  try {
    const response = await post('/v1/services/nonconformances', { ...form.value, reviewers })
    // Create-and-open (client decision 2026-08-10): Create NC also starts the
    // workflow — no separate Open NC step. Best-effort: an open failure (e.g.
    // a step lost its assignee) leaves a recoverable DRAFT and the detail
    // page's Open NC button still exists for it.
    try {
      await post(`/v1/services/nonconformances/${response.nonconformance.id}/submitForReview`, {})
      toast.notify({ type: 'positive', message: 'NC created and opened — workflow started' })
    } catch (openErr) {
      toast.notify({
        type: 'warning',
        message: openErr?.message
          ? `NC created as draft — could not open: ${openErr.message}`
          : 'NC created as draft — open it from the NC page',
      })
    }
    // If this NC was spawned from an audit finding, link the new
    // NC back so the finding's chip lights up. Best-effort —
    // a link failure shouldn't drop the NC we just created.
    if (presetFindingId.value && response.nonconformance?.id) {
      try {
        await linkSpawnedToFinding({
          findingId: presetFindingId.value,
          kind: 'NC',
          targetId: response.nonconformance.id,
        })
      } catch (linkErr) {
        toast.notify({
          type: 'warning',
          message:
            linkErr?.message ||
            "NC created, but couldn't link it to the finding — attach manually from the audit page",
        })
      }
    }
    // Persist custom fields against the new NC (best-effort).
    try {
      await customFieldsRef.value?.persist(response.nonconformance.id)
    } catch (cfErr) {
      toast.notify({
        type: 'warning',
        message:
          cfErr?.message ||
          'NC created, but custom fields could not be saved — add them on the NC page',
      })
    }
    allowLeave() // saved — don't prompt on the redirect
    router.push(getCompanyPath(`/nonconformances/${response.nonconformance.id}`))
  } catch (e) {
    submitError.value = e.message || 'Failed to create NC'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage :width="screen === 'workflow' ? 'narrow' : 'standard'" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs
          :items="[
            { label: 'Nonconformances', to: getCompanyPath('/nonconformances') },
            { label: 'Raise NC' },
          ]"
        />
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <!-- Screen 1 — workflow choice only (user decision 2026-08-10).
           Clicking a card advances; Continue covers the pre-selected
           default-workflow case. -->
      <div v-if="screen === 'workflow'" class="tw:py-6 tw:flex tw:flex-col tw:gap-5">
        <div>
          <BaseText as="h2" weight="bold" class="tw:text-lg">Select a workflow</BaseText>
          <p class="tw:text-sm tw:text-secondary tw:mt-1">
            Every nonconformance follows an approval workflow. Pick the process this NC will
            follow — you'll describe the event on the next screen.
          </p>
        </div>
        <WorkflowVersionSelect
          v-model="form.workflowVersionId"
          :moduleId="NC_MODULE.workflowVersionModuleId"
          @pick="goToDetails"
        />
        <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-4 tw:border-t tw:border-divider">
          <BaseButton variant="outline" @click="goBack">Cancel</BaseButton>
          <BaseButton variant="primary" :disabled="!form.workflowVersionId" @click="goToDetails">
            Continue
          </BaseButton>
        </div>
      </div>

      <!-- Screen 2 — the NC details form, with a context strip recalling
           the chosen workflow (Change returns to screen 1, data intact). -->
      <template v-else>
      <div class="tw:sticky tw:top-0 tw:z-10 tw:bg-main">
        <FormProgressNav :sections="navSections" />
      </div>

      <div
        class="tw:mt-4 tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-4 tw:py-3"
      >
        <IconSitemap :size="18" class="tw:text-primary tw:shrink-0" />
        <div class="tw:min-w-0 tw:flex-1">
          <p class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
            {{ selectedWorkflowLabel || 'Workflow selected' }}
          </p>
          <p v-if="form.isSupplierFacing" class="tw:text-xs tw:text-secondary">
            Supplier-facing NCs are auto-assigned to the supplier's first portal user and opened
            on Submit — you can reassign any step afterwards.
          </p>
        </div>
        <BaseButton variant="outline" size="sm" @click="screen = 'workflow'">Change</BaseButton>
        <!-- Submit-time per-step reviewer dialog — select suppressed, the
             workflow was chosen on screen 1. -->
        <WorkflowReviewerPickerDialog
          ref="workflowPickerRef"
          v-model="form.workflowVersionId"
          hideSelect
          :module="NC_MODULE"
          :isSupplierFacing="form.isSupplierFacing"
          :supplierId="form.supplierId"
          :ownerId="form.ownerId"
          :preferUserId="initiatorId"
          @submit="handleReviewersConfirmed"
        />
      </div>

      <BaseForm
        class="tw:py-6"
        :validate="validate"
        :dirty="isDirty"
        :loading="saving"
        :submitError="submitError"
        submitLabel="Create NC"
        @submit="onSubmit"
        @cancel="goBack"
      >
        <!-- Basic information -->
        <FormSection id="nc-basic" title="Basic information" :icon="IconInfoCircle">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              id="nc-title"
              label="Title"
              required
              :value="form.title"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.title"
                  placeholder="Describe the nonconformance…"
                />
              </template>
            </BaseField>
            <BaseField label="Description">
              <div class="create-nc-editor">
                <BaseRichTextEditor
                  v-model="form.description"
                  placeholder="Provide details about the nonconformance…"
                />
              </div>
            </BaseField>
            <!-- Immediate containment — promoted into Basic information and
                 made REQUIRED (client decision 2026-08-10). The rule strips
                 markup: an empty editor still emits '<p></p>'. -->
            <BaseField
              id="nc-containment"
              label="Immediate containment action"
              required
              :value="form.immediateContainmentAction"
              :rules="[
                (v) => richTextFilled(v) || 'Immediate containment action is required.',
              ]"
            >
              <div class="create-nc-editor">
                <BaseRichTextEditor
                  v-model="form.immediateContainmentAction"
                  placeholder="Describe actions taken at the time of detection…"
                />
              </div>
            </BaseField>
            <SimilarRecordsPanel
              entityType="Nonconformance"
              :searchInTypes="['Nonconformance']"
              :getText="() => `${form.title} ${form.description || ''}`"
            />
          </div>
        </FormSection>

        <!-- Admin-defined custom fields (Additional information). Right after the
             basic card; self-hides when none are configured for Nonconformance. -->
        <CustomFieldsCreateSection
          ref="customFieldsRef"
          v-model="customFieldsData"
          entityType="Nonconformance"
        />

        <!-- Classification -->
        <FormSection id="nc-classification" title="Classification" :icon="IconCategory">
          <BaseFieldRow :columns="2">
            <BaseField
              id="nc-site"
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
              id="nc-department"
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
              id="nc-type"
              label="NC Type"
              required
              :value="form.typeId"
              :rules="[required()]"
            >
              <template #default="field">
                <NcTypeSelectMenu v-bind="field" v-model="form.typeId" required />
              </template>
            </BaseField>
            <BaseField
              id="nc-source"
              label="Detection source"
              required
              :value="form.sourceId"
              :rules="[required()]"
            >
              <template #default="field">
                <NcSourceSelectMenu v-bind="field" v-model="form.sourceId" required />
              </template>
            </BaseField>
            <BaseField label="Issue type" optional>
              <NcIssueTypeSelectMenu v-model="form.ncIssueTypeId" />
            </BaseField>
            <BaseField
              id="nc-severity"
              label="Severity"
              required
              :value="form.severityId"
              :rules="[required()]"
            >
              <template #default="field">
                <SegmentedControl
                  v-bind="field"
                  v-model="form.severityId"
                  :options="SEVERITY_OPTIONS"
                />
              </template>
            </BaseField>
            <BaseField id="nc-priority" label="Priority" optional>
              <template #default="field">
                <SegmentedControl
                  v-bind="field"
                  v-model="form.priorityId"
                  :options="PRIORITY_OPTIONS"
                  nullable
                />
              </template>
            </BaseField>
            <BaseField
              id="nc-detected"
              label="Detected date"
              required
              :value="form.detectedAt"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseDateField v-bind="field" v-model="form.detectedAt" mode="date" />
              </template>
            </BaseField>
            <BaseField label="Due date" optional>
              <BaseDateField v-model="form.dueDate" mode="date" />
            </BaseField>
            <BaseField
              id="nc-owner"
              label="Responsible party"
              required
              hint="Drives the NC to closure. You remain the initiator."
              :value="form.ownerId"
              :rules="[required()]"
            >
              <template #default="field">
                <UserSelectMenu v-bind="field" v-model="form.ownerId" required />
              </template>
            </BaseField>
          </BaseFieldRow>
        </FormSection>

        <!-- Product & material — default EXPANDED with a required Item
             (client decision 2026-08-10). The menu itself stays
             required=false: the required convention would auto-fill the
             FIRST item, and a silently-wrong item is worse than an empty
             field — the BaseField rule enforces the pick instead. -->
        <FormSection id="nc-product" title="Product & material" :icon="IconPackage" collapsible>
          <BaseFieldRow :columns="2">
            <!-- Labeled "Item" per the Item-Master UI convention (DB stays
                 products) — also keeps the label distinct from the progress
                 nav's "Product" chip. -->
            <BaseField
              id="nc-product-item"
              label="Item"
              required
              :value="form.productId"
              :rules="[required()]"
            >
              <template #default="field">
                <ProductSelectMenu
                  v-bind="field"
                  v-model="form.productId"
                  :required="false"
                  nullLabel="— Select item —"
                />
              </template>
            </BaseField>
            <BaseField
              id="nc-supplier"
              label="Supplier"
              :required="form.isSupplierFacing"
              :value="form.supplierId"
              :rules="[
                requiredWhen(
                  () => form.isSupplierFacing,
                  'Pick a supplier before marking this NC as supplier-facing.',
                ),
              ]"
            >
              <template #default="field">
                <SupplierSelectMenu
                  v-bind="field"
                  v-model="form.supplierId"
                  :required="form.isSupplierFacing"
                />
                <label
                  class="tw:flex tw:items-start tw:gap-2 tw:mt-2 tw:cursor-pointer tw:select-none"
                >
                  <BaseCheckbox v-model="form.isSupplierFacing" />
                  <div>
                    <BaseText>Supplier-facing NC</BaseText>
                    <BaseCaption class="tw:block">
                      Workflow steps will be reviewed by users from the selected supplier (you'll
                      pick the specific reviewer per step when you open the NC). Lockable once
                      opened.
                    </BaseCaption>
                  </div>
                </label>
              </template>
            </BaseField>
            <BaseField label="Qty affected">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.qtyAffected"
                  type="number"
                  placeholder="0"
                />
              </template>
            </BaseField>
            <BaseField label="Unit of measure">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.unitOfMeasure"
                  placeholder="e.g. sheets, units…"
                />
              </template>
            </BaseField>
            <BaseField label="PO #">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.poNumber"
                  placeholder="Purchase order number"
                />
              </template>
            </BaseField>
            <BaseField label="Order #">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.orderNumber"
                  placeholder="Customer / sales order"
                />
              </template>
            </BaseField>
            <BaseField label="Lot #">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.lotNumber"
                  placeholder="Material / production lot"
                />
              </template>
            </BaseField>
          </BaseFieldRow>
        </FormSection>

        <!-- Notify (cc) — engine fans out in-app + email on create / status change -->
        <FormSection
          id="nc-notify"
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

      </BaseForm>
      </template>
    </div>

    <!-- Supplier shortcut: Create linked 8D CAPA? -->
    <BaseDialog v-model="showCapaShortcut" title="Raise supplier NC" maxWidth="md" persistent>
      <div class="tw:flex tw:flex-col tw:gap-4 tw:py-1">
        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">Also create a linked CAPA?</span>
          <div class="tw:flex tw:gap-2">
            <BaseButton
              class="tw:flex-1 tw:justify-center"
              :variant="createCapa ? 'primary' : 'outline'"
              @click="createCapa = true"
              >Yes</BaseButton
            >
            <BaseButton
              class="tw:flex-1 tw:justify-center"
              :variant="!createCapa ? 'primary' : 'outline'"
              @click="createCapa = false"
              >No</BaseButton
            >
          </div>
        </div>

        <div v-if="createCapa" class="tw:flex tw:flex-col tw:gap-1.5">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">CAPA workflow</span>
          <!-- compact: a dropdown, not the card panels — this dialog is a
               quick confirm, and the SCAR 8D default is already preselected. -->
          <WorkflowVersionSelect
            v-model="capaWorkflowVersionId"
            :moduleId="CAPA_MODULE.workflowVersionModuleId"
            compact
          />
        </div>

        <p class="tw:text-xs tw:text-secondary">
          The NC{{ createCapa ? ' and the linked CAPA are' : ' is' }} created, assigned to the
          supplier's first portal user (and your internal default approver), and opened
          automatically. You can reassign or change anything afterwards.
        </p>
      </div>

      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="`Raise NC${createCapa ? ' + CAPA' : ''}`"
          :loading="saving"
          :disabled="createCapa && !capaWorkflowVersionId"
          @cancel="close"
          @submit="confirmSupplierRaise"
        />
      </template>
    </BaseDialog>
  </BasePage>
</template>

<style scoped>
.create-nc-editor :deep(.rich-text-editor-content) {
  max-height: 10rem;
  overflow-y: auto;
}
</style>
