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
  IconTargetArrow,
} from '@tabler/icons-vue'
import { isAllowed, isAllowedOnRecord } from '@/utils/currentSession.js'
import { matchesDateFilter } from '@/utils/dateRanges.js'
import {
  useEffectivenessIndex,
  matchesEffectivenessFilter,
  isEffectivenessOverdue,
  EFFECTIVENESS_FILTER_OPTIONS,
  EFFECTIVENESS_STATE_LABELS,
} from '@/composables/useEffectivenessRollup.js'

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

// Effectiveness (three buckets) + created date, in the toolbar's filter menu.
const effectivenessIndex = useEffectivenessIndex(() => props.moduleKey)
const menuFilters = ref({ effectiveness: [], createdAt: null })
const filterItems = [
  {
    id: 'effectiveness',
    label: 'Effectiveness',
    icon: IconTargetArrow,
    group: 'effectiveness',
    options: EFFECTIVENESS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  },
  { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
]

const filteredRecords = computed(() => {
  let rows = records.value
  if (quickView.value !== 'all') rows = rows.filter((r) => r.statusId === quickView.value)
  const { effectiveness, createdAt } = menuFilters.value
  if (effectiveness?.length) {
    rows = rows.filter((r) =>
      matchesEffectivenessFilter(effectivenessIndex.value.get(r.id), effectiveness),
    )
  }
  if (createdAt) rows = rows.filter((r) => matchesDateFilter(r.createdAt, createdAt))
  return rows
})
function effectivenessCell(row) {
  const wi = effectivenessIndex.value.get(row.id)
  const state = wi?.effectivenessState ?? 'NONE'
  if (state === 'NONE') return { label: '—', due: null, overdue: false }
  return {
    label: EFFECTIVENESS_STATE_LABELS[state] ?? state,
    due: wi.effectivenessDueAt,
    overdue: isEffectivenessOverdue(wi),
  }
}

const columns = [
  { name: 'recordNumber', label: 'NUMBER', field: 'recordNumber', align: 'left', sortable: true },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'effectiveness', label: 'EFFECTIVENESS', field: 'id', align: 'left', sortable: false },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'id', align: 'right', sortable: false },
]

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

    <DataTable :rows="filteredRecords" :columns="columns" rowKey="id" searchable>
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
      <template #body-cell-effectiveness="{ row }">
        <span
          v-if="effectivenessCell(row).label !== '—'"
          class="tw:text-sm"
          :class="effectivenessCell(row).overdue ? 'tw:text-red-700 tw:font-medium' : 'tw:text-on-main'"
        >
          {{ effectivenessCell(row).label
          }}<template v-if="effectivenessCell(row).due">
            · {{ effectivenessCell(row).due.formatDate('date') }}</template
          >
        </span>
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
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
