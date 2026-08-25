<script setup>
import {
  IconHistory,
  IconLock,
  IconCheck,
  IconArchive,
  IconRestore,
  IconTrash,
  IconAlertCircle,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'
import { copyVersionSteps } from './workflowVersionCopy.js'
import { isApprovalOnlyModule } from './workflowModule.js'
import { toggleWorkflowDefault } from './workflowDefault.js'

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

// Child steps (runtime sub-tasks) are a CAPA / Change Control capability.
// (The per-step "Allowed Outcomes" picker that used to be gated here was
// dead UI — permanently v-show="false" — and went away with the 2026-08-15
// step-panel trim. The engine derives outcomes from the step type.)
const MODULES_WITH_CHILD_STEPS = ['CAPA', 'CHANGE_CONTROL']
// Task forms exist only in RECORD workflows. Approval flows (Document
// Control, Log Book, Audit Standard, Audit Instance, QC) gate a transition —
// reviewers approve or reject, there is nothing to fill in — so they can't
// contain a Task step at all and never show the Task Form tab. See
// allowedStepTypes() in workflowModule.js for the map and its rationale.
//
// (2026-08-14 briefly derived this from whether a module's runtime renders
// <WorkflowStep>. That answered "can a form display?" when the real question
// is "is this module about capturing work?" — hence the explicit map.)
const showFormSchema = computed(() => !isApprovalOnlyModule(workflow.value?.moduleId))
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

// (Step renaming lives on WorkflowStepCard now — the expanded panel has no
// header to hang it off, and the card is where the name is shown.)

// ─── Secondary step config, opened from a step header ────────────────────────
const settingsDialogOpen = ref(false)
const settingsStepId = ref(null)
const assigneesDialogOpen = ref(false)
const assigneesStepId = ref(null)

function openStepSettings(id) {
  settingsStepId.value = id
  settingsDialogOpen.value = true
}

function openStepAssignees(id) {
  assigneesStepId.value = id
  assigneesDialogOpen.value = true
}

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
// The editor is mounted under BOTH /workflow-templates/:id (from the merged
// Templates list) and /approval-flows/:id (from Approval Flows). Derive the
// list to go back to from where we actually are, rather than hard-coding
// /workflow-templates and dumping approval-flow authors on the other page.
const listPath = computed(() =>
  route.path.includes('/approval-flows') ? '/approval-flows' : '/workflow-templates',
)
const listLabel = computed(() =>
  listPath.value === '/approval-flows' ? 'Approval Flows' : 'Templates',
)

// A document template's approval flow is an ordinary workflow edited here, but
// you got here FROM the template — so go back there, not to a list this
// workflow is deliberately hidden from (2026-08-15).
const owningDocumentTemplate = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    const templates = await db.DocumentTemplate.where().exec()
    return templates.find((t) => t.workflowId === id) ?? null
  },
  { models: ['DocumentTemplate'], initial: null },
)

// A template-owned flow is published/archived BY its template — the template's
// status transitions drive the version lifecycle (2026-08-15). Showing Publish
// / Reopen for Editing / Archive here would give the same flow two lifecycles to
// operate and let it drift out of step with the template that owns it.
const isTemplateOwned = computed(() => !!owningDocumentTemplate.value)

// Default-for-module toggle. Needs every sibling workflow, because the
// previous default has to be cleared before this one is set — see
// workflowDefault.js.
const siblingWorkflows = useLiveQuery((db) => db.Workflow.where().exec(), {
  models: ['Workflow'],
  initial: [],
})
const canToggleDefault = computed(() => isAllowed(['workflows_templates:update']))
const defaultBusy = ref(false)

async function handleToggleDefault() {
  if (!workflow.value || defaultBusy.value) return
  defaultBusy.value = true
  try {
    toast.success(await toggleWorkflowDefault(workflow.value, siblingWorkflows.value))
  } catch (err) {
    toast.error(err?.message || 'Failed to update the default workflow')
  } finally {
    defaultBusy.value = false
  }
}

