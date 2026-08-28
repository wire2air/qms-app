<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import {
  IconForms,
  IconPlus,
  IconTrash,
  IconX,
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

// The cascading filter menu, CAPA-style: each configured field is a dimension
// listing its POSSIBLE VALUES as checkboxes — configured choices for choice
// fields, entity names for lookups, and for free text/number the distinct
// values that actually occur in the register. Date fields get a date submenu.
const menuFilters = ref({})

const filteredRecords = computed(() => {
  let rows = records.value
  if (quickView.value !== 'all') rows = rows.filter((r) => r.statusId === quickView.value)
  if (menuFilters.value.createdAt) {
    rows = rows.filter((r) => matchesDateFilter(r.createdAt, menuFilters.value.createdAt))
  }
  for (const f of configuredFields.value) {
    const selected = menuFilters.value[`pf_${f.name}`]
    if (f.kind === 'date') {
      if (!selected) continue
      rows = rows.filter((r) => {
        const dt = DateTime.fromISO(String(r.payload?.[f.name] ?? ''))
        return dt.isValid && matchesDateFilter(dt, selected)
      })
    } else if (Array.isArray(selected) && selected.length) {
      rows = rows.filter((r) => {
        const raw = r.payload?.[f.name]
        if (Array.isArray(raw)) return raw.some((v) => selected.includes(v))
        return selected.includes(raw)
      })
    }
  }
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

/** Possible values for one field's filter dimension — raw payload values as
 *  option values so matching needs no translation; labels resolved for display. */
function fieldValueOptions(field) {
  if (field.kind === 'boolean') {
    return [
      { value: true, label: 'Yes' },
      { value: false, label: 'No' },
    ]
  }
  if (field.kind === 'enum') return field.options ?? []
  const seen = new Set()
  for (const r of records.value) {
    const raw = r.payload?.[field.name]
    if (raw == null || raw === '') continue
    for (const v of Array.isArray(raw) ? raw : [raw]) seen.add(v)
  }
  if (field.kind === 'lookup') {
    const byId = lookupLabels.value[LOOKUP_ENTITY_BY_VALUE[field.lookupEntity]?.model] ?? {}
    return [...seen]
      .map((id) => ({ value: id, label: byId[id] ?? String(id) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }
  return [...seen]
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    .slice(0, 30)
    .map((v) => ({ value: v, label: String(v) }))
}

// ── Applied-filter tokens (the CAPA/NC pattern): removable chips + Clear all.
const DATE_PRESET_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  this_year: 'This year',
}
function dateTokenLabel(t) {
  if (t?.presetId) return DATE_PRESET_LABELS[t.presetId] ?? 'Custom'
  if (t?.operator === 'between') {
    const s = t.value ? DateTime.fromISO(t.value) : null
    const e = t.value2 ? DateTime.fromISO(t.value2) : null
    if (s && e && s.hasSame(e, 'day')) return s.formatDate('date')
    return `${s?.formatDate('date') ?? '—'} – ${e?.formatDate('date') ?? '—'}`
  }
  return 'Custom'
}
function removeGroup(g) {
  menuFilters.value = { ...menuFilters.value, [g]: null }
}
function removeGroupValue(g, v) {
  menuFilters.value = {
    ...menuFilters.value,
    [g]: (menuFilters.value[g] || []).filter((x) => x !== v),
  }
}
function clearAllFilters() {
  menuFilters.value = {}
}
function fieldValueLabel(f, v) {
  return fieldValueOptions(f).find((o) => o.value === v)?.label ?? String(v)
}
const filterChips = computed(() => {
  const chips = []
  for (const f of configuredFields.value) {
    const g = `pf_${f.name}`
    const sel = menuFilters.value[g]
    if (f.kind === 'date') {
      if (sel) {
        chips.push({
          key: g,
          label: `${f.label}: ${dateTokenLabel(sel)}`,
          remove: () => removeGroup(g),
        })
      }
    } else if (Array.isArray(sel)) {
      for (const v of sel) {
        chips.push({
          key: `${g}:${v}`,
          label: `${f.label}: ${fieldValueLabel(f, v)}`,
          remove: () => removeGroupValue(g, v),
        })
      }
    }
  }
  if (menuFilters.value.createdAt) {
    chips.push({
      key: 'createdAt',
      label: `Created: ${dateTokenLabel(menuFilters.value.createdAt)}`,
      remove: () => removeGroup('createdAt'),
    })
  }
  return chips
})

const KIND_ICONS = { lookup: IconForms, date: IconCalendar }
// Free text and numbers are the search box's job — a distinct-values checkbox
// list for them is noise (user 2026-08-28). Filter dimensions are the fields
// with a bounded value set, plus dates.
const FILTERABLE_KINDS = new Set(['enum', 'boolean', 'lookup', 'date'])
const filterItems = computed(() => [
  ...configuredFields.value
    .filter((f) => FILTERABLE_KINDS.has(f.kind))
    .map((f) => ({
    id: `pf_${f.name}`,
    label: f.label || f.name,
    icon: KIND_ICONS[f.kind] ?? IconForms,
    group: `pf_${f.name}`,
    ...(f.kind === 'date'
      ? { type: 'date' }
      : { options: fieldValueOptions(f), searchable: fieldValueOptions(f).length > 8 }),
    })),
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
])
const columns = computed(() => [
  {
    name: 'recordNumber',
    label: 'NUMBER',
    field: 'recordNumber',
    align: 'left',
    sortable: true,
    exportValue: (row) => row.recordNumber || 'Draft',
  },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  ...configuredFields.value.map((f) => ({
    name: `pf_${f.name}`,
    label: (f.label || f.name).toUpperCase(),
    field: (row) => payloadCellValue(f, row),
    align: 'left',
    sortable: true,
  })),
  {
    name: 'createdAt',
    label: 'CREATED',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    exportValue: (row) => row.createdAt?.formatDate?.('date') ?? '',
  },
  { name: 'actions', label: '', field: 'id', align: 'right', sortable: false },
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

    <!-- Applied-filter token bar — removable chips + Clear all, as on CAPA/NC. -->
    <div v-if="filterChips.length" class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5">
      <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">
        Filters
      </span>
      <span
        v-for="chip in filterChips"
        :key="chip.key"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
      >
        {{ chip.label }}
        <button
          type="button"
          class="tw:rounded tw:p-0.5 tw:hover:text-bad"
          :aria-label="`Remove filter ${chip.label}`"
          @click="chip.remove()"
        >
          <IconX :size="12" />
        </button>
      </span>
      <button
        type="button"
        class="tw:ms-1 tw:text-xs tw:font-medium tw:text-secondary tw:hover:text-primary"
        @click="clearAllFilters"
      >
        Clear all
      </button>
    </div>

    <DataTable
      :rows="filteredRecords"
      :columns="columns"
      rowKey="id"
      searchable
      exportManager
      :exportFilename="`${moduleKey}-records.csv`"
      :persistKey="`m-${moduleKey}`"
    >
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
