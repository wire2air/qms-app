<script setup>
import { IconEdit, IconGitBranch } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  filters: {
    type: Object,
    default: () => ({ search: '', statusId: null }),
  },
})

const router = useRouter()

const columns = [
  { name: 'name', label: 'WORKFLOW NAME', field: 'name', align: 'left', sortable: true },
  { name: 'type', label: 'TYPE', field: 'moduleId', align: 'left', sortable: true },
  { name: 'steps', label: 'STEPS', field: 'steps', align: 'left', sortable: false },
  { name: 'version', label: 'VERSION', field: 'version', align: 'left', sortable: false },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const rows = useLiveQueryWithDeps(
  [() => props.filters?.search, () => props.filters?.statusId],
  async (db, [search, statusId]) => {
    let results = await db.Workflow.where().exec()
    if (statusId) results = results.filter((r) => r.statusId === statusId)
    if (search) {
      const q = search.toLowerCase()
      results = results.filter((r) => r.name.toLowerCase().includes(q))
    }
    return results.sort((a, b) => {
      const ta = b.createdAt?.toMillis?.() ?? 0
      const tb = a.createdAt?.toMillis?.() ?? 0
      return ta - tb
    })
  },

  { models: ['Workflow'], initial: [] },
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
  router.push(getCompanyPath(`/workflow-templates/${row.id}`))
}

// Archive / Restore / Delete live on the workflow detail page (header),
// not here — they need the full version context to decide what's safe.
function rowMenuItems(workflow) {
  return [{ name: 'Edit', icon: IconEdit, click: () => navigateToWorkflow(workflow) }]
}

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})
</script>

<template>
  <BaseTable v-model:pagination="pagination" :rows="rows" :columns="columns" rowKey="id">
    <template #body-cell-name="{ row }">
      <BaseClickableRow
        class="tw:flex tw:flex-col"
        :aria-label="`Edit workflow ${row.name}`"
        @click="navigateToWorkflow(row)"
      >
        <span class="tw:font-bold tw:text-on-main">{{ row.name }}</span>
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
      <span class="tw:text-sm tw:text-secondary tw:font-mono">
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
  </BaseTable>
</template>
