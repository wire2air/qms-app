<script setup>
import {
  IconHistory,
  IconLock,
  IconCheck,
  IconArchive,
  IconRestore,
  IconTrash,
  IconChevronLeft,
  IconAlertCircle,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const { confirm } = useConfirm()
const route = useRoute()
const router = useRouter()

const selectedVersionId = ref(null)
const selectedStepId = ref(null)
const publishing = ref(false)

function formatVersionLabel(v) {
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`
}

function readVersionParam() {
  const q = route.query.version
  return typeof q === 'string' && q.length > 0 ? q : null
}

// Reflect manual version selection back into the URL using the version label
// (e.g. ?version=1.0) so the link is bookmarkable and human-friendly.
watch(selectedVersionId, (id) => {
  const selected = versions.value?.find((v) => v.id === id) ?? null
  const desired = selected ? formatVersionLabel(selected) : null
  const current = readVersionParam()
  if (desired === current) return
  const query = { ...route.query }
  if (desired) query.version = desired
  else delete query.version
  router.replace({ query })
})

// External URL changes (browser back/forward, paste a ?version=<label> link)
// should flip the selection too.
watch(
  () => route.query.version,
  () => {
    const label = readVersionParam()
    if (!label || !versions.value?.length) return
    const match = versions.value.find((v) => formatVersionLabel(v) === label)
    if (match && match.id !== selectedVersionId.value) {
      selectedVersionId.value = match.id
    }
  },
)

// --- Live data ---
const workflow = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.Workflow.findByPk(id),
  { models: ['Workflow'] },
)

// CC mirrors CAPA's authoring capabilities — full step config (outcomes,
// send-back targets, form schema), opt-in child steps per root step, and
// nested child-step rendering. Step type (ACTION / APPROVAL) is a
// per-step toggle now, so we leave the approvalRule unforced for CC and
// Document workflows and let the author pick ALL vs ANY on each APPROVAL
// step. NC + CAPA keep their forced rule for backwards compat.
const WORKFLOW_MODULES_WITH_STEP_CONFIG = [
  'NON_CONFORMANCE',
  'CAPA',
  'CHANGE_CONTROL',
  'CUSTOMER_COMPLAINT',
  'COMPLAINT',
]
const MODULES_WITH_CHILD_STEPS = ['CAPA', 'CHANGE_CONTROL']
const showAllowedOutcomes = computed(() =>
  WORKFLOW_MODULES_WITH_STEP_CONFIG.includes(workflow.value?.moduleId),
)
const showFormSchema = computed(() =>
  WORKFLOW_MODULES_WITH_STEP_CONFIG.includes(workflow.value?.moduleId),
)
const showAllowChildSteps = computed(() =>
  MODULES_WITH_CHILD_STEPS.includes(workflow.value?.moduleId),
)
const showChildSteps = computed(() => MODULES_WITH_CHILD_STEPS.includes(workflow.value?.moduleId))
// Workflow templates assign approvers by ROLE only. The specific
// reviewer (a named user) is chosen by the owner when the workflow is
// attached to an entity and submitted (the reviewer-per-step picker
// derives candidates from each step's roles), so binding a user into the
// template adds nothing and diverges from the submit flow. Was
// per-module 'both' for Document/Approval/Log Book; unified to 'roles'
// 2026-05-27. (Reviewer resolution still honours any legacy
// WorkflowStepUser rows, so existing templates keep working.)
const stepApproversTab = computed(() => 'roles')
// Approval-rule on each step is per-template author choice for every
// module — the step editor falls back to its per-step approvalRule
// field (ANY / ALL) when this is null. NC and CAPA were force-pinned
// here historically (ANY and ALL respectively) so the picker was
// hidden; 2026-05-29 the user asked for ANY/ALL to be exposed across
// all modules so the picker shows everywhere. Existing templates keep
// whatever value was saved.
const selectedApprovalRule = computed(() => null)

const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const vs = await db.WorkflowVersion.where('workflowId', id).exec()
    return vs.sort((a, b) => {
      if (a.versionMajor !== b.versionMajor) {
        return b.versionMajor - a.versionMajor
      }
      return b.versionMinor - a.versionMinor
    })
  },

  { models: ['WorkflowVersion'], initial: [] },
)

const steps = useLiveQueryWithDeps(
  [() => selectedVersionId.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).exec()
  },

  { models: ['WorkflowStep'], initial: [] },
)

watch(
  versions,
  (vs) => {
    if (!vs?.length) return
    // Prefer the version named by ?version=<label> from the URL.
    const label = readVersionParam()
    if (label) {
      const match = vs.find((v) => formatVersionLabel(v) === label)
      if (match) {
        selectedVersionId.value = match.id
        return
      }
    }
    // Respect an existing in-memory selection if it still belongs to this
    // workflow's versions; otherwise default to the latest DRAFT or newest.
    if (selectedVersionId.value && vs.some((v) => v.id === selectedVersionId.value)) return
    selectedVersionId.value = vs.find((v) => v.statusId === 'DRAFT')?.id ?? vs[0].id
  },
  { immediate: true },
)

watch(
  () => props.id,
  () => {
    selectedVersionId.value = null
    selectedStepId.value = null
  },
)

const selectedVersion = computed(
  () => versions.value?.find((v) => v.id === selectedVersionId.value) ?? null,
)

// --- Computed ---
const breadcrumbItems = computed(() => [
  { label: 'Workflows', to: getCompanyPath('/workflow-templates') },
  { label: workflow.value?.name || 'Edit Workflow' },
])

const versionLabel = computed(() => {
  const v = selectedVersion.value
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor}.${v.versionMinor}`
})

