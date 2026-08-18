<script setup>
import { DateTime } from 'luxon'
import { IconInfoCircle, IconCategory, IconBell, IconSitemap } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'
import WorkflowReviewerPickerDialog from '@/components/workflow/WorkflowReviewerPickerDialog.vue'
import { CAPA_MODULE } from '@/components/workflow/workflowModule.js'
import { useActiveWorkflowEntries } from '@/composables/useActiveWorkflowEntries.js'
import { linkSpawnedToFinding } from '@/utils/auditFindingLink.js'
import { capaPriorityFromNcSeverity } from '@/utils/qualityEscalation.js'
import { required, requiredWhen } from '@shared/components/form/validators.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const saving = ref(false)
const workflowPickerRef = ref(null)
// The person raising the CAPA. Fed to the reviewer picker as the smart
// default: any step whose candidate pool includes the initiator is
// pre-assigned to them — the same rule CapaWorkflowDraftPreview applies on
// the CAPA page, so picking here changes nothing except WHEN you're asked.
const initiatorId = computed(() => currentSession.value?.userId ?? null)
// Server-side save failure — surfaced persistently in the form footer.
const submitError = ref('')

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
]

// Admin-defined custom fields — answers held locally, persisted after the CAPA
// exists (see customFieldsRef.persist in handleCreate).
const customFieldsData = ref({})
const customFieldsRef = ref(null)

const presetNcId = computed(() => {
  const q = route.query?.ncId
  return typeof q === 'string' ? q : null
})

const sourceNc = useLiveQueryWithDeps(
  [() => presetNcId.value],
  async (db, [id]) => {
    if (!id) return null
    return db.Nonconformance.findByPk(id)
  },
  { models: ['Nonconformance'] },
)

// Audit-finding spawn deep link. When the user clicks 'Spawn → New
// CAPA' on an audit finding, this page opens with ?findingId=<id>.
// We seed common fields from the finding and link the resulting
// CAPA back via /v1/services/auditFindings/<id>/link on save.
// One CAPA can be raised from several failed-requirement findings selected
// on the audit page: ?findingIds=a,b,c (plural). The legacy single ?findingId
// is folded in. We seed common fields from the FIRST finding and link ALL of
// them back on save.
const presetFindingIds = computed(() => {
  const single = route.query?.findingId
  const multi = route.query?.findingIds
  const ids = []
  if (typeof single === 'string' && single) ids.push(single)
  if (typeof multi === 'string' && multi) {
    ids.push(
      ...multi
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
  }
  return [...new Set(ids)]
})
const presetFindingId = computed(() => presetFindingIds.value[0] ?? null)
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
  // Shared quality classification — inherited from the source NC / event.
  categoryId: null,
  typeId: null,
  // Source kind — a CapaSource id (NC / INTERNAL_AUDIT / …). When the CAPA
  // was spawned from a specific row, `sourceId` below points at it.
  sourceType: presetNcId.value ? 'NC' : null,
  priorityId: 'MEDIUM',
  initiatedAt: DateTime.now(),
  dueDate: null,
  ownerId: currentSession.value?.userId ?? null,
  // Optional pointer to the originating row when source_type maps to a known
  // table (e.g. source_type='NC' → source_id = a Nonconformance id).
  sourceId: presetNcId.value || null,
  rootCauseCategoryId: null,
  workflowVersionId: null,
  supplierId: null,
  // When true, the workflow attached to this CAPA routes every step's
  // assignee from supplier users (entity.supplierId) instead of the
  // internal role pool. Requires supplierId. Immutable post-DRAFT.
  isSupplierFacing: false,
  // Per-record cc recipients (notification engine).
  notifyGroupIds: [],
  notifyUserIds: [],
})

// ── Workflow — two-screen wizard, same as NC (user decision 2026-08-14) ─────
// Screen 1 is ONLY the workflow choice (cards, default pre-selected); screen 2
// is the CAPA details form with a context strip + Change button. With exactly
// ONE active workflow, screen 1 is skipped entirely. The CAPA is still created
// as a DRAFT — reviewers are assigned on the CAPA page's draft plan and the
// workflow starts on Start CAPA; the choice stays changeable from the CAPA
// page's Workflow rail card while DRAFT.
const screen = ref('workflow')

