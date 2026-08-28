<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import {
  IconForms,
  IconPlus,
  IconTrash,
  IconFileText,
  IconAlertCircle,
  IconCircleCheck,
  IconCalendar,
} from '@tabler/icons-vue'
import { isAllowed, isAllowedOnRecord } from '@/utils/currentSession.js'
import { matchesDateFilter } from '@/utils/dateRanges.js'
import { selectedListFields } from '@/utils/moduleListColumns.js'
import { LOOKUP_ENTITY_BY_VALUE } from '@/constants/formBuilderConfig.js'
import { DateTime } from 'luxon'

const props = defineProps({ moduleKey: { type: String, required: true } })
const router = useRouter()

const template = useLiveQueryWithDeps(
  [() => props.moduleKey],
  async (db, [key]) => {
    if (!key) return null
    const list = await db.FormTemplate.where('internalName', key).exec()
    return list.find((t) => t.isModule) || null
  },
  { models: ['FormTemplate'] },
)

const records = useLiveQueryWithDeps(
  [() => props.moduleKey],
  async (db, [key]) => {
    if (!key) return []
    const rows = await db.Record.where('moduleKey', key).exec()
    return rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  },
  { initial: [], models: ['Record'] },
)

const title = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Module',
)

// ─── List header parity with the CAPA register (user 2026-08-28) ───────────
// KPI strip, quick-view pills, and a compact filter menu (effectiveness +
// created date) — the same primitives CapasHome/CapasTable use.
const kpiItems = computed(() => {
  const all = records.value
  const count = (statusId) => all.filter((r) => r.statusId === statusId).length
  return [
    { key: 'draft', label: 'Draft', value: count('DRAFT'), icon: IconFileText, color: 'secondary' },
    { key: 'open', label: 'Open', value: count('OPEN'), icon: IconAlertCircle, color: 'blue' },
    { key: 'closed', label: 'Closed', value: count('CLOSED'), icon: IconCircleCheck, color: 'green' },
  ]
})

const QUICK_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
]
const quickView = ref('all')

// Created date, in the toolbar's filter menu (field-level filters live on the
// columns themselves — see `filterable` on the table).
const menuFilters = ref({ createdAt: null })
const filterItems = [
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
]

const filteredRecords = computed(() => {
  let rows = records.value
  if (quickView.value !== 'all') rows = rows.filter((r) => r.statusId === quickView.value)
  const { createdAt } = menuFilters.value
  if (createdAt) rows = rows.filter((r) => matchesDateFilter(r.createdAt, createdAt))
  return rows
})

// ─── Configured payload columns (moduleConfig.listColumns, 2026-08-28) ──────
// The module author picks which form fields the register shows; each pick
// becomes a real DataTable column whose value reads off record.payload and
// whose filterType follows the field kind — CAPA/NC-style column filtering.
const configuredFields = computed(() =>
  selectedListFields(template.value?.schema || [], template.value?.moduleConfig?.listColumns),
)

// UUID → display label per lookup entity used by the configured columns, so
// lookup cells (and their filters/search/export) operate on names, not ids.
const lookupModels = computed(() => [
  ...new Set(
    configuredFields.value
      .filter((f) => f.kind === 'lookup' && f.lookupEntity)
      .map((f) => LOOKUP_ENTITY_BY_VALUE[f.lookupEntity].model),
  ),
])
const lookupLabels = useLiveQueryWithDeps(
  [() => lookupModels.value.join(',')],
  async (db, [modelsStr]) => {
    if (!modelsStr) return {}
    const out = {}
    await Promise.all(
      modelsStr.split(',').map(async (model) => {
        const rows = await db[model].where().exec()
        out[model] = Object.fromEntries(
          rows.map((r) => [r.id, [r.firstName, r.lastName].filter(Boolean).join(' ') || r.name]),
        )
      }),
    )
    return out
  },
  { initial: {} },
)

function payloadCellValue(field, row) {
  const raw = row.payload?.[field.name]
  if (raw == null || raw === '') return ''
  if (field.kind === 'lookup') {
    const model = LOOKUP_ENTITY_BY_VALUE[field.lookupEntity]?.model
    return lookupLabels.value[model]?.[raw] ?? ''
  }
  if (field.kind === 'boolean') return raw ? 'Yes' : 'No'
  if (field.kind === 'enum') {
    const label = (v) => field.options?.find((o) => o.value === v)?.label ?? String(v)
    return Array.isArray(raw) ? raw.map(label).join(', ') : label(raw)
  }
  if (field.kind === 'date') {
    const dt = DateTime.fromISO(String(raw))
    return dt.isValid ? dt.formatDate('date') : String(raw)
  }
  return raw
}

const FILTER_TYPE_BY_KIND = {
  string: 'text',
  number: 'number',
  date: 'date',
  enum: 'select',
  boolean: 'select',
  lookup: 'select',
}

