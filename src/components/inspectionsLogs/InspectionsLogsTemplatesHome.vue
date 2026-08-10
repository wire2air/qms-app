<script setup>
import { IconStack2, IconPlus, IconShieldCheck, IconClock } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

// Embedded = hosted as the "Log Books" tab of the Inspections & Logs
// workspace (the host owns the page header).
defineProps({ embedded: { type: Boolean, default: false } })

/**
 * Inspections & Logs — Log Books list.
 *
 * A "log book" is a form template classified as OPERATIONAL_LOG or
 * CONTROLLED_RECORD. This page wraps the generic form-templates list
 * filtered to those two classifications. The "+ New Log Book" button
 * opens the shared create-template wizard with `defaultClassification`
 * pre-set so the resulting template gets the matching
 * editWindow / signature / review defaults baked into its config.
 *
 * Falls back to the existing /templates/:id detail page for editing —
 * no duplicate UI for schema / classification editing here.
 *
 * Built on the Enterprise Page Framework list template: `useListLayout`
 * (filter state + URL sync + resolved content state) + `BaseListLayout`
 * (header / filters / state region).
 */
const router = useRouter()

const canCreate = computed(() => isAllowed(['forms_templates:create']))

const showCreateDialog = ref(false)
const pendingClassification = ref('OPERATIONAL_LOG')

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `templates`.
const list = useListLayout({
  filters: { search: '', classification: 'all', type: 'all', status: 'all' },
  total: () => templates.value.length,
  empty: () => templates.value.length === 0,
  syncUrl: true,
})

// Catalog for the type chip + filter dropdown. Globals + tenant
// additions; the SyncEngine SELECT policy includes both.
const logBookTypes = useLiveQuery(
  async (db) => {
    const rows = await db.LogBookType.where().exec()
    return rows.sort((a, b) => (a.sequence ?? 100) - (b.sequence ?? 100))
  },

  { models: ['LogBookType'], initial: [] },
)
const typeById = computed(() => new Map(logBookTypes.value.map((t) => [t.id, t])))
function typeName(id) {
  return typeById.value.get(id)?.name ?? '—'
}

// Round 0 refactor (2026-05-26) — log books are a first-class entity
// now. No more filtering form_templates by config.recordClassification;
// db.LogBook only ever contains OPERATIONAL_LOG / CONTROLLED_RECORD
// rows by construction.
const templates = useLiveQueryWithDeps(
  [
    () => list.filters.value.search,
    () => list.filters.value.classification,
    () => list.filters.value.type,
    () => list.filters.value.status,
  ],
  async (db, [q, cls, type, status]) => {
    // Visibility is RLS-scoped (site permissions + involvement) — the list
    // shows whatever synced. Editing is owner-gated on the detail page.
    let rows = await db.LogBook.where().exec()
    if (cls !== 'all') rows = rows.filter((t) => t.recordClassification === cls)
    if (type !== 'all') rows = rows.filter((t) => t.logBookTypeId === type)
    if (status !== 'all') rows = rows.filter((t) => (t.statusId ?? 'DRAFT') === status)
    if (q) {
      const needle = q.toLowerCase()
      rows = rows.filter(
        (t) => t.title?.toLowerCase().includes(needle) || t.code?.toLowerCase().includes(needle),
      )
    }
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['LogBook'], initial: [] },
)

function openCreate(cls) {
  pendingClassification.value = cls
  showCreateDialog.value = true
}

function onTemplateCreated(logBook) {
  // Drop the admin straight into the schema-builder tab of the new
  // log book so they can start defining fields without an extra click.
  if (logBook?.id) {
    router.push({
      path: getCompanyPath(`/inspections-logs/log-books/${logBook.id}`),
      query: { tab: 'schema' },
    })
  }
}

function classificationBadgeClass(cls) {
  if (cls === 'CONTROLLED_RECORD') return 'tw:bg-red-50 tw:text-red-700 tw:border-red-200'
  if (cls === 'OPERATIONAL_LOG') return 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200'
  return 'tw:bg-gray-50 tw:text-gray-600 tw:border-gray-200'
}

function editWindowSummary(t) {
  // Round 0: edit-window settings live on row columns now, not config JSON.
  const mode = t.editWindowMode
  if (!mode || mode === 'NONE') return 'No edits after submit'
  if (mode === 'TIME_WINDOW') {
    const m = t.editWindowMinutes ?? 15
    return `Edits allowed for ${m} min`
  }
  if (mode === 'UNTIL_NEXT_ENTRY') return 'Edits until next entry'
  if (mode === 'UNTIL_REVIEW') return 'Edits until reviewed'
  return mode
}

const columns = [
  { name: 'title', label: 'Log Book', field: 'title', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'statusId', align: 'left', sortable: true },
  { name: 'category', label: 'Category', field: 'logBookTypeId', align: 'left' },
  { name: 'type', label: 'Type', field: 'recordClassification', align: 'left', sortable: true },
  { name: 'supervisor', label: 'Supervisor', field: 'supervisorUserId', align: 'left' },
  { name: 'editWindow', label: 'Edit window', field: 'editWindowMode', align: 'left' },
  { name: 'esig', label: 'E-sig', field: 'signatureRequired', align: 'left' },
]
</script>

