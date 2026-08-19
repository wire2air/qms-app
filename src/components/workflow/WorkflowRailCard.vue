<script setup>
/**
 * The Workflow rail card, shared by every record module (2026-08-17).
 *
 * NC and CAPA each had their own copy and rendered the picker as a GRID OF
 * CARDS, which ate most of the rail; Change Control and Complaint showed
 * nothing at all, so there was no way to see or change the workflow on a draft.
 * One component now serves all four, and it is a dropdown.
 *
 * Two states, and only two:
 *
 *   running   name, status, and links out. Nothing to choose — the workflow is
 *             already executing and switching it would strand live tasks.
 *   draft     a dropdown. The workflow is not running yet, so it is still the
 *             owner's to change.
 *
 * Changing it clears pendingReviewers, because those are per-step picks against
 * the OLD step list; carried across they would point at steps that no longer
 * exist. Every module already did this — it is now in one place rather than
 * copied per module, which is how the two that had it drifted from the two
 * that did not.
 */
import WorkflowVersionSelect from '@/components/documents/WorkflowVersionSelect.vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  /** The record itself — CAPA, NC, ChangeRequest or Complaint. */
  record: { type: Object, default: null },
  /** Workflow module the picker draws its options from, e.g. 'CAPA'. */
  moduleId: { type: String, required: true },
  /** WorkflowInstance.resourceType for this module, e.g. 'Capa'. */
  resourceType: { type: String, required: true },
  /** Whether this user may still switch it — normally DRAFT and the owner. */
  canChange: { type: Boolean, default: false },
  /** Shown under the picker; each module words its own start action. */
  changeHint: { type: String, default: '' },
})

const toast = useToast()

/** The version query param the template editor expects — matches the CAPA
 *  original, including the versionLabel override. */
function workflowVersionLabel(v) {
  if (!v) return ''
  return v.versionLabel || `${v.versionMajor ?? 1}.${v.versionMinor ?? 0}`
}

const workflowInstance = useLiveQueryWithDeps(
  [() => props.record?.id, () => props.resourceType],
  async (db, [id, type]) => {
    if (!id || !type) return null
    const rows = await db.WorkflowInstance.where('[resourceType+resourceId]', [type, id]).exec()
    return (
      rows.find((w) => w.statusId === 'IN_PROGRESS') ??
      rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0] ??
      null
    )
  },
  { models: ['WorkflowInstance'], initial: null },
)

// Resolved from the instance when running, else from the record's own pick —
// a draft has a chosen version but no instance yet.
const versionId = computed(
  () => workflowInstance.value?.workflowVersionId ?? props.record?.workflowVersionId ?? null,
)

const workflowVersion = useLiveQueryWithDeps(
  [() => versionId.value],
  async (db, [id]) => (id ? db.WorkflowVersion.findByPk(id) : null),
  { models: ['WorkflowVersion'], initial: null },
)

const workflow = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],
  async (db, [id]) => (id ? db.Workflow.findByPk(id) : null),
  { models: ['Workflow'], initial: null },
)

const isRunning = computed(() => !!workflowInstance.value)

/** "Default CAPA Workflow v1.0" — the name alone is ambiguous once a template
 *  has more than one version, and which version a record is on is exactly what
 *  you need to know when its steps do not match the current template. */
const versionText = computed(() =>
  workflowVersion.value ? `v${workflowVersionLabel(workflowVersion.value)}` : '',
)

/**
 * Is the template's current version newer than the one this record is on?
 *
 * A running instance is pinned to the version it started on, deliberately — the
 * steps you are working are the ones you were given. But that pinning is
 * invisible, so a template edited mid-flight leaves the record showing steps
 * that no longer match the template anyone else is looking at, with nothing on
 * screen to explain it.
 */