const breadcrumbItems = computed(() => {
  const owner = owningDocumentTemplate.value
  if (owner) {
    return [
      { label: 'Templates', to: getCompanyPath('/workflow-templates') },
      { label: owner.name, to: getCompanyPath(`/document-templates/${owner.id}`) },
      { label: 'Approval Flow' },
    ]
  }
  return [
    { label: listLabel.value, to: getCompanyPath(listPath.value) },
    { label: workflow.value?.name || 'Edit Workflow' },
  ]
})

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
// F-20 — gate on `:update`, NOT `:delete`, because `:update` is what the delete
// actually needs. `Workflow` is a paranoid client model, so `workflow.delete()`
// is a GraphQL **UPDATE** that stamps `deleted_at`; at the DB it lands on the
// `workflows_upd` RLS policy, which checks
// `has_permission('workflows_templates','update')`. The `workflows_del` policy
// (correctly gated on `:delete`) is dormant — no app path issues a real SQL
// DELETE against `workflows`. Gating the button on `:delete` therefore showed a
// functionally inert button to a `:delete`-only role and hid a working one from
// a `:update`-only role. The only consumer of `:delete` is the UI-orphaned REST
// route DELETE /v1/services/workflows/:id.
const canDeleteWorkflow = computed(() => isAllowed(['workflows_templates:update']))
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
      router.push(getCompanyPath(listPath.value))
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
  // Two different questions, two different queries.
  //
  // CLONE SOURCE — live versions only: copying a discarded draft's steps would
  // resurrect work someone deliberately threw away.
  //
  // NEXT NUMBER — every version, including soft-deleted ones. The unique index
  // `workflow_versions_workflow_version_unique (workflow_id, version_major,
  // version_minor)` has no `WHERE deleted_at IS NULL`, so a discarded 1.1 still
  // owns that slot forever. Numbering from live rows alone therefore picked a
  // number already taken and the insert failed with 23505 — "reopen CAPA
  // template" was dead for any workflow with a discarded draft (reported
  // 2026-08-18; 2 of 72 workflows were already in that state).
  //
  // So numbers only ever go up, and a discarded 1.1 is never reissued. That is
  // also the right answer for a QMS: two different versions both called 1.1
  // would make the audit trail ambiguous about which one an entry refers to.
  const byVersionDesc = (a, b) =>
    a.versionMajor !== b.versionMajor
      ? b.versionMajor - a.versionMajor
      : b.versionMinor - a.versionMinor

  const liveVersions = (await db.WorkflowVersion.where('workflowId', workflowId).exec()).sort(
    byVersionDesc,
  )
  const allVersions = (
    await db.WorkflowVersion.where('workflowId', workflowId, { force: true }).exec()
  ).sort(byVersionDesc)

  const sourceVersion = liveVersions[0]
  const highest = allVersions[0]
  const currentVersionMajor = highest ? highest.versionMajor : 0
  const currentVersionMinor = highest ? highest.versionMinor : 0
  const newMajor = majorBump ? currentVersionMajor + 1 : currentVersionMajor
  const newMinor = majorBump ? 0 : currentVersionMinor + 1

  const newVersion = db.WorkflowVersion.create({
    workflowId,
    versionMajor: newMajor,
    versionMinor: newMinor,
    statusId: 'DRAFT',
  })
  await newVersion.save()

  // Steps + per-step users/roles/outcomes + parent remap — shared with the
  // template list's Clone action (workflowVersionCopy.js).
  await copyVersionSteps(db, sourceVersion?.id, newVersion.id)

  return newVersion
})

