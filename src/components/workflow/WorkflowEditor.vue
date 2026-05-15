<script setup>
import { IconHistory, IconLock, IconCheck } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
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
const workflow = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.Workflow.findByPk(id),
)

const WORKFLOW_MODULES_WITH_STEP_CONFIG = ['NON_CONFORMANCE', 'CAPA']
const showAllowedOutcomes = computed(() =>
  WORKFLOW_MODULES_WITH_STEP_CONFIG.includes(workflow.value?.moduleId),
)
const showSendBackTargets = computed(() =>
  WORKFLOW_MODULES_WITH_STEP_CONFIG.includes(workflow.value?.moduleId),
)
const showFormSchema = computed(() =>
  WORKFLOW_MODULES_WITH_STEP_CONFIG.includes(workflow.value?.moduleId),
)
// CAPA workflows allow a root step to spawn parallel tasks for multiple
// assignees — exposed as a per-step checkbox. Other modules don't expose it.
const showAllowMultipleTasks = computed(() => workflow.value?.moduleId === 'CAPA')
const showChildSteps = computed(() => workflow.value?.moduleId === 'CAPA')
const stepApproversTab = computed(() => {
  if (workflow.value?.moduleId === 'NON_CONFORMANCE') return 'roles'
  if (workflow.value?.moduleId === 'CAPA') return 'roles'
  return 'both'
})
const selectedApprovalRule = computed(() => {
  if (!workflow.value) return null
  if (workflow.value.moduleId === 'NON_CONFORMANCE') return 'ANY'
  if (workflow.value.moduleId === 'CAPA') return 'ALL'
  return null
})

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
  { initial: [] },
)

const steps = useLiveQueryWithDeps(
  [() => selectedVersionId.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).exec()
  },
  { initial: [] },
)

const stepUsers = useLiveQueryWithDeps(
  [() => steps.value.map((s) => s.id)],
  async (db, [stepIds]) => {
    if (!stepIds || stepIds.length === 0) return []
    return db.WorkflowStepUser.where('stepId', stepIds).exec()
  },
)

const stepRoles = useLiveQueryWithDeps(
  [() => steps.value.map((s) => s.id)],
  async (db, [stepIds]) => {
    if (!stepIds || stepIds.length === 0) return []
    return db.WorkflowStepRole.where('stepId', stepIds).exec()
  },
)

const stepsWithoutAssignees = computed(() => {
  return steps.value.filter((step) => {
    const hasUsers = stepUsers.value.some((su) => su.stepId === step.id)
    const hasRoles = stepRoles.value.some((sr) => sr.stepId === step.id)
    return !hasUsers && !hasRoles
  })
})

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
  return isDraftVersion.value && isAllowed(['workflows:update'])
})

const canCreateDraft = computed(() => {
  const haveDraftVersion = versions.value.some((v) => v.statusId === 'DRAFT')
  return isAllowed(['workflows:update']) && !haveDraftVersion
})

// --- Handlers ---

const handlePublish = useLiveMutation(async () => {
  if (!isDraftVersion.value) {
    toast.warning('Switch to a draft version to publish.')
    return
  }

  // Validate each step has at least one role or reviewer
  if (stepsWithoutAssignees.value?.length > 0) {
    toast.warning('Please assign at least one user or role to each step before publishing.')
    return
  }

  publishing.value = true
  try {
    selectedVersion.value.statusId = 'PUBLISHED'
    await selectedVersion.value.save()
    toast.success('Workflow published successfully')
  } finally {
    publishing.value = false
  }
})

const creatingDraft = ref(false)

const createDraftMutation = useLiveMutation(async (db, { workflowId, majorBump }) => {
  const sourceVersions = await db.WorkflowVersion.where('workflowId', workflowId, {
    force: true,
  }).exec()
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
      approvalRule: step.approvalRule,
      slaDays: step.slaDays,
      requireComments: step.requireComments,
      requireEsignature: step.requireEsignature,
      allowMultipleTasks: step.allowMultipleTasks ?? false,
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

    const sendBacks = await db.StepSendBackTarget.where('stepId', oldStep.id).exec()
    for (const sb of sendBacks) {
      const newTargetId = idMap[sb.targetStepId]
      if (!newTargetId) continue
      const newSb = db.StepSendBackTarget.create({
        stepId: newStep.id,
        targetStepId: newTargetId,
      })
      await newSb.save()
    }
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

const isFirstLoad = ref(true)

const debouncedSaveVersion = useDebounceFn(() => {
  if (!selectedVersion.value) return
  selectedVersion.value.save()
}, 1000)

const debounedSaveWorkflow = useDebounceFn(() => {
  if (!workflow.value) return
  workflow.value.save()
}, 1000)

watch(
  selectedVersion,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    debouncedSaveVersion()
  },
  { deep: true },
)

watch(
  workflow,
  (oldValue) => {
    // undefined on initial load, we only want to trigger save on subsequent changes
    if (oldValue === undefined) {
      return
    }
    debounedSaveWorkflow()
  },
  { deep: true },
)

watch(steps, () => {
  if (!steps.value.some((s) => s.id === selectedStepId.value)) {
    selectedStepId.value = steps.value[0]?.id ?? null
  }
})
</script>

<template>
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
                  class="tw:px-3 tw:py-1 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide"
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

      <!-- Global Settings -->
      <div class="tw:flex tw:flex-col tw:bg-main tw:border-b tw:border-divider tw:px-6 tw:py-4">
        <div>
          <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-1.5">
            Workflow Name
          </label>
          <BaseTextInput
            v-model="workflow.name"
            name="name"
            placeholder="e.g. Global SOP Multi-Stage Workflow"
            :disabled="!canUpdate"
          />
        </div>

        <BaseTextarea
          v-model="workflow.description"
          name="description"
          label="Description"
          placeholder="Describe the purpose of this workflow"
          :disabled="!canUpdate"
          class="tw:mt-4"
          autosize
          :maxRows="4"
        />
      </div>

      <!-- Two-Pane Designer -->
      <div v-if="selectedVersion" class="tw:flex tw:flex-1 tw:overflow-hidden">
        <!-- Left Pane: Step List -->
        <WorkflowStepList
          v-model:stepId="selectedStepId"
          :versionId="selectedVersionId"
          :canUpdate="canUpdate"
          :showChildSteps="showChildSteps"
        />

        <!-- Right Pane: Step Editor -->
        <div class="tw:flex-1 tw:overflow-y-auto tw:bg-main tw:p-8">
          <div v-if="selectedStepId" class="tw:max-w-4xl tw:mx-auto tw:space-y-10">
            <WorkflowStepEditor
              :stepId="selectedStepId"
              :canUpdate="canUpdate"
              :showAllowedOutcomes="showAllowedOutcomes"
              :showSendBackTargets="showSendBackTargets"
              :showFormSchema="showFormSchema"
              :showAllowMultipleTasks="showAllowMultipleTasks"
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
  </div>
</template>
