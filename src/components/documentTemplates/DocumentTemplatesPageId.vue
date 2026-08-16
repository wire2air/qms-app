<script setup>
import { IconInfoCircle, IconSettings } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import {
  buildDocumentTemplateBanners,
  buildDocumentTemplateSections,
  buildDocumentTemplateActions,
} from './documentTemplateDetailConfig.js'
import {
  pickAuthoringVersion,
  syncApprovalWorkflowLifecycle,
} from './documentTemplateApprovalFlow.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const router = useRouter()
const toast = useToast()

const template = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.DocumentTemplate.findByPk(id)
  },
  { models: 'DocumentTemplate' },
)

const loading = computed(() => template.value === undefined)
const canUpdate = computed(() => isAllowed(['document_templates:update']))
const canArchive = computed(() => isAllowed(['document_templates:delete']))

// canEdit gates inline-edit behavior: only DRAFT templates can be edited.
// PUBLISHED templates are immutable (they may be referenced by documents);
// ARCHIVED templates are immutable too. The user must Unarchive (→ DRAFT)
// to make changes again.
const canEdit = computed(() => canUpdate.value && template.value?.statusId === 'DRAFT')

const editingName = ref(false)
const { confirm } = useConfirm()

useAutoSave(template, { onError: (err) => toast.error(err) })

// The approval flow lives on the template but IS an ordinary workflow, edited
// in the ordinary builder (user decision 2026-08-15). Nothing here writes to
// it — we only resolve it for display and hand off to the builder — so a
// multi-stage flow someone authored there is never clobbered by this page.
const approvalWorkflowId = computed(() => template.value?.workflowId ?? null)

const approvalVersions = useLiveQueryWithDeps(
  [() => approvalWorkflowId.value],
  async (db, [workflowId]) =>
    workflowId ? db.WorkflowVersion.where('workflowId', workflowId).exec() : [],
  { models: ['WorkflowVersion'], initial: [] },
)

// The version being AUTHORED — the draft if one exists, else the live one.
// Must match what the flow dialog edits (pickAuthoringVersion is shared for
// exactly that reason), or edits made in the dialog appear to vanish when you
// come back here.
const authoringVersion = computed(() => pickAuthoringVersion(approvalVersions.value))
const liveVersionId = computed(() => authoringVersion.value?.id ?? null)

const approvalSteps = useLiveQueryWithDeps(
  [() => liveVersionId.value],
  async (db, [versionId]) =>
    versionId
      ? db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder').exec()
      : [],
  { models: ['WorkflowStep'], initial: [] },
)

// True when the stages shown are a draft, i.e. not yet what documents run.
const showingUnpublishedDraft = computed(() => authoringVersion.value?.statusId === 'DRAFT')

// The approval flow follows the template's status — publish the template and
// its flow goes live with it; reopen the template and the flow becomes an
// editable draft again. See syncApprovalWorkflowLifecycle.
const syncFlowLifecycle = useLiveMutation(async (db, t) => syncApprovalWorkflowLifecycle(db, t))

// Opens in place (user request 2026-08-15) rather than navigating to the
// workflow page — the flow belongs to this template, so editing it shouldn't
// feel like leaving.
const approvalDialogOpen = ref(false)

function openApprovalBuilder() {
  if (!approvalWorkflowId.value) return
  approvalDialogOpen.value = true
}