async function handleCreateDraft(majorBump = false) {
  creatingDraft.value = true
  try {
    const newVersion = await createDraftMutation({ workflowId: props.id, majorBump })
    toast.success('New draft version created')
    // Land ON the new draft (user report 2026-08-10). Clearing to null relied
    // on the versions-watch fallback, but that watch prefers the
    // ?version=<label> still in the URL — the published one — so the editor
    // snapped straight back to the locked version.
    selectedVersionId.value = newVersion?.id ?? null
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
  // `selectedStepId` just tracks "the step being worked on" for hosts/telemetry
  // — expansion state lives in WorkflowStepList (every step starts expanded).
  // Never auto-select; a stale id (deleted step) simply clears.
  if (!steps.value.some((s) => s.id === selectedStepId.value)) {
    selectedStepId.value = null
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

          <!-- Default for the module (user request 2026-08-16). Hidden for a
               template-owned flow: those are Document Control workflows, where
               isDefault already marks the ad-hoc flow used by template-less
               documents. Letting this toggle move that marker would quietly
               repoint every such document. -->
          <BaseTooltip
            v-if="!isTemplateOwned && workflow"
            :content="
              workflow.isDefault
                ? 'Auto-selected for new records in this module'
                : 'Make this the workflow auto-selected for new records in this module'
            "
          >
            <button
              type="button"
              :disabled="!canToggleDefault || defaultBusy"
              class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:px-2.5 tw:py-1.5 tw:text-xs tw:font-medium tw:transition-colors tw:disabled:opacity-50"
              :class="
                workflow.isDefault
                  ? 'tw:border-amber-300 tw:bg-amber-50 tw:text-amber-700'
                  : 'tw:border-divider tw:text-secondary tw:hover:text-primary tw:hover:border-primary/50'
              "
              :aria-pressed="!!workflow.isDefault"
              @click="handleToggleDefault"
            >
              <component
                :is="workflow.isDefault ? IconStarFilled : IconStar"
                :size="14"
                :class="workflow.isDefault ? 'tw:text-amber-500' : ''"
              />
              Default
            </button>
          </BaseTooltip>

          <span v-if="isTemplateOwned" class="tw:text-xs tw:text-secondary">
            Published with its document template
          </span>
          <template v-else-if="canUpdate">
            <BaseButton :isLoading="publishing" @click="handlePublish"> Publish </BaseButton>
          </template>
          <!-- "Reopen for Editing" rather than "Create New Draft" (user
               request 2026-08-16): from a published version the intent is to
               make this editable again, which is what the reader is looking
               for. That a new draft version is how it happens is mechanism.
               Matches the same action on a published Document Template. -->
          <BaseButton
            v-if="!isTemplateOwned && canCreateDraft"
            :isLoading="creatingDraft"
            @click="handleCreateDraft(false)"
          >
            Reopen for Editing
          </BaseButton>

          <!-- Lifecycle keyed off the selected version: a DRAFT is
               discarded (the whole workflow if it's the only version);
               a published version archives/restores the workflow (it may
               be attached to records). -->
          <BaseButton
            v-if="!isTemplateOwned && isDraftVersion && canDeleteWorkflow"
            variant="ghost"
            class="tw:text-red-600"
            :isLoading="workflowStatusBusy"
            @click="handleDeleteDraft"
          >
            <IconTrash :size="16" />
            {{ isOnlyVersion ? 'Delete' : 'Discard Draft' }}
          </BaseButton>
          <BaseButton
            v-else-if="!isTemplateOwned && isArchived && canArchiveWorkflow"
            variant="ghost"
            :isLoading="workflowStatusBusy"
            @click="setWorkflowStatus('ACTIVE')"
          >
            <IconRestore :size="16" />
            Restore
          </BaseButton>
          <BaseButton
            v-else-if="!isTemplateOwned && canArchiveWorkflow"
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
          This version is published and locked. Reopen it for editing to make changes.
        </span>
      </div>

      <!-- Global Settings — name and description stacked on their own rows,
           aligned to the same centered column as the workflow canvas below
           (user request 2026-08-13). -->
      <div class="tw:bg-main tw:border-b tw:border-divider tw:py-4">
        <div
          class="tw:w-full tw:max-w-3xl tw:mx-auto tw:px-4 tw:md:px-8 tw:flex tw:flex-col tw:gap-4"
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
      </div>

      <!-- Workflow canvas — steps as a top-to-bottom flow. Clicking a step
           EXPANDS its configuration in place, under the card (user request
           2026-08-14; was a dialog, and before that a two-pane split). The
           flow stays visible above and below while you configure. -->
      <div v-if="selectedVersion" class="tw:flex-1 tw:overflow-y-auto tw:bg-main">
        <WorkflowStepList
          v-model:stepId="selectedStepId"
          :versionId="selectedVersionId"
          :canUpdate="canUpdate"
          :showChildSteps="showChildSteps"
          :moduleId="workflow?.moduleId"
          @openSettings="openStepSettings"
          @openAssignees="openStepAssignees"
        >
          <!-- Expanded step configuration — no header (user request
               2026-08-15): the card directly above already carries the step
               number, name, type and the collapse chevron, so a second title
               row was pure duplication. Renaming lives on the card's title.
               Everything autosaves. -->
          <template #stepEditor="{ stepId: expandedStepId }">
            <!-- No border/rounding of its own — this renders inside the step
                 card, below its header divider (one panel per step). -->
            <div class="tw:bg-sidebar tw:p-4 tw:md:p-5">
              <WorkflowStepEditor
                :stepId="expandedStepId"
                :canUpdate="canUpdate"
                :showFormSchema="showFormSchema"
                :selectedApprovalRule="selectedApprovalRule"
                @openAssignees="openStepAssignees(expandedStepId)"
              />
            </div>
          </template>
        </WorkflowStepList>
      </div>

      <!-- Secondary step config — one instance each, driven by the gear /
           people buttons on any step's header. Work whether or not that step
           is expanded, so each dialog owns its own load + autosave. -->
      <WorkflowStepSettingsDialog
        v-model="settingsDialogOpen"
        :stepId="settingsStepId"
        :canUpdate="canUpdate"
        :showAllowChildSteps="showAllowChildSteps"
      />
      <WorkflowStepAssigneesDialog
        v-if="assigneesStepId"
        v-model="assigneesDialogOpen"
        :stepId="assigneesStepId"
        :canUpdate="canUpdate"
        :stepApproversTab="stepApproversTab"
      />
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

        <p v-if="publishReadiness.warnings.length" class="tw:text-caption tw:text-secondary">
          You can publish anyway, or go back and add task forms first (Task Form tab on each step).
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