const isViewingOldVersion = computed(() => {
  return selectedVersion.value?.statusId === 'RETIRED'
})

const isDraftVersion = computed(() => selectedVersion.value?.statusId === 'DRAFT')

const canUpdate = computed(() => {
  if (!workflow.value || !selectedVersion.value) return false
  return isDraftVersion.value && isAllowed(['workflows_templates:update'])
})

const canCreateDraft = computed(() => {
  const haveDraftVersion = versions.value.some((v) => v.statusId === 'DRAFT')
  return isAllowed(['workflows_templates:update']) && !haveDraftVersion
})

// ─── Version / workflow lifecycle (keyed off the SELECTED version) ──
// A DRAFT version is unpublished → hard-delete it (discard). If it's the
// workflow's only version, the whole never-published workflow goes;
// otherwise just that draft version is removed. A published version
// can't be deleted — the workflow is archived/restored instead (it may
// be attached to records / have in-flight instances).
const isArchived = computed(() => workflow.value?.statusId === 'ARCHIVED')
const isOnlyVersion = computed(() => (versions.value?.length ?? 0) <= 1)
const canArchiveWorkflow = computed(() => isAllowed(['workflows_templates:update']))
const canDeleteWorkflow = computed(() => isAllowed(['workflows_templates:delete']))
const workflowStatusBusy = ref(false)

async function setWorkflowStatus(statusId) {
  if (!workflow.value || workflowStatusBusy.value) return
  workflowStatusBusy.value = true
  try {
    workflow.value.statusId = statusId
    await workflow.value.save()
    toast.success(statusId === 'ARCHIVED' ? 'Workflow archived' : 'Workflow restored')
  } catch (err) {
    toast.error(err?.message || 'Failed to update workflow')
  } finally {
    workflowStatusBusy.value = false
  }
}

async function handleDeleteDraft() {
  if (!selectedVersion.value || workflowStatusBusy.value) return
  const onlyVersion = isOnlyVersion.value
  const message = onlyVersion
    ? `Delete workflow '${workflow.value?.name}'? It has never been published.`
    : 'Discard this draft version? It has never been published and will be removed.'
  if (!(await confirm({ message, danger: true }))) return
  workflowStatusBusy.value = true
  try {
    if (onlyVersion) {
      // Draft is the workflow's only version → remove the whole workflow.
      await workflow.value.delete()
      toast.success('Workflow deleted')
      router.push(getCompanyPath('/workflow-templates'))
      return
    }
    // Published version(s) exist → discard just this draft version. HARD-delete
    // it (steps cascade) so its version number is freed for reuse — the unique
    // (workflow, major, minor) index isn't partial, so a soft-deleted draft
    // would otherwise block re-creating that version. The versions watcher
    // reselects another version.
    await selectedVersion.value.hardDelete()
    toast.success('Draft discarded')
    selectedVersionId.value = null
  } catch (err) {
    toast.error(err?.message || 'Failed to delete draft')
  } finally {
    workflowStatusBusy.value = false
  }
}