<template>
  <BaseListLayout
    title="Log Books"
    :icon="IconStack2"
    :embedded="embedded"
    subtitle="Each log book defines the structure for a class of log entries (daily temperature, gemba round, batch release). Operational log books auto-lock entries after a short edit window; controlled-record log books require an e-signature and reviewer approval."
    :state="list.state.value"
    :emptyIcon="IconStack2"
    :emptyTitle="
      list.hasActiveFilters.value ? 'No log books match your filters' : 'No log books yet'
    "
  >
    <template #actions>
      <BaseButton v-if="canCreate" variant="primary" @click="openCreate('OPERATIONAL_LOG')">
        <IconPlus :size="16" />
        New Log Book
      </BaseButton>
    </template>

    <template #filters>
      <BaseFilterBar
        v-model:search="list.filters.value.search"
        searchPlaceholder="Search by title or code…"
        @clear="list.reset()"
      >
        <template #filters>
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary">Type</span>
            <select
              v-model="list.filters.value.classification"
              class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
            >
              <option value="all">All</option>
              <option value="OPERATIONAL_LOG">Operational</option>
              <option value="CONTROLLED_RECORD">Controlled</option>
            </select>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary">Category</span>
            <select
              v-model="list.filters.value.type"
              class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm tw:max-w-xs"
            >
              <option value="all">All categories</option>
              <option v-for="t in logBookTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary">Status</span>
            <select
              v-model="list.filters.value.status"
              class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
            >
              <option value="all">All</option>
              <option value="DRAFT">Draft</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="REJECTED">Rejected</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="OBSOLETE">Obsolete</option>
            </select>
          </div>
        </template>
      </BaseFilterBar>
    </template>

    <!-- Quick-create cards as the empty action when there are no log books yet
         (no active filters) — nudges first-time users to pick a classification. -->
    <template #empty-action>
      <div
        v-if="canCreate && !list.hasActiveFilters.value"
        class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3"
      >
        <button
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:px-5 tw:py-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="openCreate('OPERATIONAL_LOG')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-2">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-amber-50 tw:text-amber-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconClock :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Operational Log Book</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            For routine field entries (temperature checks, gemba rounds, daily walk-throughs). Log
            entries auto-lock 15 minutes after submission — no reviewer required. Fast to fill.
          </div>
        </button>
        <button
          type="button"
          class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:px-5 tw:py-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
          @click="openCreate('CONTROLLED_RECORD')"
        >
          <div class="tw:flex tw:items-center tw:gap-3 tw:mb-2">
            <div
              class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-red-50 tw:text-red-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconShieldCheck :size="22" />
            </div>
            <div class="tw:font-semibold tw:text-on-main">Controlled Log Book</div>
          </div>
          <div class="tw:text-sm tw:text-secondary">
            For regulated records (batch release, deviations, calibrations). Each entry requires an
            e-signature on submit and a second-person review before locking.
          </div>
        </button>
      </div>
    </template>

    <!-- Log books list -->
    <DataTable
      :rows="templates"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      hidePagination
      densitySelector
      columnManager
      exportManager
      exportFilename="log-books.csv"
      persistKey="inspectionsLogs:logBooks"
      noDataLabel="No log books yet."
    >
      <template #body-cell-title="{ row }">
        <RouterLink
          :to="getCompanyPath(`/inspections-logs/log-books/${row.id}`)"
          class="tw:font-medium tw:text-on-main tw:hover:text-primary"
        >
          {{ row.title }}
          <span class="tw:block tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider">
            {{ row.code }} · V{{ row.generation ?? 1 }}
          </span>
        </RouterLink>
      </template>

      <template #body-cell-status="{ row }">
        <LogBookStatusBadge :statusId="row.statusId" />
      </template>

      <template #body-cell-category="{ row }">
        <span
          v-if="row.logBookTypeId"
          class="tw:inline-block tw:bg-main tw:border tw:border-divider tw:rounded tw:px-2 tw:py-0.5 tw:text-xs"
        >
          {{ typeName(row.logBookTypeId) }}
        </span>
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-type="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:border"
          :class="classificationBadgeClass(row.recordClassification)"
        >
          <IconShieldCheck v-if="row.recordClassification === 'CONTROLLED_RECORD'" :size="10" />
          {{ row.recordClassification?.replace('_', ' ') }}
        </span>
      </template>

      <template #body-cell-supervisor="{ row }">
        <UserBadgeById v-if="row.supervisorUserId" :userId="row.supervisorUserId" />
        <span v-else class="tw:text-secondary">—</span>
      </template>

      <template #body-cell-editWindow="{ row }">
        <span class="tw:text-secondary tw:text-xs">{{ editWindowSummary(row) }}</span>
      </template>

      <template #body-cell-esig="{ row }">
        <span
          v-if="row.signatureRequired"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-amber-700"
        >
          <IconShieldCheck :size="12" />
          Required
        </span>
        <span v-else class="tw:text-secondary">—</span>
      </template>
    </DataTable>

    <!-- Purpose-built log-book wizard. Backend payload identical to
         the generic form-template create, but the UX speaks the I&L
         vocabulary and skips fields that don't apply (Document Type,
         Training Configuration, preset gallery). -->
  </BaseListLayout>

  <!-- Outside BaseListLayout so it stays mounted in the empty state (else you
       can't create the first template). -->
  <CreateLogBookDialog
    v-model="showCreateDialog"
    :initialClassification="pendingClassification"
    @created="onTemplateCreated"
  />
</template>