async function onPublish() {
  if (!template.value) return
  const ok = await confirm({
    title: 'Publish template',
    message: `Once you publish this template, it can be used in documents — but you won't be able to edit it after publishing. Continue?`,
    okLabel: 'Publish',
  })
  if (!ok) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'PUBLISHED'
  try {
    await template.value.save()
    await syncFlowLifecycle(template.value)
    toast.success('Template published')
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

// PUBLISHED → DRAFT. Its approval flow follows: syncApprovalWorkflowLifecycle
// gives the workflow a fresh draft version to edit while the live published
// version keeps serving documents already in flight.
async function onRevise() {
  if (!template.value) return
  const ok = await confirm({
    title: 'Reopen for editing',
    message:
      'This template returns to Draft so you can change it. While it is a draft, new documents cannot be created from it — publish again to put it back in service. Documents already created keep the version of the template they were created from.',
    okLabel: 'Reopen',
  })
  if (!ok) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'DRAFT'
  try {
    await template.value.save()
    await syncFlowLifecycle(template.value)
    toast.success('Template reopened — it is a draft again')
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

async function onArchive() {
  if (!template.value) return
  const ok = await confirm({
    title: 'Archive template',
    message: `Once this template is archived, you won't be able to edit it or use it for new documents. Continue?`,
    okLabel: 'Archive',
    danger: true,
  })
  if (!ok) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'ARCHIVED'
  try {
    await template.value.save()
    await syncFlowLifecycle(template.value)
    router.push(getCompanyPath('/document-templates'))
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

async function onUnarchive() {
  if (!template.value) return
  const ok = await confirm({
    title: 'Unarchive template',
    message: `This template will return to Draft status — it will be editable again, but you'll need to publish it before it can be used for new documents. Continue?`,
    okLabel: 'Unarchive',
  })
  if (!ok) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'DRAFT'
  try {
    await template.value.save()
    await syncFlowLifecycle(template.value)
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Document Templates', to: getCompanyPath('/document-templates') },
  { label: template.value?.name || 'Template' },
])
const documentTemplateBanners = computed(() => buildDocumentTemplateBanners(template.value))
const documentTemplateActions = computed(() =>
  buildDocumentTemplateActions(
    {
      canUpdate: canUpdate.value,
      canArchive: canArchive.value,
      statusId: template.value?.statusId,
    },
    { publish: onPublish, revise: onRevise, archive: onArchive, unarchive: onUnarchive },
  ),
)
const documentTemplateDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => documentTemplateBanners.value,
    actions: documentTemplateActions.value,
    sections: buildDocumentTemplateSections(template.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="documentTemplateDetailConfig"
    :record="template"
    :loading="loading"
    :notFound="!loading && !template"
    notFoundTitle="Template not found"
    notFoundDescription="This template could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingName && canEdit"
        v-model="template.name"
        placeholder="Template Name"
        size="sm"
        autofocus
        @keyup.enter="editingName = false"
        @blur="editingName = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="canEdit ? 'tw:hover:text-primary' : ''"
        :disabled="!canEdit"
        aria-label="Edit template name"
        @click="canEdit && (editingName = true)"
      >
        {{ template?.name }}
      </BaseClickableRow>
    </template>

    <template #status>
      <DocumentTemplateStatusBadgeById v-if="template" :statusId="template.statusId" />
    </template>

    <template v-if="template" #meta>
      <span class="">{{ template.prefix }}</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="documentTemplateActions" />
    </template>

    <template v-if="template" #rail>
      <BaseRailCard title="Basic Information" :icon="IconInfoCircle">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseDetailField label="Document Prefix">
            <BaseTextInput
              v-if="canEdit"
              v-model="template.prefix"
              placeholder="Prefix"
              size="sm"
            />
            <span v-else class="tw:font-bold tw:text-on-main">{{ template.prefix }}</span>
          </BaseDetailField>
          <!-- Department HIDDEN (user decision 2026-08-16) — not deleted.
               See DocumentTemplatesCreate for why. -->
          <!--
          <BaseDetailField label="Department">
            <DepartmentSelectMenu v-if="canEdit" v-model="template.departmentId" />
            <template v-else>
              <DepartmentBadgeById
                v-if="template.departmentId"
                :departmentId="template.departmentId"
              />
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </template>
          </BaseDetailField>
          -->
          <BaseDetailField label="Related Standard">
            <RelatedStandardSelectMenu v-if="canEdit" v-model="template.relatedStandardId" />
            <template v-else>
              <RelatedStandardBadgeById
                v-if="template.relatedStandardId"
                :relatedStandardId="template.relatedStandardId"
              />
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </template>
          </BaseDetailField>
          <BaseDetailField
            label="Created"
            layout="inline"
            :value="template.createdAt?.formatDate('date')"
          />
          <BaseDetailField
            label="Last Modified"
            layout="inline"
            :value="template.updatedAt?.formatDate('date')"
          />
        </div>
      </BaseRailCard>
    </template>

    <template v-if="template" #section-details>
      <div class="tw:flex tw:flex-col tw:gap-6">
        <!-- Default Settings Card -->
        <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
          <div
            class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
          >
            <IconSettings :size="22" class="tw:text-primary" />
            <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar">Default Settings</h2>
          </div>
          <div class="tw:p-6 tw:grid tw:grid-cols-2 tw:md:grid-cols-3 tw:gap-6">
            <div>
              <p class="tw:text-secondary tw:mb-1">Training Required</p>
              <BaseSwitch v-model="template.trainingAvailable" :disabled="!canEdit" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Retraining on Version</p>
              <BaseSwitch v-model="template.retrainingOnVersion" :disabled="!canEdit" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Periodic Review</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.periodicReviewMonths"
                type="number"
                placeholder="Months"
              />
              <p v-else class="tw:text-on-sidebar">{{ template.periodicReviewMonths }} months</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Review Limit</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.reviewLimitDays"
                type="number"
                placeholder="Days"
              />
              <p v-else class="tw:text-on-sidebar">{{ template.reviewLimitDays }} days</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Approval Limit</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.approvalLimitDays"
                type="number"
                placeholder="Days"
              />
              <p v-else class="tw:text-on-sidebar">{{ template.approvalLimitDays }} days</p>
            </div>
            <div class="tw:col-span-2">
              <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:gap-2">
                <p class="tw:text-secondary">Approval Flow</p>
                <button
                  v-if="approvalWorkflowId"
                  type="button"
                  class="tw:text-xs tw:font-medium tw:text-primary tw:hover:text-primary/80 tw:transition-colors"
                  title="Add stages, reorder, or edit task forms"
                  @click="openApprovalBuilder"
                >
                  {{ canEdit ? 'Advanced…' : 'View full flow' }}
                </button>
              </div>
              <!-- Editable in place when the template allows it (2026-08-16).
                   These stages previously rendered as a name plus "due in N
                   days", so who signs, whether it is e-signed and whether a
                   rationale is captured were all invisible unless you opened
                   the full workflow builder — and DocumentApprovalStepLive,
                   built for exactly this, was never mounted anywhere. -->
              <div
                v-if="approvalSteps.length"
                class="tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:p-3"
              >
                <template v-for="(step, i) in approvalSteps" :key="step.id">
                  <DocumentApprovalStepLive
                    v-if="canEdit"
                    :stepId="step.id"
                    :label="`${i + 1}. ${step.name}`"
                    :canEdit="canEdit"
                  />
                  <DocumentApprovalStepSummary v-else :step="step" :index="i" />
                </template>
                <p v-if="showingUnpublishedDraft" class="tw:text-xs tw:text-amber-600">
                  These stages are a draft. Documents keep using the last published version until
                  this template is published.
                </p>
              </div>
              <p v-else class="tw:text-sm tw:text-red-600">
                No approval flow yet — documents can't be created from this template until one
                exists.
              </p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Auto Effective</p>
              <BaseSwitch v-model="template.autoEffectiveOnApproval" :disabled="!canEdit" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Show Section Titles</p>
              <BaseSwitch v-model="template.showSectionTitles" :disabled="!canEdit" />
            </div>
          </div>
        </div>

        <!-- Sections Card -->
        <DocumentSectionsEditor
          v-model="template.sections"
          :readonly="!canEdit"
          :instructionsEditable="canEdit"
        />
      </div>
    </template>
  </BaseDetailLayout>
  <DocumentTemplateApprovalFlowDialog
    v-if="template"
    v-model="approvalDialogOpen"
    :templateId="template.id"
  />
</template>