function goToDetails() {
  if (!form.value.workflowVersionId) return
  screen.value = 'details'
}

const { entries: activeWorkflowEntries } = useActiveWorkflowEntries(
  CAPA_MODULE.workflowVersionModuleId,
)
const singleWorkflow = computed(() => activeWorkflowEntries.value.length === 1)
const workflowAutoSkipped = ref(false)
watch(
  activeWorkflowEntries,
  (entries) => {
    if (workflowAutoSkipped.value || screen.value !== 'workflow') return
    if (entries.length !== 1) return
    workflowAutoSkipped.value = true
    form.value.workflowVersionId = entries[0].version.id
    screen.value = 'details'
  },
  { immediate: true },
)

// Name + version for the details screen's context strip (versions don't
// carry the name — the parent Workflow row does).
const selectedWorkflowLabel = computed(() => {
  const e = activeWorkflowEntries.value.find((x) => x.version.id === form.value.workflowVersionId)
  if (!e) return ''
  return `${e.workflow.name} · v${
    e.version.versionLabel || `${e.version.versionMajor ?? 1}.${e.version.versionMinor ?? 0}`
  }`
})

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })

// Confirm before abandoning a half-filled CAPA via in-app navigation (Cancel,
// back, sidebar). allowLeave() is called before the post-save redirect so a
// successful create doesn't prompt. BaseForm covers the browser-level exit.
const { allowLeave } = useUnsavedChangesGuard(isDirty)

// When the source finding loads, seed source = INTERNAL_AUDIT,
// sourceId = finding.id (audit findings live in audit_findings, so
// the source_id FK points at the finding row), title + description
// from the finding, department + supplier inherited so the CAPA
// owner doesn't retype context. capa_sources 'INTERNAL_AUDIT' /
// 'EXTERNAL_AUDIT' are global seeds (see database.sql).
watch(sourceFinding, (f) => {
  if (!f) return
  if (!form.value.title) {
    form.value.title = `CAPA for Finding ${f.findingNumber || ''}`.trim()
  }
  if (!form.value.description) form.value.description = f.description ?? ''
  if (!form.value.sourceType) form.value.sourceType = 'INTERNAL_AUDIT'
  if (!form.value.sourceId) form.value.sourceId = f.id
  if (!form.value.departmentId && f.departmentId) {
    form.value.departmentId = f.departmentId
  }
  if (!form.value.supplierId && f.supplierId) {
    form.value.supplierId = f.supplierId
  }
})

// When the source NC loads, carry its context down so the CAPA opens already
// describing the same problem (2026-08-18). A CAPA raised from an NC is the
// next step on one quality event, not a fresh record — retyping the problem
// statement invites a second, subtly different account of it in the file.
//
// Every field is seeded only when still empty, so a user who typed something
// before the live query resolved keeps what they typed. Priority can't use
// that test (it ships defaulted to MEDIUM, so "empty" is unreadable), hence
// the one-shot flag: sourceNc is a live query and re-fires on any syncBus
// tick, which would otherwise reset a priority the user had just changed.
const ncSeeded = ref(false)
watch(sourceNc, (nc) => {
  if (!nc || ncSeeded.value) return
  ncSeeded.value = true
  if (!form.value.title) form.value.title = `CAPA for ${nc.ncNumber || nc.title}`
  // The NC's description IS the problem statement the CAPA answers.
  if (richTextIsEmpty(form.value.description) && nc.description) {
    form.value.description = nc.description
  }
  if (!form.value.siteId) form.value.siteId = nc.siteId
  if (!form.value.departmentId) form.value.departmentId = nc.departmentId
  // Shared quality classification — one category the whole chain long.
  if (!form.value.categoryId && nc.categoryId) form.value.categoryId = nc.categoryId
  // CAPA has no severity of its own; "how bad" becomes "how urgent" here.
  // Mirrors capaPriorityFromNcSeverity() in the backend's ncCapaCreateService.
  if (nc.severityId) form.value.priorityId = capaPriorityFromNcSeverity(nc.severityId)
  if (!form.value.rootCauseCategoryId && nc.rootCauseCategoryId) {
    form.value.rootCauseCategoryId = nc.rootCauseCategoryId
  }
  // Inherit supplier + supplier-facing flag from the source NC so a
  // supplier NC that spawns a CAPA defaults to the same routing.
  if (!form.value.supplierId && nc.supplierId) {
    form.value.supplierId = nc.supplierId
  }
  if (nc.isSupplierFacing) {
    form.value.isSupplierFacing = true
  }
})