function columnFilterCfg(field) {
  const filterType = FILTER_TYPE_BY_KIND[field.kind] ?? 'text'
  if (filterType !== 'select') return { filterType }
  // Select filters compare the CELL value, which is already the display form.
  if (field.kind === 'boolean') {
    return { filterType, filterOptions: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }] }
  }
  if (field.kind === 'enum') {
    return {
      filterType,
      filterOptions: (field.options ?? []).map((o) => ({ value: o.label, label: o.label })),
    }
  }
  const model = LOOKUP_ENTITY_BY_VALUE[field.lookupEntity]?.model
  const labels = Object.values(lookupLabels.value[model] ?? {})
  return { filterType, filterOptions: labels.map((l) => ({ value: l, label: l })) }
}
const columns = computed(() => [
  {
    name: 'recordNumber',
    label: 'NUMBER',
    field: 'recordNumber',
    align: 'left',
    sortable: true,
    filterType: 'text',
  },
  {
    name: 'statusId',
    label: 'STATUS',
    field: 'statusId',
    align: 'left',
    sortable: false,
    filterType: 'select',
    filterOptions: QUICK_PILLS.filter((p) => p.value !== 'all').concat([
      { value: 'CANCELLED', label: 'Cancelled' },
    ]),
  },
  ...configuredFields.value.map((f) => ({
    name: `pf_${f.name}`,
    label: (f.label || f.name).toUpperCase(),
    field: (row) => payloadCellValue(f, row),
    align: 'left',
    sortable: true,
    ...columnFilterCfg(f),
  })),
  {
    name: 'createdAt',
    label: 'CREATED',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  { name: 'actions', label: '', field: 'id', align: 'right', sortable: false, filterType: false },
])

// The matrix decides (module verbs are seeded at promotion, managed in the
// permissions UI). Suppliers and unverbed internal users see the list they can
// read, without the create affordance — the server enforces the same predicate.
const canCreate = computed(() => isAllowed([`${props.moduleKey}:create`]))

function create() {
  router.push(getCompanyPath(`/m/${props.moduleKey}/create`))
}

// ─── Delete draft (list-level; DRAFT-only) ──────────────────────────────────
// Drafts have no record number and no workflow — deleting one leaves no gap in
// the register. Anything past Draft is controlled: Cancel (on the detail page,
// reason + PIN) is the only way out.
function canDeleteRow(row) {
  return row.statusId === 'DRAFT' && isAllowedOnRecord(`${props.moduleKey}:update`, row)
}

const deleteTarget = ref(null)
const deleting = ref(false)
const deleteError = ref('')

function askDelete(row) {
  deleteError.value = ''
  deleteTarget.value = row
}

async function handleDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteTarget.value.delete()
    deleteTarget.value = null
  } catch (e) {
    deleteError.value = e?.message || 'Failed to delete draft'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconForms" :title="title">
      <template #actions>
        <BaseButton v-if="canCreate" variant="primary" size="sm" @click="create">
          <template #icon><IconPlus :size="16" /></template>
          New {{ title }}
        </BaseButton>
      </template>
    </PageHeader>

    <BaseStatStrip :items="kpiItems" />

    <DataTable :rows="filteredRecords" :columns="columns" rowKey="id" searchable filterable>
      <template #tabs>
        <BaseQuickFilterPills v-model="quickView" :pills="QUICK_PILLS" ariaLabel="Quick views" />
      </template>
      <template #toolbar-filters>
        <BaseFilterMenu v-model="menuFilters" :items="filterItems" iconOnly />
      </template>
      <template #body-cell-recordNumber="{ row }">
        <RouterLink
          :to="getCompanyPath(`/m/${moduleKey}/${row.id}`)"
          class="tw:text-primary tw:font-medium tw:hover:underline"
        >
          {{ row.recordNumber || 'Draft' }}
        </RouterLink>
      </template>
      <template #body-cell-actions="{ row }">
        <div class="tw:flex tw:items-center tw:justify-end">
          <BaseTooltip v-if="canDeleteRow(row)" content="Delete draft">
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary tw:hover:text-bad"
              :aria-label="`Delete draft ${row.recordNumber || ''}`"
              @click.stop="askDelete(row)"
            >
              <IconTrash :size="16" />
            </button>
          </BaseTooltip>
        </div>
      </template>
      <template #body-cell-statusId="{ row }">
        <RecordStatusBadgeById :statusId="row.statusId" />
      </template>
      <template #body-cell-createdAt="{ row }">
        {{ row.createdAt?.formatDate?.() ?? '—' }}
      </template>
    </DataTable>

    <BaseDialog
      :modelValue="!!deleteTarget"
      title="Delete Draft"
      maxWidth="md"
      @update:modelValue="(v) => !v && (deleteTarget = null)"
    >
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Delete this draft? Drafts have no record number yet, so nothing is lost from the register.
      </p>
      <div
        v-if="deleteError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm tw:mb-3"
      >
        {{ deleteError }}
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="deleteTarget = null">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDelete">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </BaseButton>
      </div>
    </BaseDialog>
  </BasePage>
</template>
