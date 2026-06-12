<script setup>
import { IconHierarchy, IconList } from '@tabler/icons-vue'

const props = defineProps({
  dense: {
    type: Boolean,
    default: false,
  },
  moduleId: {
    type: String,
    default: null,
  },
})

const selectedVersionId = defineModel({
  type: [String, null],
  default: null,
})

const workflows = useLiveQueryWithDeps(
  [() => props.moduleId],
  async (db, [moduleId]) => db.Workflow.where('moduleId', moduleId).exec(),
  {
    initial: [],
  },
)

const versions = useLiveQuery(async (db) => db.WorkflowVersion.where().exec(), {
  initial: [],
})

const steps = useLiveQuery(async (db) => db.WorkflowStep.where().exec(), { initial: [] })

const activeWorkflows = computed(() => {
  return workflows.value
    .filter((w) => w.statusId === 'ACTIVE')
    .map((w) => {
      const version = versions.value.find(
        (v) => v.workflowId === w.id && v.statusId === 'PUBLISHED',
      )
      return version ? { workflow: w, version } : null
    })
    .filter(Boolean)
})

// Handle pre-selected version that isn't in the active list (e.g. non-current version)
const extraEntry = computed(() => {
  if (!selectedVersionId.value) return null
  const alreadyListed = activeWorkflows.value.some((e) => e.version.id === selectedVersionId.value)
  if (alreadyListed) return null
  const version = versions.value.find((v) => v.id === selectedVersionId.value)
  if (!version) return null
  const workflow = workflows.value.find((w) => w.id === version.workflowId)
  if (!workflow) return null
  return { workflow, version }
})

const displayWorkflows = computed(() => {
  if (extraEntry.value) return [...activeWorkflows.value, extraEntry.value]
  return activeWorkflows.value
})

function stepCount(versionId) {
  return steps.value.filter((s) => s.workflowVersionId === versionId).length
}

// Auto-select: the module's default workflow wins; a single available
// workflow is the implicit default. Reduces friction — most tenants have
// one blessed flow per module and shouldn't have to pick it every time.
watch(
  activeWorkflows,
  (entries) => {
    if (selectedVersionId.value || !entries.length) return
    const def = entries.find((e) => e.workflow.isDefault)
    if (def) {
      selectedVersionId.value = def.version.id
    } else if (entries.length === 1) {
      selectedVersionId.value = entries[0].version.id
    }
  },
  { immediate: true },
)

function pickWorkflow(entry) {
  selectedVersionId.value = entry.version.id
}

function versionLabel(version) {
  return `v${version.versionLabel || `${version.versionMajor}.${version.versionMinor}`}`
}
</script>

<template>
  <div class="tw:space-y-3">
    <!-- Empty state -->
    <div
      v-if="displayWorkflows.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-10 tw:gap-2 tw:text-secondary"
    >
      <IconHierarchy :size="32" class="tw:opacity-40" />
      <p class="tw:text-sm tw:font-medium">No active workflows available</p>
    </div>

    <!-- Workflow list -->
    <div v-else class="tw:grid tw:grid-cols-1 tw:gap-2">
      <div
        v-for="entry in displayWorkflows"
        :key="entry.workflow.id"
        class="tw:w-full tw:flex tw:items-center tw:justify-between tw:p-4 tw:rounded-xl tw:border-2 tw:cursor-pointer tw:transition-all tw:group"
        :class="[
          [
            selectedVersionId === entry.version.id
              ? 'tw:border-primary tw:bg-primary/5'
              : 'tw:border-divider tw:bg-sidebar tw:hover:border-primary/50 tw:hover:bg-sidebar-hover',
            { 'tw:flex-col': dense },
          ],
        ]"
        @click="pickWorkflow(entry)"
      >
        <div class="tw:flex tw:items-center tw:gap-3">
          <div
            v-if="!dense"
            class="tw:h-9 tw:w-9 tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:shrink-0"
            :class="
              selectedVersionId === entry.version.id
                ? 'tw:bg-primary/10 tw:text-primary'
                : 'tw:bg-sidebar-hover tw:text-secondary tw:group-hover:bg-primary/10 tw:group-hover:text-primary'
            "
          >
            <IconHierarchy :size="20" />
          </div>
          <div>
            <p
              class="tw:font-bold tw:text-sm tw:text-on-sidebar tw:group-hover:text-primary tw:transition-colors"
              :class="{ 'tw:text-primary': selectedVersionId === entry.version.id }"
            >
              {{ entry.workflow.name }}
              <span
                v-if="entry.workflow.isDefault"
                class="tw:ml-1 tw:text-[10px] tw:font-semibold tw:px-1.5 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary tw:align-middle"
              >
                Default
              </span>
            </p>
            <p
              v-if="entry.workflow.description"
              class="tw:text-xs tw:text-secondary tw:line-clamp-1"
            >
              {{ entry.workflow.description }}
            </p>
            <p class="tw:text-xs tw:text-secondary">{{ versionLabel(entry.version) }}</p>
          </div>
        </div>
        <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
          <span
            v-if="stepCount(entry.version.id)"
            class="tw:bg-sidebar-hover tw:px-2 tw:py-1 tw:rounded tw:text-[10px] tw:font-bold tw:text-secondary tw:flex tw:items-center tw:gap-1"
          >
            <IconList :size="12" />
            {{ stepCount(entry.version.id) }} Steps
          </span>
          <span
            v-if="selectedVersionId === entry.version.id"
            class="ds-label-sm tw:px-2 tw:py-0.5 tw:bg-primary tw:text-white tw:rounded"
          >
            Selected
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