const latestVersion = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],
  async (db, [workflowId]) => {
    if (!workflowId) return null
    const rows = await db.WorkflowVersion.where('workflowId', workflowId).exec()
    return (
      rows
        .slice()
        .sort(
          (a, b) =>
            (a.versionMajor ?? 0) - (b.versionMajor ?? 0) ||
            (a.versionMinor ?? 0) - (b.versionMinor ?? 0),
        )
        .pop() ?? null
    )
  },
  { models: ['WorkflowVersion'], initial: null },
)

const isSupersededVersion = computed(
  () =>
    !!workflowVersion.value &&
    !!latestVersion.value &&
    latestVersion.value.id !== workflowVersion.value.id,
)

const selectedWorkflowVersionId = computed({
  get: () => props.record?.workflowVersionId ?? null,
  set: async (id) => {
    const rec = props.record
    if (!rec || id === rec.workflowVersionId) return
    const previous = rec.workflowVersionId
    rec.workflowVersionId = id
    // Per-step picks against the old step list — meaningless once the steps
    // change, and actively wrong if a step id happens to collide.
    rec.pendingReviewers = {}
    try {
      await rec.save()
    } catch (e) {
      rec.workflowVersionId = previous
      toast.error(e?.message || 'Could not change the workflow')
    }
  },
})
</script>

<template>
  <BaseRailCard title="Workflow">
    <!-- Running: report, don't offer. -->
    <div v-if="isRunning" class="tw:flex tw:flex-col tw:gap-1">
      <BaseText v-if="workflow" variant="body" weight="medium">
        {{ workflow.name }}<span v-if="versionText" class="tw:text-secondary">
          {{ versionText }}</span
        >
      </BaseText>
      <BaseCaption v-if="isSupersededVersion">
        This record is running v{{ workflowVersionLabel(workflowVersion) }}. The template has since
        moved to v{{ workflowVersionLabel(latestVersion) }} — in-flight records stay on the version
        they started, so its steps will not match the newer template.
      </BaseCaption>
      <div>
        <WorkflowInstanceStatusBadgeById :statusId="workflowInstance.statusId" showDot />
      </div>
      <RouterLink
        class="tw:mt-1 tw:text-sm tw:font-medium tw:text-primary tw:hover:underline"
        :to="getCompanyPath(`/workflow-instances/${workflowInstance.id}`)"
      >
        View workflow details →
      </RouterLink>
      <RouterLink
        v-if="workflow && workflowVersion"
        class="tw:text-sm tw:font-medium tw:text-primary tw:hover:underline"
        :to="
          getCompanyPath(
            `/workflow-templates/${workflow.id}?version=${encodeURIComponent(
              workflowVersionLabel(workflowVersion),
            )}`,
          )
        "
      >
        View workflow template →
      </RouterLink>
    </div>

    <!-- Draft and the user may change it: one dropdown row, not a grid of
         cards. `compact` is what makes it a dropdown — passing only `dense`
         still renders the card grid, which is what filled the rail before. -->
    <div v-else-if="canChange" class="tw:flex tw:flex-col tw:gap-1.5">
      <WorkflowVersionSelect
        v-model="selectedWorkflowVersionId"
        :moduleId="moduleId"
        compact
        dense
      />
      <BaseCaption v-if="changeHint">{{ changeHint }}</BaseCaption>
    </div>

    <!-- Chosen, but not running and not this user's to change. -->
    <div v-else-if="versionId" class="tw:flex tw:flex-col tw:gap-1">
      <BaseText v-if="workflow" variant="body" weight="medium">
        {{ workflow.name }}<span v-if="versionText" class="tw:text-secondary">
          {{ versionText }}</span
        >
      </BaseText>
      <BaseText color="secondary" class="tw:text-sm">Not started yet.</BaseText>
      <BaseCaption v-if="isSupersededVersion">
        The template has moved to v{{ workflowVersionLabel(latestVersion) }} since this was chosen.
      </BaseCaption>
    </div>

    <BaseText v-else color="secondary" class="tw:text-sm tw:italic">
      No workflow selected yet.
    </BaseText>
  </BaseRailCard>
</template>
