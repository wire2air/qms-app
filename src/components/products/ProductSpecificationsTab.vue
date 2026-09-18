<script setup>
/**
 * Specifications linked to an item — shown on the Item detail page. Specs bind
 * to a product OR its Item Group (product family), so this lists both the
 * item-specific specs and the ones that cover the item's group. Rows LINK to the
 * standalone Specification page (/qc-inspection/specifications/:id) — the full
 * editor is no longer embedded here. "New Specification" lets the user create
 * one scoped to this item or its Item Group.
 */
import { IconPlus, IconExternalLink } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  productId: { type: String, required: true },
  productName: { type: String, default: '' },
})

const router = useRouter()
const showCreate = ref(false)

const canManage = computed(() => isAllowed(['inspection_spec:write']))

const product = useLiveQueryWithDeps(
  [() => props.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)

// Item-specific specs + specs covering the item's Item Group (non-superseded).
const specs = useLiveQueryWithDeps(
  [() => props.productId, () => product.value?.productFamilyId],
  async (db, [productId, familyId]) => {
    if (!productId) return []
    const all = await db.Specification.where().exec()
    return all
      .filter((s) => s.statusId !== 'SUPERSEDED')
      .filter((s) => s.productId === productId || (familyId && s.productFamilyId === familyId))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '') || b.version - a.version)
  },
  { models: ['Specification'], initial: [] },
)

const columns = [
  { name: 'name', label: 'NAME', field: 'name', align: 'left' },
  { name: 'scope', label: 'SCOPE', field: 'scope', align: 'left' },
  { name: 'version', label: 'VERSION', field: 'version', align: 'left' },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left' },
  { name: 'open', label: '', field: 'open', align: 'right' },
]

function scopeLabel(row) {
  if (row.productId === props.productId) return 'This item'
  if (row.productFamilyId) return 'Item group'
  return 'Item type'
}

function openSpec(id) {
  router.push(getCompanyPath(`/qc-inspection/specifications/${id}`))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
      <div class="tw:text-sm tw:text-secondary">
        {{ specs.length }} specification(s) linked to this item or its group
      </div>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Specification
      </BaseButton>
    </div>

    <DataTable
      :rows="specs"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      hidePagination
      noDataLabel="No specification linked to this item or its Item Group yet."
    >
      <template #body-cell-name="{ row }">
        <button
          type="button"
          class="tw:font-medium tw:text-on-main tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-left tw:p-0"
          :aria-label="`Open specification ${row.name}`"
          @click="openSpec(row.id)"
        >
          {{ row.name }}
          <span v-if="row.code" class="tw:text-xs tw:text-secondary">· {{ row.code }}</span>
        </button>
      </template>

      <template #body-cell-scope="{ row }">
        <BaseChip size="sm">{{ scopeLabel(row) }}</BaseChip>
      </template>

      <template #body-cell-version="{ row }">
        <span class="tw:text-secondary">v{{ row.version }}</span>
      </template>

      <template #body-cell-status="{ row }">
        <SpecificationStatusBadgeById :statusId="row.statusId" />
      </template>

      <template #body-cell-open="{ row }">
        <button
          type="button"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
          :aria-label="`Open specification ${row.name}`"
          @click="openSpec(row.id)"
        >
          Open <IconExternalLink :size="14" />
        </button>
      </template>
    </DataTable>
  </div>

  <SpecificationCreateDialog
    v-model="showCreate"
    :defaultProductId="productId"
    :defaultProductFamilyId="product?.productFamilyId || null"
    @created="openSpec"
  />
</template>
