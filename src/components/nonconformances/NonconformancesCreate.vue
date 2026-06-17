<script setup>
import { DateTime } from 'luxon'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'
import WorkflowReviewerPickerDialog from '@/components/workflow/WorkflowReviewerPickerDialog.vue'
import WorkflowVersionSelect from '@/components/documents/WorkflowVersionSelect.vue'
import { NC_MODULE, CAPA_MODULE } from '@/components/workflow/workflowModule.js'
import { linkSpawnedToFinding } from '@/utils/auditFindingLink.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const workflowPickerRef = ref(null)
const saving = ref(false)

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
  return capaVersions.value.find((v) => v.workflowId === scar.id && v.statusId === 'PUBLISHED')?.id ?? null
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
  // Groups emailed when the NC is raised and when it closes. Email-only —
  // no tasks, no access granted (unlike workflow step assignment).
  notifyGroupIds: [],
})

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

function handleSubmit() {
  if (!form.value.title) {
    toast.notify({ type: 'negative', message: 'Title is required' })
    return
  }
  if (!form.value.severityId) {
    toast.notify({ type: 'negative', message: 'Severity is required' })
    return
  }
  if (!form.value.typeId) {
    toast.notify({ type: 'negative', message: 'NC Type is required' })
    return
  }
  if (!form.value.sourceId) {
    toast.notify({ type: 'negative', message: 'Detection source is required' })
    return
  }
  if (!form.value.siteId) {
    toast.notify({ type: 'negative', message: 'Site is required' })
    return
  }
  if (!form.value.departmentId) {
    toast.notify({ type: 'negative', message: 'Department is required' })
    return
  }
  if (!form.value.ownerId) {
    toast.notify({ type: 'negative', message: 'Owner is required' })
    return
  }
  if (form.value.isSupplierFacing && !form.value.supplierId) {
    toast.notify({
      type: 'negative',
      message: 'Pick a supplier before marking this NC as supplier-facing.',
    })
    return
  }
  if (!form.value.detectedAt) {
    toast.notify({ type: 'negative', message: 'Detected date is required' })
    return
  }
  if (!form.value.workflowVersionId) {
    toast.notify({ type: 'negative', message: 'Workflow version is required' })
    return
  }

  // Supplier-facing → shortcut dialog (Create CAPA? + workflow, auto-assigned
  // + opened server-side). Internal NCs keep the manual per-step picker.
  if (form.value.isSupplierFacing) {
    createCapa.value = true
    capaWorkflowVersionId.value = scar8dVersionId.value
    showCapaShortcut.value = true
    return
  }

  // Open reviewer dialog (fire-and-forget, actual NC creation happens on confirm)
  workflowPickerRef.value.submit()
}

