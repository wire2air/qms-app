<script setup>
import { DateTime } from 'luxon'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession } from '@/utils/currentSession.js'
import { linkSpawnedToFinding } from '@/utils/auditFindingLink.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const saving = ref(false)

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
})

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

const CLASSIFICATIONS = [
  { id: 'MINOR', name: 'Minor' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'CRITICAL', name: 'Critical' },
]

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

async function handleSubmit() {
  for (const [field, label] of [
    ['title', 'Title'],
    ['changeTypeId', 'Change type'],
    ['priorityId', 'Priority'],
    ['siteId', 'Site'],
    ['departmentId', 'Department'],
    ['ownerId', 'Owner'],
    ['initiatedAt', 'Initiated date'],
    ['workflowVersionId', 'Workflow'],
  ]) {
    if (!form.value[field]) {
      toast.notify({ type: 'negative', message: `${label} is required` })
      return
    }
  }

  saving.value = true
  try {
    const payload = {
      ...form.value,
      initiatedAt: form.value.initiatedAt?.toISODate?.() ?? form.value.initiatedAt,
      targetImplementationDate:
        form.value.targetImplementationDate?.toISODate?.() ?? form.value.targetImplementationDate,
      dueDate: form.value.dueDate?.toISODate?.() ?? form.value.dueDate,
    }
    const response = await post('/v1/services/changeRequests', payload)
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
    router.push(getCompanyPath(`/change-requests/${response.changeRequest.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to create Change Request' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader
      title="New Change Request"
      subtitle="Create a draft. You'll pick reviewers and open the CR on the next page."
    >
      <template #actions>
        <BaseButton variant="outline" @click="router.push(getCompanyPath('/change-requests'))">
          Cancel
        </BaseButton>
        <BaseButton variant="primary" :disabled="saving" @click="handleSubmit">
          {{ saving ? 'Creating…' : 'Create Draft' }}
        </BaseButton>
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:py-5 tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-4"
        >
          <BaseField v-slot="{ id: fieldId }" label="Title" required>
            <BaseTextInput
              :id="fieldId"
              v-model="form.title"
              placeholder="Short summary of the change"
            />
          </BaseField>

          <BaseField label="Description">
            <div class="create-cr-editor">
              <BaseRichTextEditor
                v-model="form.description"
                placeholder="What is being changed and why?"
              />
            </div>
          </BaseField>

          <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <BaseField label="Change Type" required>
              <ChangeTypeSelectMenu v-model="form.changeTypeId" :required="true" />
            </BaseField>
            <BaseField label="Classification">
              <BaseSelectMenu
                v-model="form.classification"
                :items="CLASSIFICATIONS"
                nullLabel="— Select classification —"
              >
                <template #button="{ selected: id }">
                  <BaseBadge selectable>
                    {{ CLASSIFICATIONS.find((c) => c.id === id)?.name || id }}
                  </BaseBadge>
                </template>
              </BaseSelectMenu>
            </BaseField>
            <BaseField label="Priority" required>
              <ChangeRequestPrioritySelectMenu v-model="form.priorityId" :required="true" />
            </BaseField>
            <BaseField label="Workflow" required>
              <BaseSelectMenu
                v-model="form.workflowVersionId"
                :items="workflowVersionOptions"
                :required="true"
                nullLabel="— Select workflow —"
              >
                <template #button="{ selected: id }">
                  <BaseBadge v-if="id" selectable>
                    {{ workflowVersionOptions.find((o) => o.id === id)?.name || id }}
                  </BaseBadge>
                  <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
                    Select workflow
                  </span>
                </template>
              </BaseSelectMenu>
            </BaseField>
          </div>

          <div class="tw:grid tw:grid-cols-2 tw:gap-4">
            <BaseField label="Site" required>
              <SiteSelectMenu v-model="form.siteId" :required="true" />
            </BaseField>
            <BaseField label="Department" required>
              <DepartmentSelectMenu
                v-model="form.departmentId"
                :required="true"
                :siteId="form.siteId"
              />
            </BaseField>
            <BaseField label="Owner" required>
              <UserSelectMenu v-model="form.ownerId" :required="true" />
            </BaseField>
            <BaseField label="Initiated" required>
              <BaseDatePicker v-model="form.initiatedAt" />
            </BaseField>
            <BaseField label="Target Implementation Date">
              <BaseDatePicker v-model="form.targetImplementationDate" />
            </BaseField>
            <BaseField label="Due Date">
              <BaseDatePicker v-model="form.dueDate" />
            </BaseField>
          </div>

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
      </div>
    </div>
  </BasePage>
</template>

<style scoped>
.create-cr-editor :deep(.rich-text-editor-content) {
  max-height: 10rem;
  overflow-y: auto;
}
</style>
