<script setup>
import { IconEdit, IconGitBranch, IconCopy } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  // Filtered rows are resolved by the parent (WorkflowsHome) so the list shell
  // can derive its total/empty/loading state from a single source query.
  workflows: {
    type: Array,
    default: () => [],
  },
  // Clone is handled by the parent (shared with the card-list view).
  canClone: {
    type: Boolean,
    default: false,
  },
  // Where a row opens. Approval flows mount the same editor under
  // /approval-flows/:id so the sidebar stays on Approval Flows.
  basePath: {
    type: String,
    default: '/workflow-templates',
  },
})

const emit = defineEmits(['clone'])

const router = useRouter()

// Option sources for the advanced filter's entity-column dropdowns.
const modules = useLiveQuery((db) => db.Module.where().exec(), {
  models: ['Module'],
  initial: [],
})
const workflowVersionStatuses = useLiveQuery((db) => db.WorkflowVersionStatus.where().exec(), {
  models: ['WorkflowVersionStatus'],
  initial: [],
})
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

const columns = computed(() => {
  const filterCfg = {
    type: { filterType: 'select', filterOptions: selectOpts(modules.value) },
    statusId: { filterType: 'select', filterOptions: selectOpts(workflowVersionStatuses.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'WORKFLOW NAME', field: 'name', align: 'left', sortable: true },
    { name: 'type', label: 'TYPE', field: 'moduleId', align: 'left', sortable: true },
    { name: 'steps', label: 'STEPS', field: 'steps', align: 'left', sortable: false },
    { name: 'version', label: 'VERSION', field: 'version', align: 'left', sortable: false },
    { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
    { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const rows = computed(() =>
  [...props.workflows].sort((a, b) => {
    const ta = b.createdAt?.toMillis?.() ?? 0
    const tb = a.createdAt?.toMillis?.() ?? 0
    return ta - tb
  }),
)

const workflowMetaMap = useLiveQueryWithDeps(
  [() => rows.value.map((r) => r.id)],
  async (db, [ids]) => {
    if (!ids?.length) return {}
    const versions = await db.WorkflowVersion.where().exec()
    const steps = await db.WorkflowStep.where().exec()
    const map = {}
    for (const id of ids) {
      const workflowVersions = versions.filter((v) => v.workflowId === id)
      const representative = workflowVersions.find((v) => v.isCurrent) ?? workflowVersions[0]
      if (representative) {
        useLiveQueryWithDeps
        map[id] = {
          version: representative,
          stepCount: steps.filter((s) => s.workflowVersionId === representative.id).length,
        }
      }
    }
    return map
  },

  { models: ['WorkflowVersion', 'WorkflowStep'], initial: {} },
)

function navigateToWorkflow(row) {
  router.push(getCompanyPath(`${props.basePath}/${row.id}`))
}

// Archive / Restore / Delete live on the workflow detail page (header),
// not here — they need the full version context to decide what's safe.
function rowMenuItems(workflow) {
  const items = [{ name: 'Edit', icon: IconEdit, click: () => navigateToWorkflow(workflow) }]
  if (props.canClone) {
    items.push({ name: 'Clone', icon: IconCopy, click: () => emit('clone', workflow) })
  }
  return items
}

// TYPE/STEPS/VERSION/STATUS only ever display via ModuleBadgeById or the
// computed `workflowMetaMap` (stepCount / the representative WorkflowVersion)
// — none of those are real properties on the Workflow row itself, so
// DataTable's fallback export reads a raw `moduleId` UUID for TYPE and
// `undefined` for STEPS/VERSION/STATUS. Hand it an explicit exportColumns
// list that mirrors the body-cell logic instead.
function moduleLabel(id) {
  return modules.value.find((m) => m.id === id)?.name ?? ''
}
function versionStatusLabel(id) {
  return workflowVersionStatuses.value.find((s) => s.id === id)?.name ?? id ?? ''
}
function versionLabel(meta) {
  if (!meta?.version) return ''
  return `v${meta.version.versionLabel || `${meta.version.versionMajor ?? 1}.${meta.version.versionMinor ?? 0}`}`
}

const exportColumns = computed(() => [
  { key: 'name', label: 'WORKFLOW NAME', value: (row) => row.name ?? '' },
  { key: 'type', label: 'TYPE', value: (row) => moduleLabel(row.moduleId) },
  {
    key: 'steps',
    label: 'STEPS',
    value: (row) => workflowMetaMap.value[row.id]?.stepCount ?? 0,
  },
  { key: 'version', label: 'VERSION', value: (row) => versionLabel(workflowMetaMap.value[row.id]) },
  {
    key: 'statusId',
    label: 'STATUS',
    value: (row) => versionStatusLabel(workflowMetaMap.value[row.id]?.version?.statusId),
  },
  { key: 'createdAt', label: 'CREATED', value: (row) => row.createdAt?.formatDate?.('date') ?? '' },
  // ACTIONS intentionally omitted — exportColumns is an explicit allowlist.
])

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    exportManager
    :exportColumns="exportColumns"
    exportFilename="workflows.csv"
  >
    <template #body-cell-name="{ row }">
      <!-- Cap the cell width and truncate: a long name/description otherwise
           stretches the column and pushes the actions three-dots off-screen,
           forcing a horizontal scroll to reach it. min-w-0 lets the flex
           children shrink so `truncate`/`line-clamp` actually apply. -->
      <BaseClickableRow
        class="tw:flex tw:flex-col tw:min-w-0 tw:max-w-xs"
        :aria-label="`Edit workflow ${row.name}`"
        @click="navigateToWorkflow(row)"
      >
        <span class="tw:truncate tw:font-bold tw:text-on-main">{{ row.name }}</span>
        <span v-if="row.description" class="tw:text-xs tw:text-secondary tw:line-clamp-1">
          {{ row.description }}
        </span>
      </BaseClickableRow>
    </template>

    <template #body-cell-type="{ row }">
      <ModuleBadgeById :moduleId="row.moduleId" />
    </template>

    <template #body-cell-steps="{ row }">
      <div class="tw:flex tw:items-center tw:gap-1">
        <IconGitBranch :size="16" class="tw:text-secondary" />
        <span class="tw:text-sm tw:text-secondary">
          {{ workflowMetaMap[row.id]?.stepCount ?? 0 }} Steps
        </span>
      </div>
    </template>

    <template #body-cell-version="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        v{{
          workflowMetaMap[row.id]?.version?.versionLabel ||
          `${workflowMetaMap[row.id]?.version?.versionMajor ?? 1}.${workflowMetaMap[row.id]?.version?.versionMinor ?? 0}`
        }}
      </span>
    </template>

    <template #body-cell-statusId="{ row }">
      <WorkflowVersionStatusBadgeById
        :statusId="workflowMetaMap[row.id]?.version?.statusId"
        showDot
      />
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        {{ row.createdAt?.formatDate('date') }}
      </span>
    </template>

    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