watch(
  () => form.value.siteId,
  () => {
    form.value.departmentId = null
  },
)

// Sticky section nav (FormProgressNav). Section ids mirror the FormSection ids
// below; status shows a check once a section's required fields are satisfied.
const classificationComplete = computed(
  () =>
    !!form.value.siteId &&
    !!form.value.departmentId &&
    !!form.value.typeId &&
    !!form.value.sourceType &&
    !!form.value.priorityId &&
    !!form.value.initiatedAt &&
    !!form.value.ownerId,
)
// (No Workflow entry — the workflow is chosen on its own screen before
// this form is reachable; the context strip above the form shows it.)
const navSections = computed(() => [
  {
    id: 'capa-basic',
    label: 'Basic',
    icon: IconInfoCircle,
    status: form.value.title ? 'complete' : null,
  },
  {
    id: 'capa-classification',
    label: 'Classification',
    icon: IconCategory,
    status: classificationComplete.value ? 'complete' : null,
  },
  { id: 'capa-notify', label: 'Notify', icon: IconBell, status: null },
])

// Per-field rules live on each <BaseField :rules> (see validators.js). The
// workflow is picked on its own screen before this form is reachable, so this
// check is a safety net only — it bounces the user back to the workflow screen.
/** Rich text is "empty" as `<p></p>`, so test the text, not the markup. */
function richTextIsEmpty(html) {
  return !String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function validate() {
  // The problem statement is what the whole CAPA answers; a CAPA raised
  // without one cannot be investigated or reviewed meaningfully.
  if (richTextIsEmpty(form.value.description)) {
    screen.value = 'details'
    return [
      {
        id: 'capa-description',
        label: 'Problem Statement',
        message: 'Describe the problem this CAPA addresses.',
      },
    ]
  }
  if (!form.value.workflowVersionId) {
    screen.value = 'workflow'
    return [
      { id: 'capa-workflow', label: 'Workflow', message: 'Pick a workflow before submitting.' },
    ]
  }
  return []
}

// Fires only after validate() passes. Runs the async custom-fields check
// (which surfaces its own inline errors), then opens the per-step reviewer
// dialog — NC parity, requested 2026-08-18. The CAPA is still created as a
// DRAFT: the picks land in `pending_reviewers` and the workflow starts when
// the owner clicks Start CAPA on the CAPA page, where the draft plan shows
// these assignments pre-filled and still editable.
async function onSubmit() {
  if ((await customFieldsRef.value?.validate()) === false) return

  workflowPickerRef.value.submit()
}

function goBack() {
  router.push(getCompanyPath('/capas'))
}

async function handleReviewersConfirmed(reviewers) {
  await handleCreate(reviewers)
}

async function handleCreate(reviewers) {
  saving.value = true
  submitError.value = ''
  try {
    // `reviewers` is parked in capa.pending_reviewers by createCapaRecord and
    // consumed by submitCapaForReview at Start CAPA.
    const response = await post('/v1/services/capas', { ...form.value, reviewers }) // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    if (presetFindingIds.value.length && response.capa?.id) {
      try {
        // Link every selected finding to the new CAPA (N findings → 1 CAPA).
        for (const findingId of presetFindingIds.value) {
          await linkSpawnedToFinding({
            findingId,
            kind: 'CAPA',
            targetId: response.capa.id,
          })
        }
      } catch (linkErr) {
        toast.notify({
          type: 'warning',
          message:
            linkErr?.message ||
            "CAPA created, but couldn't link one or more findings — attach manually from the audit page",
        })
      }
    }
    // Persist custom fields against the new CAPA (best-effort).
    try {
      await customFieldsRef.value?.persist(response.capa.id)
    } catch (cfErr) {
      toast.notify({
        type: 'warning',
        message:
          cfErr?.message ||
          'CAPA created, but custom fields could not be saved — add them on the CAPA page',
      })
    }
    toast.notify({
      type: 'positive',
      message:
        'CAPA created as a draft with your step assignments — review the plan, then Start CAPA to start the workflow.',
    })
    allowLeave() // saved — don't prompt on the redirect
    router.push(getCompanyPath(`/capas/${response.capa.id}`))
  } catch (e) {
    submitError.value = e.message || 'Failed to create CAPA'
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
          :items="[{ label: 'CAPAs', to: getCompanyPath('/capas') }, { label: 'Create CAPA' }]"
        />
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <!-- Screen 1 — workflow choice only (same wizard as NC, 2026-08-14).
           Skipped entirely when exactly one active workflow exists. -->
      <div v-if="screen === 'workflow'" class="tw:py-6 tw:flex tw:flex-col tw:gap-5">
        <div>
          <BaseText as="h2" weight="bold" class="tw:text-lg">Select a workflow</BaseText>
          <p class="tw:text-sm tw:text-secondary tw:mt-1">
            Every CAPA follows an approval workflow. Pick the process this CAPA will follow — you'll
            describe the corrective action on the next screen.
          </p>
        </div>
        <WorkflowVersionSelect
          v-model="form.workflowVersionId"
          :moduleId="CAPA_MODULE.workflowVersionModuleId"
          @pick="goToDetails"
        />
        <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-4 tw:border-t tw:border-divider">
          <BaseButton variant="outline" @click="goBack">Cancel</BaseButton>
          <BaseButton variant="primary" :disabled="!form.workflowVersionId" @click="goToDetails">
            Continue
          </BaseButton>
        </div>
      </div>

      <!-- Screen 2 — the CAPA details form, with a context strip recalling
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
            <p class="tw:text-xs tw:text-secondary">
              You'll assign a user to each step on submit. The CAPA is created as a draft — start
              the workflow with Start CAPA on the CAPA page.
            </p>
          </div>
          <!-- Hidden when only one workflow exists — nothing to change to. -->
          <BaseButton
            v-if="!singleWorkflow"
            variant="outline"
            size="sm"
            @click="screen = 'workflow'"
          >
            Change
          </BaseButton>
          <!-- Submit-time per-step reviewer dialog (NC parity, 2026-08-18) —
               select suppressed, the workflow was chosen on screen 1. The picks
               are parked in pending_reviewers; the CAPA still opens as DRAFT. -->
          <WorkflowReviewerPickerDialog
            ref="workflowPickerRef"
            v-model="form.workflowVersionId"
            hideSelect
            :module="CAPA_MODULE"
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
          submitLabel="Create CAPA"
          @submit="onSubmit"
          @cancel="goBack"
        >
          <!-- Source NC chip -->
          <div
            v-if="sourceNc"
            class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-blue-800 tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm"
          >
            Linked to Nonconformance
            <RouterLink
              :to="getCompanyPath(`/nonconformances/${sourceNc.id}`)"
              class="tw:font-semibold tw:underline tw:ml-1"
            >
              {{ sourceNc.ncNumber }}
            </RouterLink>
            — {{ sourceNc.title }}
          </div>

          <!-- Basic information -->
          <FormSection id="capa-basic" title="Basic information" :icon="IconInfoCircle">
            <div class="tw:flex tw:flex-col tw:gap-3">
              <BaseField
                id="capa-title"
                label="Title"
                required
                :value="form.title"
                :rules="[required()]"
              >
                <template #default="field">
                  <BaseTextInput
                    v-bind="field"
                    v-model="form.title"
                    placeholder="Describe the CAPA…"
                  />
                </template>
              </BaseField>
              <!-- "Problem Statement", not "Description" (2026-08-17): this
                 field is what the CAPA is answering, and naming it plainly
                 gets a better-written one. -->
              <BaseField label="Problem Statement" required>
                <div class="create-capa-editor">
                  <BaseRichTextEditor
                    v-model="form.description"
                    placeholder="What is the problem this CAPA addresses?…"
                  />
                </div>
              </BaseField>
              <SimilarRecordsPanel
                entityType="Capa"
                :searchInTypes="['Capa']"
                :getText="() => `${form.title} ${form.description || ''} ${form.rootCause || ''}`"
              />
            </div>
          </FormSection>

          <!-- Admin-defined custom fields. Self-hides when none configured. -->
          <CustomFieldsCreateSection
            ref="customFieldsRef"
            v-model="customFieldsData"
            entityType="Capa"
          />

          <!-- Classification -->
          <FormSection id="capa-classification" title="Classification" :icon="IconCategory">
            <BaseFieldRow :columns="2">
              <BaseField
                id="capa-site"
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
                id="capa-department"
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
              <!-- Shared quality classification (Quality Event / NC / CAPA).
                   Pre-filled when this CAPA came from an NC or an escalated
                   event, so the chain keeps one classification end to end. -->
              <BaseField label="Category" optional>
                <EventCategorySelectMenu v-model="form.categoryId" />
              </BaseField>
              <BaseField
                id="capa-type"
                label="CAPA Type"
                required
                :value="form.typeId"
                :rules="[required()]"
              >
                <template #default="field">
                  <CapaTypeSelectMenu v-bind="field" v-model="form.typeId" required />
                </template>
              </BaseField>
              <BaseField
                id="capa-source"
                label="Source"
                required
                :value="form.sourceType"
                :rules="[required()]"
              >
                <template #default="field">
                  <CapaSourceSelectMenu v-bind="field" v-model="form.sourceType" required />
                </template>
              </BaseField>
              <BaseField
                id="capa-priority"
                label="Priority"
                required
                :value="form.priorityId"
                :rules="[required()]"
              >
                <template #default="field">
                  <SegmentedControl
                    v-bind="field"
                    v-model="form.priorityId"
                    :options="PRIORITY_OPTIONS"
                  />
                </template>
              </BaseField>
              <BaseField
                id="capa-initiated"
                label="Initiated date"
                required
                :value="form.initiatedAt"
                :rules="[required()]"
              >
                <template #default="field">
                  <BaseDateField v-bind="field" v-model="form.initiatedAt" mode="date" />
                </template>
              </BaseField>
              <BaseField label="Due date" optional>
                <BaseDateField v-model="form.dueDate" mode="date" />
              </BaseField>
              <BaseField
                id="capa-owner"
                label="Responsible party"
                required
                hint="Drives the CAPA to closure & effectiveness. You remain the initiator."
                :value="form.ownerId"
                :rules="[required()]"
              >
                <template #default="field">
                  <UserSelectMenu v-bind="field" v-model="form.ownerId" required />
                </template>
              </BaseField>
              <BaseField
                id="capa-supplier"
                label="Supplier"
                :required="form.isSupplierFacing"
                :value="form.supplierId"
                :rules="[
                  requiredWhen(
                    () => form.isSupplierFacing,
                    'Pick a supplier before marking this CAPA as supplier-facing.',
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
                      <BaseText>Supplier-facing CAPA</BaseText>
                      <BaseCaption class="tw:block">
                        Workflow steps will be reviewed by users from the selected supplier (you'll
                        pick the specific reviewer per step at submit). Lockable once submitted.
                      </BaseCaption>
                    </div>
                  </label>
                </template>
              </BaseField>
            </BaseFieldRow>
          </FormSection>

          <!-- Notify (cc) — engine fans out in-app + email on create / status change -->
          <FormSection
            id="capa-notify"
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

          <!-- (Workflow lives on its own screen now — see screen 1 above.) -->
          <p v-if="form.isSupplierFacing" class="tw:text-xs tw:text-secondary">
            Supplier-facing CAPAs draw non-approval steps from this supplier's portal users;
            approval steps stay internal. You'll pick each one on submit.
          </p>
        </BaseForm>
      </template>
    </div>
  </BasePage>
</template>

<style scoped>
.create-capa-editor :deep(.rich-text-editor-content) {
  max-height: 10rem;
  overflow-y: auto;
}
</style>
