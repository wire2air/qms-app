<script setup>
/**
 * Evaluations tab on the admin Supplier detail page — the supplier's
 * qualification history. Every module record linked to this supplier (via
 * records.supplier_id) is listed newest-first, with its status, sealed rating,
 * and next-review date. Re-qualification = a new record each cycle; all copies
 * are retained here.
 *
 * "New Qualification" launches the generic module create flow with this
 * supplier in context (create?supplierId=…). Modules opt in by setting
 * moduleConfig.linkedEntity = 'supplier' on their Scoring page.
 */
import { IconChartBar, IconPlus } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  supplier: { type: Object, required: true },
})
const router = useRouter()

const records = useLiveQueryWithDeps(
  [() => props.supplier?.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.Record.where('supplierId', id).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['Record'], initial: [] },
)

const modules = useLiveQuery(
  async (db) => (await db.FormTemplate.where().exec()).filter((t) => t.isModule),
  { models: ['FormTemplate'], initial: [] },
)
const moduleByKey = computed(() => {
  const map = {}
  for (const t of modules.value) {
    map[t.internalName] = t.moduleConfig?.displayName || t.title || t.internalName
  }
  return map
})
// Modules that qualify a supplier — the ones offered by "New Qualification".
const supplierModules = computed(() =>
  modules.value.filter((t) => t.moduleConfig?.linkedEntity === 'supplier'),
)

const rows = computed(() =>
  records.value.map((r) => ({
    id: r.id,
    moduleKey: r.moduleKey,
    moduleName: moduleByKey.value[r.moduleKey] || r.moduleKey,
    recordNumber: r.recordNumber,
    statusId: r.statusId,
    rating: r.scoringResult?.ratingLabel || null,
    ratingColor: r.scoringResult?.ratingColor || null,
    total: r.scoringResult?.total ?? null,
    createdAt: r.createdAt,
    nextReviewDate: r.nextReviewDate,
  })),
)

const columns = [
  { name: 'recordNumber', label: 'RECORD', field: 'recordNumber', align: 'left' },
  { name: 'moduleName', label: 'MODULE', field: 'moduleName', align: 'left' },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left' },
  { name: 'rating', label: 'RATING', field: 'rating', align: 'left' },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left' },
  { name: 'nextReviewDate', label: 'NEXT REVIEW', field: 'nextReviewDate', align: 'left' },
]

const showPicker = ref(false)
const pickedModuleKey = ref(null)

function startQualification() {
  if (supplierModules.value.length === 1) {
    return goToCreate(supplierModules.value[0].internalName)
  }
  pickedModuleKey.value = supplierModules.value[0]?.internalName || null
  showPicker.value = true
}
function goToCreate(moduleKey) {
  showPicker.value = false
  router.push({
    path: getCompanyPath(`/m/${moduleKey}/create`),
    query: { supplierId: props.supplier.id },
  })
}
function openRecord(row) {
  router.push(getCompanyPath(`/m/${row.moduleKey}/${row.id}`))
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-4"
    >
      <BaseSectionHeader
        title="Evaluations"
        :icon="IconChartBar"
        iconVariant="boxed"
        iconColor="gray"
        :iconSize="20"
        :level="3"
        size="section-title"
      />
      <BaseButton
        v-if="supplierModules.length"
        variant="primary"
        size="sm"
        @click="startQualification"
      >
        <template #icon><IconPlus :size="16" /></template>
        New Qualification
      </BaseButton>
    </div>

    <div class="tw:p-4">
      <BaseEmptyState
        v-if="!rows.length"
        :icon="IconChartBar"
        title="No evaluations yet for this supplier."
      />
      <DataTable
        v-else
        :rows="rows"
        :columns="columns"
        rowKey="id"
        :mobileCards="false"
        hidePagination
        @rowClick="openRecord"
      >
        <template #body-cell-statusId="{ row }">
          <RecordStatusBadgeById :statusId="row.statusId" />
        </template>
        <template #body-cell-rating="{ row }">
          <span
            v-if="row.rating"
            class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-white"
            :style="{ backgroundColor: row.ratingColor || '#6b7280' }"
          >
            {{ row.rating }}<span v-if="row.total != null"> · {{ row.total }}</span>
          </span>
          <span v-else class="tw:text-xs tw:text-secondary">—</span>
        </template>
        <template #body-cell-createdAt="{ row }">
          <span class="tw:text-sm">{{ row.createdAt ? row.createdAt.formatDate() : '—' }}</span>
        </template>
        <template #body-cell-nextReviewDate="{ row }">
          <span class="tw:text-sm">{{ row.nextReviewDate || '—' }}</span>
        </template>
      </DataTable>
    </div>

    <BaseDialog v-model="showPicker" title="New Qualification" maxWidth="sm">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-secondary">Choose the qualification form to start.</p>
        <BaseSelect
          v-model="pickedModuleKey"
          :options="supplierModules.map((m) => ({ id: m.internalName, name: moduleByKey[m.internalName] }))"
          optionLabel="name"
          optionValue="id"
          :required="true"
        />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="!pickedModuleKey" @click="goToCreate(pickedModuleKey)">
          Start
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