// Supplier shortcut confirm — POST the combined raise endpoint.
async function confirmSupplierRaise() {
  if (createCapa.value && !capaWorkflowVersionId.value) {
    toast.notify({ type: 'negative', message: 'Pick a CAPA workflow' })
    return
  }
  saving.value = true
  try {
    const { nonconformance, capa, opened } = await post(
      '/v1/services/nonconformances/raise',
      {
        ...form.value,
        createCapa: createCapa.value,
        capaWorkflowVersionId: createCapa.value ? capaWorkflowVersionId.value : null,
      },
    )
    if (!opened) {
      toast.notify({
        type: 'warning',
        message:
          'Created as Draft — invite a supplier portal user for this supplier, then Open the NC/CAPA to start the workflow.',
      })
    } else {
      toast.notify({
        type: 'positive',
        message: capa ? `NC raised + ${capa.capaNumber} (8D) opened` : 'NC raised',
      })
    }
    showCapaShortcut.value = false
    router.push(getCompanyPath(`/nonconformances/${nonconformance.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to raise NC' })
  } finally {
    saving.value = false
  }
}

async function handleReviewersConfirmed(reviewers) {
  saving.value = true
  try {
    const response = await post('/v1/services/nonconformances', { ...form.value, reviewers })
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
    router.push(getCompanyPath(`/nonconformances/${response.nonconformance.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to create NC' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage width="narrow" fullHeight>
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs
        :items="[
          { label: 'Nonconformances', to: getCompanyPath('/nonconformances') },
          { label: 'Raise NC' },
        ]"
      />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton variant="primary" :disabled="saving" @click="handleSubmit">Submit</BaseButton>
    </SafeTeleport>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:max-w-3xl tw:mx-auto tw:p-6 tw:flex tw:flex-col tw:gap-4">
        <!-- Basic information -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Basic information
          </BaseText>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField v-slot="{ id }" label="Title" required>
              <BaseTextInput :id="id" v-model="form.title" placeholder="Describe the nonconformance…" />
            </BaseField>
            <BaseField label="Description">
              <div class="create-nc-editor">
                <BaseRichTextEditor
                  v-model="form.description"
                  placeholder="Provide details about the nonconformance…"
                />
              </div>
            </BaseField>
            <SimilarRecordsPanel
              entityType="Nonconformance"
              :searchInTypes="['Nonconformance']"
              :getText="() => `${form.title} ${form.description || ''}`"
            />
          </div>
        </div>

        <!-- Classification -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Classification
          </BaseText>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseField label="Site" required>
              <SiteSelectMenu v-model="form.siteId" required />
            </BaseField>
            <BaseField label="Department" required>
              <DepartmentSelectMenu v-model="form.departmentId" :siteId="form.siteId" required />
            </BaseField>
            <BaseField label="NC Type" required>
              <NcTypeSelectMenu v-model="form.typeId" required />
            </BaseField>
            <BaseField label="Detection source" required>
              <NcSourceSelectMenu v-model="form.sourceId" required />
            </BaseField>
            <BaseField label="Issue type">
              <NcIssueTypeSelectMenu v-model="form.ncIssueTypeId" />
            </BaseField>
            <BaseField label="Severity" required>
              <div class="tw:flex tw:gap-2">
                <BaseButton
                  v-for="sev in ['MINOR', 'MAJOR', 'CRITICAL']"
                  :key="sev"
                  class="tw:flex-1 tw:justify-center"
                  :variant="form.severityId === sev ? 'primary' : 'outline'"
                  @click="form.severityId = sev"
                >
                  {{ sev.charAt(0) + sev.slice(1).toLowerCase() }}
                </BaseButton>
              </div>
            </BaseField>
            <BaseField label="Priority">
              <div class="tw:flex tw:gap-2">
                <BaseButton
                  v-for="p in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']"
                  :key="p"
                  class="tw:flex-1 tw:justify-center"
                  :variant="form.priorityId === p ? 'primary' : 'outline'"
                  @click="form.priorityId = form.priorityId === p ? null : p"
                >
                  {{ p.charAt(0) + p.slice(1).toLowerCase() }}
                </BaseButton>
              </div>
            </BaseField>
            <BaseField label="Detected date" required>
              <BaseDatePicker v-model="form.detectedAt" />
            </BaseField>
            <BaseField label="Due date" optional>
              <BaseDatePicker v-model="form.dueDate" />
            </BaseField>
            <BaseField label="Owner" required class="tw:col-span-2 tw:md:col-span-1">
              <UserSelectMenu v-model="form.ownerId" required />
            </BaseField>
          </div>
        </div>

        <!-- Product & material -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Product & material
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </BaseText>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseField label="Product">
              <ProductSelectMenu v-model="form.productId" :required="false" />
            </BaseField>
            <BaseField label="Supplier" :required="form.isSupplierFacing">
              <SupplierSelectMenu v-model="form.supplierId" :required="form.isSupplierFacing" />
              <label class="tw:flex tw:items-start tw:gap-2 tw:mt-2 tw:cursor-pointer tw:select-none">
                <BaseCheckbox v-model="form.isSupplierFacing" />
                <div>
                  <BaseText>Supplier-facing NC</BaseText>
                  <BaseCaption class="tw:block">
                    Workflow steps will be reviewed by users from the selected supplier (you'll pick
                    the specific reviewer per step when you open the NC). Lockable once opened.
                  </BaseCaption>
                </div>
              </label>
            </BaseField>
            <BaseField v-slot="{ id }" label="Qty affected">
              <BaseTextInput :id="id" v-model="form.qtyAffected" type="number" placeholder="0" />
            </BaseField>
            <BaseField v-slot="{ id }" label="Unit of measure">
              <BaseTextInput :id="id" v-model="form.unitOfMeasure" placeholder="e.g. sheets, units…" />
            </BaseField>
            <BaseField v-slot="{ id }" label="PO #">
              <BaseTextInput :id="id" v-model="form.poNumber" placeholder="Purchase order number" />
            </BaseField>
            <BaseField v-slot="{ id }" label="Order #">
              <BaseTextInput :id="id" v-model="form.orderNumber" placeholder="Customer / sales order" />
            </BaseField>
            <BaseField v-slot="{ id }" label="Lot #" class="tw:col-span-2">
              <BaseTextInput :id="id" v-model="form.lotNumber" placeholder="Material / production lot" />
            </BaseField>
          </div>
        </div>

        <!-- Notifications — email-only group fan-out on raise + close -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Notifications
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </BaseText>
          <BaseField
            label="Notification groups"
            hint="Members are emailed when this NC is raised and when it closes. Email only — no tasks are created and no access is granted."
          >
            <GroupSelectMenu v-model="form.notifyGroupIds" multiple class="tw:w-full" />
          </BaseField>
        </div>

        <!-- Immediate containment action -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Immediate containment action
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </BaseText>
          <div class="create-nc-editor">
            <BaseRichTextEditor
              v-model="form.immediateContainmentAction"
              placeholder="Describe actions taken at the time of detection…"
            />
          </div>
        </div>

        <!-- Workflow -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <BaseText
            variant="overline"
            class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Workflow
            <span class="tw:normal-case tw:font-normal tw:text-secondary tw:ml-1">(optional)</span>
          </BaseText>
          <WorkflowReviewerPickerDialog
            ref="workflowPickerRef"
            v-model="form.workflowVersionId"
            :module="NC_MODULE"
            :isSupplierFacing="form.isSupplierFacing"
            :supplierId="form.supplierId"
            :ownerId="form.ownerId"
            @submit="handleReviewersConfirmed"
          />
          <p
            v-if="form.isSupplierFacing"
            class="tw:text-xs tw:text-secondary tw:mt-2"
          >
            Supplier-facing NCs are auto-assigned to the supplier's first portal user and
            opened on Submit — you can reassign any step afterwards.
          </p>
        </div>
      </div>
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
          <WorkflowVersionSelect
            v-model="capaWorkflowVersionId"
            :moduleId="CAPA_MODULE.workflowVersionModuleId"
            dense
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
          :submitLabel="`Raise NC${createCapa ? ' + 8D CAPA' : ''}`"
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
