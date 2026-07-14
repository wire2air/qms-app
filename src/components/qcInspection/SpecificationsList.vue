<script setup>
/**
 * Specifications list — the versioned test master. Reads live from the
 * SyncEngine; create/version/approve go through the qcInspection REST service
 * (aggregate writes, not plain entity CRUD). Rendered via the shared DataTable —
 * search, advanced filter (incl. created-date), density, column manager and
 * export all live in the table toolbar.
 */
import { IconPlus } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

defineProps({ canManage: { type: Boolean, default: false } })

const toast = useToast()
const router = useRouter()
const showCreate = ref(false)
const showEsign = ref(false)
const approvingId = ref(null)
const deletingId = ref(null)

const canApprove = computed(() => isAllowed(['inspection_spec:write']))

function startApprove(spec) {
  approvingId.value = spec.id
  showEsign.value = true
}

async function deleteSpec(id) {
  if (deletingId.value !== id) {
    deletingId.value = id
    return
  }
  try {
    await del(`/v1/services/qcInspection/specifications/${id}`)
    toast.success('Specification deleted')
  } catch (err) {
    toast.error(err?.message || 'Delete failed')
  } finally {
    deletingId.value = null
  }
}

async function onEsignVerified({ method, token }) {
  if (!approvingId.value) return
  try {
    await post(`/v1/services/qcInspection/specifications/${approvingId.value}/approve`, {
      esign: { method, token },
    })
    toast.success('Specification approved — now effective')
  } catch (err) {
    toast.error(err?.message || 'Approval failed')
  } finally {
    approvingId.value = null
  }
}

const MATERIAL_LABELS = {
  RAW: 'Raw material',
  PACKAGING: 'Packaging',
  BULK: 'Bulk',
  FINISHED: 'Finished good',
}
const MATERIAL_OPTIONS = Object.entries(MATERIAL_LABELS).map(([value, label]) => ({ value, label }))

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true },
  {
    name: 'material',
    label: 'MATERIAL',
    field: 'materialKind',
    align: 'left',
    filterType: 'select',
    filterOptions: MATERIAL_OPTIONS,
  },
  { name: 'version', label: 'VERSION', field: 'version', align: 'left', sortable: true },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left' },
  {
    name: 'createdAt',
    label: 'CREATED',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const specs = useLiveQuery(
  async (db) => {
    let rows = await db.Specification.where().exec()
    rows = rows.filter((s) => s.statusId !== 'SUPERSEDED')
    return rows.sort((a, b) => (a.name || '').localeCompare(b.name || '') || b.version - a.version)
  },
  { models: ['Specification'], initial: [] },
)

function openSpec(id) {
  router.push(getCompanyPath(`/qc-inspection/specifications/${id}`))
}
</script>

<template>
  <DataTable
    :rows="specs"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    densitySelector
    columnManager
    exportManager
    exportFilename="specifications.csv"
    persistKey="qcInspection:specifications"
    noDataLabel="No specifications yet."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:text-secondary">{{ specs.length }} specification(s)</span>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Specification
      </BaseButton>
    </template>

    <template #body-cell-name="{ row }">
      <RouterLink
        :to="getCompanyPath(`/qc-inspection/specifications/${row.id}`)"
        class="tw:font-medium tw:text-on-main tw:hover:text-primary"
      >
        {{ row.name }}
        <span v-if="row.code" class="tw:text-xs tw:text-secondary">
          · {{ row.code }}</span
        >
      </RouterLink>
    </template>

    <template #body-cell-material="{ row }">
      <span class="tw:text-secondary">{{ MATERIAL_LABELS[row.materialKind] || row.materialKind }}</span>
    </template>

    <template #body-cell-version="{ row }">
      <span class="tw:text-secondary">v{{ row.version }}</span>
    </template>

    <template #body-cell-status="{ row }">
      <SpecificationStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div
        v-if="canApprove && row.statusId === 'DRAFT'"
        class="tw:flex tw:items-center tw:justify-end tw:gap-2"
      >
        <BaseButton variant="outline" size="sm" @click="startApprove(row)">Approve</BaseButton>
        <BaseButton
          :variant="deletingId === row.id ? 'danger' : 'outline'"
          size="sm"
          @click="deleteSpec(row.id)"
        >
          {{ deletingId === row.id ? 'Confirm Delete?' : 'Delete' }}
        </BaseButton>
      </div>
    </template>
  </DataTable>

  <SpecificationCreateDialog v-model="showCreate" @created="(id) => openSpec(id)" />
  <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
</template>