// --- Handlers ---

// ─── Publish readiness ────────────────────────────────────────────────────────
// Publishing opens a readiness checklist instead of firing blind: WARNINGS for
// Action/Delay steps with no task form (assignee could only comment — almost
// always a config gap) and INFO notes for role-less steps (allowed by design —
// the submitter picks any active user). Nothing hard-blocks; the user confirms
// with eyes open.
const allStepRoles = useLiveQueryWithDeps(
  [() => steps.value.map((s) => s.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const lists = await Promise.all(
      idsStr.split(',').map((id) => db.WorkflowStepRole.where('stepId', id).exec()),
    )
    return lists.flat()
  },

  { models: ['WorkflowStepRole'], initial: [] },
)

const publishReadiness = computed(() => {
  const warnings = []
  const infos = []
  const roleStepIds = new Set(allStepRoles.value.map((r) => r.stepId))
  const ordered = [...steps.value].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
  for (const s of ordered) {
    const label = `Step ${s.stepOrder} — ${s.name || 'Untitled'}`
    if (showFormSchema.value && s.stepType !== 'APPROVAL' && (s.formSchema?.length ?? 0) === 0) {
      warnings.push(
        `${label}: no task form. The assignee can only comment and mark complete — no data is captured.`,
      )
    }
    if (!roleStepIds.has(s.id)) {
      infos.push(`${label}: no roles assigned — the submitter will pick any active user.`)
    }
  }
  return { warnings, infos }
})

const showPublishDialog = ref(false)

function handlePublish() {
  if (!isDraftVersion.value) {
    toast.warning('Switch to a draft version to publish.')
    return
  }
  showPublishDialog.value = true
}

const executePublish = useLiveMutation(async () => {
  publishing.value = true
  try {
    selectedVersion.value.statusId = 'PUBLISHED'
    await selectedVersion.value.save()
    toast.success('Workflow published successfully')
    showPublishDialog.value = false
  } finally {
    publishing.value = false
  }
})

const creatingDraft = ref(false)

const createDraftMutation = useLiveMutation(async (db, { workflowId, majorBump }) => {
  // Base the new draft on LIVE versions only (not soft-deleted/discarded ones),
  // so the version number reuses a freed slot instead of ever-incrementing, and
  // the clone source is the current published/draft version — not a discarded one.
  const sourceVersions = await db.WorkflowVersion.where('workflowId', workflowId).exec()
  const sortedVersions = sourceVersions.sort((a, b) => {
    if (a.versionMajor !== b.versionMajor) {
      return b.versionMajor - a.versionMajor
    }
    return b.versionMinor - a.versionMinor
  })

  const sourceVersion = sortedVersions[0]
  const currentVersionMajor = sourceVersion ? sourceVersion.versionMajor : 0
  const currentVersionMinor = sourceVersion ? sourceVersion.versionMinor : 0
  const newMajor = majorBump ? currentVersionMajor + 1 : currentVersionMajor
  const newMinor = majorBump ? 0 : currentVersionMinor + 1

  const newVersion = db.WorkflowVersion.create({
    workflowId,
    versionMajor: newMajor,
    versionMinor: newMinor,
    statusId: 'DRAFT',
  })
  await newVersion.save()

  const sourceSteps = await db.WorkflowStep.where('workflowVersionId', sourceVersion?.id).exec()

  // First pass: create all new steps and build old→new id map
  const idMap = {}
  const stepPairs = []

  for (const step of sourceSteps) {
    const newStep = db.WorkflowStep.create({
      workflowVersionId: newVersion.id,
      name: step.name,
      description: step.description,
      stepOrder: step.stepOrder,
      // stepType was silently dropped here before the DELAY feature —
      // APPROVAL/DELAY steps reverted to ACTION on every version bump.
      stepType: step.stepType ?? 'ACTION',
      approvalRule: step.approvalRule,
      slaDays: step.slaDays,
      delayDays: step.delayDays ?? null,
      delayUntilDate: step.delayUntilDate ?? null,
      maxDelayExtensions: step.maxDelayExtensions ?? null,
      requireComments: step.requireComments,
      requireEsignature: step.requireEsignature,
      allowChildSteps: step.allowChildSteps ?? false,
      formSchema: JSON.parse(JSON.stringify(step.formSchema ?? [])),
    })
    await newStep.save()
    idMap[step.id] = newStep.id
    stepPairs.push({ oldStep: step, newStep })

    const users = await db.WorkflowStepUser.where('stepId', step.id).exec()
    for (const su of users) {
      const newSu = db.WorkflowStepUser.create({ stepId: newStep.id, userId: su.userId })
      await newSu.save()
    }

    const roles = await db.WorkflowStepRole.where('stepId', step.id).exec()
    for (const sr of roles) {
      const newSr = db.WorkflowStepRole.create({ stepId: newStep.id, roleId: sr.roleId })
      await newSr.save()
    }

    const outcomes = await db.AllowedOutcomeOnStep.where('stepId', step.id).exec()
    for (const o of outcomes) {
      const newO = db.AllowedOutcomeOnStep.create({
        stepId: newStep.id,
        outcomeId: o.outcomeId,
      })
      await newO.save()
    }
  }

  // Second pass: remap parentStepId and clone send-back targets through the idMap
  for (const { oldStep, newStep } of stepPairs) {
    if (oldStep.parentStepId && idMap[oldStep.parentStepId]) {
      newStep.parentStepId = idMap[oldStep.parentStepId]
      await newStep.save()
    }

    // StepSendBackTarget rows are no longer carried forward — the engine
    // computes send-back targets at runtime (parent step → entity owner;
    // child task → parent step's assignee). Any legacy rows on the source
    // version stay dead in place; the new version doesn't reference them.
  }

  return newVersion
})

async function handleCreateDraft(majorBump = false) {
  creatingDraft.value = true
  try {
    await createDraftMutation({ workflowId: props.id, majorBump })
    toast.success('New draft version created')
    selectedVersionId.value = null
  } catch {
    toast.error('Failed to create draft version')
  } finally {
    creatingDraft.value = false
  }
}

function selectVersion(version) {
  if (version.id === selectedVersionId.value) return
  selectedVersionId.value = version.id
}

function handleVersionSelect(version, close) {
  selectVersion(version)
  close()
}

useAutoSave(selectedVersion, { debounce: 1000 })
useAutoSave(workflow, { debounce: 1000 })

watch(steps, () => {
  if (!steps.value.some((s) => s.id === selectedStepId.value)) {
    selectedStepId.value = steps.value[0]?.id ?? null
  }
})
</script>

<template>
  <!-- Full-canvas editor: exempt from BasePage (a designer surface that fills the
       viewport with its own panes/scroll, not a content page). See CLAUDE.md "Page layout". -->
  <div class="tw:flex tw:flex-col tw:h-full tw:overflow-hidden">
    <!-- Loading State -->
    <div v-if="!workflow" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <div
        class="tw:w-8 tw:h-8 tw:border-2 tw:border-primary tw:border-t-transparent tw:rounded-full tw:animate-spin"
      />
    </div>

    <!-- Content -->
    <template v-else>
      <!-- Header -->
      <SafeTeleport to="#main-header-title">
        <BaseBreadcrumbs :items="breadcrumbItems" />
      </SafeTeleport>

      <SafeTeleport to="#main-header-actions">
        <div class="tw:flex tw:items-center tw:gap-3">
          <ModuleBadgeById :moduleId="workflow.moduleId" />

          <!-- Version Selector -->
          <BasePopover placement="bottom-end">
            <template #button>
              <WorkflowVersionStatusBadgeById
                v-if="selectedVersion?.statusId"
                :statusId="selectedVersion.statusId"
                class="tw:ml-2"
                selectable
              >
                <template #icon> v{{ versionLabel }} </template>
              </WorkflowVersionStatusBadgeById>
            </template>
            <template #content="{ close }">
              <div class="tw:w-64 tw:py-2">
                <p
                  class="tw:px-3 tw:py-1 tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  Version History
                </p>
                <button
                  v-for="version in versions"
                  :key="version.id"
                  class="tw:w-full tw:text-left tw:px-3 tw:py-2 tw:hover:bg-main-hover tw:transition-colors"
                  :class="version.id === selectedVersionId ? 'tw:bg-primary/5 tw:text-primary' : ''"
                  @click="handleVersionSelect(version, close)"
                >
                  <div class="tw:flex tw:flex-nowrap tw:items-center tw:text-sm">
                    <span>
                      v{{
                        version.versionLabel || `${version.versionMajor}.${version.versionMinor}`
                      }}
                    </span>
                    <WorkflowVersionStatusBadgeById
                      v-if="version.statusId"
                      :statusId="version.statusId"
                      class="tw:ml-1"
                    />
                    <span v-if="version.isCurrent" class="tw:text-primary tw:font-bold tw:ml-1"
                      >(Current)</span
                    >
                  </div>
                </button>
              </div>
            </template>
          </BasePopover>

          <div class="tw:h-6 tw:w-px tw:bg-divider"></div>

          <template v-if="canUpdate">
            <BaseButton :isLoading="publishing" @click="handlePublish"> Publish </BaseButton>
          </template>
          <BaseButton
            v-if="canCreateDraft"
            :isLoading="creatingDraft"
            @click="handleCreateDraft(false)"
          >
            Create New Draft
          </BaseButton>

          <!-- Lifecycle keyed off the selected version: a DRAFT is
               discarded (the whole workflow if it's the only version);
               a published version archives/restores the workflow (it may
               be attached to records). -->
          <BaseButton
            v-if="isDraftVersion && canDeleteWorkflow"
            variant="ghost"
            class="tw:text-red-600"
            :isLoading="workflowStatusBusy"
            @click="handleDeleteDraft"
          >
            <IconTrash :size="16" />
            {{ isOnlyVersion ? 'Delete' : 'Discard Draft' }}
          </BaseButton>
          <BaseButton
            v-else-if="isArchived && canArchiveWorkflow"
            variant="ghost"
            :isLoading="workflowStatusBusy"
            @click="setWorkflowStatus('ACTIVE')"
          >
            <IconRestore :size="16" />
            Restore
          </BaseButton>
          <BaseButton
            v-else-if="canArchiveWorkflow"
            variant="ghost"
            :isLoading="workflowStatusBusy"
            @click="setWorkflowStatus('ARCHIVED')"
          >
            <IconArchive :size="16" />
            Archive
          </BaseButton>
        </div>
      </SafeTeleport>

      <!-- Old version banner -->
      <div
        v-if="isViewingOldVersion"
        class="tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:px-6 tw:py-3 tw:flex tw:items-center tw:gap-3"
      >
        <IconHistory :size="20" class="tw:text-amber-600" />
        <span class="tw:text-sm tw:text-amber-800 tw:font-medium">
          Viewing version v{{
            selectedVersion?.versionLabel ||
            `${selectedVersion?.versionMajor}.${selectedVersion?.versionMinor}`
          }}
          (read-only).
        </span>
      </div>
      <div
        v-else-if="selectedVersion?.statusId === 'PUBLISHED'"
        class="tw:bg-amber-50 tw:border-b tw:border-amber-200 tw:px-6 tw:py-3 tw:flex tw:items-center tw:gap-3"
      >
        <IconLock :size="20" class="tw:text-amber-600" />
        <span class="tw:text-sm tw:text-amber-800 tw:font-medium">
          This version is published and locked. Create a new draft to make changes.
        </span>
      </div>

      <!-- Global Settings — one compact row: name + description side by side
           so the strip doesn't eat vertical space the designer needs. -->
      <div
        class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_2fr] tw:gap-4 tw:bg-main tw:border-b tw:border-divider tw:px-6 tw:py-3"
      >
        <BaseField v-slot="{ id: fieldId }" label="Workflow Name">
          <BaseTextInput
            :id="fieldId"
            v-model="workflow.name"
            name="name"
            placeholder="e.g. Global SOP Multi-Stage Workflow"
            :disabled="!canUpdate"
          />
        </BaseField>

        <BaseTextarea
          v-model="workflow.description"
          name="description"
          label="Description"
          placeholder="Describe the purpose of this workflow"
          :disabled="!canUpdate"
          autosize
          :maxRows="2"
        />
      </div>

      <!-- Two-Pane Designer -->
      <div v-if="selectedVersion" class="tw:flex tw:flex-1 tw:overflow-hidden">
        <!-- Left Pane: Step List — full-width on mobile; collapses once a step is
             open (below lg) so the editor gets the screen. Back button restores. -->
        <WorkflowStepList
          v-model:stepId="selectedStepId"
          :versionId="selectedVersionId"
          :canUpdate="canUpdate"
          :showChildSteps="showChildSteps"
          :class="selectedStepId && 'tw:max-lg:hidden'"
        />

        <!-- Right Pane: Step Editor — hidden on mobile until a step is selected. -->
        <div
          class="tw:flex tw:flex-1 tw:flex-col tw:overflow-y-auto tw:bg-main tw:p-4 tw:md:p-8"
          :class="!selectedStepId && 'tw:max-lg:hidden'"
        >
          <!-- Left-aligned next to the step list (was mx-auto centered, which
               left a dead gap between the list and the editor). -->
          <div v-if="selectedStepId" class="tw:w-full tw:max-w-5xl tw:space-y-8">
            <!-- Mobile-only: return to the step list -->
            <button
              type="button"
              class="tw:lg:hidden tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-secondary tw:hover:text-on-main"
              @click="selectedStepId = null"
            >
              <IconChevronLeft :size="16" /> Steps
            </button>
            <WorkflowStepEditor
              :stepId="selectedStepId"
              :canUpdate="canUpdate"
              :showAllowedOutcomes="showAllowedOutcomes"
              :showFormSchema="showFormSchema"
              :showAllowChildSteps="showAllowChildSteps"
              :stepApproversTab="stepApproversTab"
              :selectedApprovalRule="selectedApprovalRule"
            />
          </div>

          <div
            v-else
            class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full tw:gap-4 tw:text-secondary"
          >
            <IconCheck :size="48" class="tw:opacity-30" />
            <p class="tw:text-sm tw:font-medium">
              Select a step from the left panel or use the 'Add Step' button to get started.
            </p>
          </div>
        </div>
      </div>
    </template>

    <!-- Publish readiness — checklist confirm instead of blind publish -->
    <BaseDialog v-model="showPublishDialog" title="Publish Workflow" maxWidth="lg">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          v-if="!publishReadiness.warnings.length && !publishReadiness.infos.length"
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-good/10 tw:border tw:border-good/30"
        >
          <IconCheck :size="16" class="tw:text-good tw:shrink-0 tw:mt-0.5" />
          <p class="tw:text-sm tw:text-on-main">
            All steps have task forms and assignees. Publishing makes
            <strong>v{{ versionLabel }}</strong> the active version for new records.
          </p>
        </div>

        <div
          v-if="publishReadiness.warnings.length"
          class="tw:rounded-lg tw:bg-warning/10 tw:border tw:border-warning/30 tw:p-3 tw:space-y-2"
        >
          <p class="tw:text-xs tw:font-bold tw:text-warning tw:flex tw:items-center tw:gap-1.5">
            <IconAlertCircle :size="14" /> Review before publishing
          </p>
          <ul class="tw:space-y-1">
            <li
              v-for="(w, i) in publishReadiness.warnings"
              :key="`w${i}`"
              class="tw:text-xs tw:text-warning"
            >
              {{ w }}
            </li>
          </ul>
        </div>

        <div
          v-if="publishReadiness.infos.length"
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30 tw:p-3 tw:space-y-2"
        >
          <p class="tw:text-xs tw:font-semibold tw:text-secondary">Good to know</p>
          <ul class="tw:space-y-1">
            <li
              v-for="(n, i) in publishReadiness.infos"
              :key="`i${i}`"
              class="tw:text-xs tw:text-secondary"
            >
              {{ n }}
            </li>
          </ul>
        </div>

        <p
          v-if="publishReadiness.warnings.length"
          class="tw:text-caption tw:text-secondary"
        >
          You can publish anyway, or go back and add task forms first (Task Form tab on each
          step).
        </p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="publishReadiness.warnings.length ? 'Publish Anyway' : 'Publish'"
          :loading="publishing"
          :disabled="publishing"
          @cancel="close"
          @submit="executePublish"
        />
      </template>
    </BaseDialog>
  </div>
</template>
