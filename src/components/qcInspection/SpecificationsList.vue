<script setup>
/**
 * Specifications list — the versioned test master. Reads live from the
 * SyncEngine; create/version/approve go through the qcInspection REST service
 * (aggregate writes, not plain entity CRUD).
 */
import { IconPlus, IconDownload } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { dateInRange } from '@/utils/listFilters.js'
import { exportToCSV } from '@/utils/exportUtils.js'

defineProps({ canManage: { type: Boolean, default: false } })

const router = useRouter()
const showCreate = ref(false)
const dateFrom = ref('')
const dateTo = ref('')

const MATERIAL_LABELS = {
  RAW: 'Raw material',
  PACKAGING: 'Packaging',
  BULK: 'Bulk',
  FINISHED: 'Finished good',
}

const specs = useLiveQueryWithDeps(
  [() => dateFrom.value, () => dateTo.value],
  async (db, [from, to]) => {
    let rows = await db.Specification.where().exec()
    if (from || to) rows = rows.filter((s) => dateInRange(s.createdAt, from, to))
    return rows.sort((a, b) => (a.name || '').localeCompare(b.name || '') || b.version - a.version)
  },
  { initial: [] },
)

function openSpec(id) {
  router.push(getCompanyPath(`/qc-inspection/specifications/${id}`))
}

function exportCsv() {
  exportToCSV(
    specs.value,
    [
      { field: 'name', label: 'Name' },
      { field: 'code', label: 'Code' },
      { field: (r) => MATERIAL_LABELS[r.materialKind] || r.materialKind, label: 'Material' },
      { field: 'version', label: 'Version' },
      { field: 'statusId', label: 'Status' },
      { field: (r) => r.createdAt?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Created' },
    ],
    'specifications',
  )
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
      <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
        <div class="tw:text-sm tw:text-secondary">{{ specs.length }} specification(s)</div>
        <DateRangeFilter
          :from="dateFrom"
          :to="dateTo"
          @update:from="(v) => (dateFrom = v)"
          @update:to="(v) => (dateTo = v)"
        />
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="outline" size="sm" :disabled="!specs.length" @click="exportCsv">
          <template #icon><IconDownload :size="16" /></template>
          Export
        </BaseButton>
        <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
          <template #icon><IconPlus :size="16" /></template>
          New Specification
        </BaseButton>
      </div>
    </div>

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Name</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Material</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Version</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in specs"
            :key="s.id"
            class="tw:border-t tw:border-divider tw:cursor-pointer tw:hover:bg-main-hover"
            @click="openSpec(s.id)"
          >
            <td class="tw:px-4 tw:py-2.5 tw:font-medium tw:text-on-main">
              {{ s.name }}
              <span v-if="s.code" class="tw:text-xs tw:text-secondary tw:font-mono">· {{ s.code }}</span>
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">{{ MATERIAL_LABELS[s.materialKind] || s.materialKind }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">v{{ s.version }}</td>
            <td class="tw:px-4 tw:py-2.5"><SpecificationStatusBadgeById :statusId="s.statusId" /></td>
          </tr>
          <tr v-if="!specs.length">
            <td colspan="4" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">
              No specifications yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <SpecificationCreateDialog v-model="showCreate" @created="(id) => openSpec(id)" />
  </div>
</template>
