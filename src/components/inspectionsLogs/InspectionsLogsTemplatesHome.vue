<script setup>
import { IconStack2, IconPlus, IconShieldCheck, IconClock, IconSearch } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

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
 */
const router = useRouter()

const canCreate = computed(() => isAllowed(['formTemplates:create']))

const showCreateDialog = ref(false)
const pendingClassification = ref('OPERATIONAL_LOG')

const search = ref('')
const classificationFilter = ref('all') // 'all' | 'OPERATIONAL_LOG' | 'CONTROLLED_RECORD'
const typeFilter = ref('all') // 'all' | <logBookTypeId>

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
  [() => search.value, () => classificationFilter.value, () => typeFilter.value],
  async (db, [q, cls, type]) => {
    let rows = await db.LogBook.where().exec()
    if (cls !== 'all') rows = rows.filter((t) => t.recordClassification === cls)
    if (type !== 'all') rows = rows.filter((t) => t.logBookTypeId === type)
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

function openTemplate(id) {
  router.push(getCompanyPath(`/inspections-logs/log-books/${id}`))
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
</script>

<template>
  <BasePage width="standard" density="compact">
    <PageHeader :icon="IconStack2" title="Log Books" :iconSize="22" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreate" variant="primary" @click="openCreate('OPERATIONAL_LOG')">
        <IconPlus :size="16" />
        New Log Book
      </BaseButton>
    </SafeTeleport>

    <!-- Page header -->
    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Log Books</div>
      <div class="tw:text-sm tw:text-secondary">
        Each log book defines the structure for a class of log entries (daily temperature, gemba
        round, batch release). Operational log books auto-lock entries after a short edit window;
        controlled-record log books require an e-signature and reviewer approval.
      </div>
    </div>

    <!-- Quick-create cards (only when there are no templates yet, to nudge first-time users) -->
    <div
      v-if="canCreate && templates.length === 0"
      class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3"
    >
      <button
        type="button"
        class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
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
        class="tw:text-left tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-5 tw:hover:border-primary tw:hover:bg-main-hover tw:transition"
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

    <!-- Filters -->
    <div
      v-if="templates.length > 0 || classificationFilter !== 'all' || search"
      class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap"
    >
      <div class="tw:relative tw:flex-1 tw:max-w-md">
        <IconSearch
          :size="16"
          class="tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
        />
        <BaseTextInput v-model="search" placeholder="Search by title or code…" class="tw:pl-8" />
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Type</span>
        <select
          v-model="classificationFilter"
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
          v-model="typeFilter"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm tw:max-w-xs"
        >
          <option value="all">All categories</option>
          <option v-for="t in logBookTypes" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
    </div>

    <!-- Empty state when filters yield nothing -->
    <div
      v-if="templates.length === 0 && (search || classificationFilter !== 'all')"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-10 tw:text-secondary"
    >
      <IconStack2 :size="36" class="tw:opacity-60" />
      <div class="tw:text-sm">No log books match your filters.</div>
    </div>

    <!-- Log books list -->
    <div
      v-else-if="templates.length > 0"
      class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden"
    >
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main">
          <tr class="tw:text-left">
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Log Book</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Category</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Type</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Supervisor</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Edit window</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">E-sig</th>
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="t in templates"
            :key="t.id"
            tag="tr"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
            :aria-label="`Open log book ${t.title}`"
            @click="openTemplate(t.id)"
          >
            <td class="tw:px-3 tw:py-2">
              <div class="tw:font-medium tw:text-on-main">{{ t.title }}</div>
              <div class="tw:text-xs tw:text-secondary tw:font-mono tw:uppercase">{{ t.code }}</div>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-xs tw:text-on-main">
              <span
                v-if="t.logBookTypeId"
                class="tw:inline-block tw:bg-main tw:border tw:border-divider tw:rounded tw:px-2 tw:py-0.5"
              >
                {{ typeName(t.logBookTypeId) }}
              </span>
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:border"
                :class="classificationBadgeClass(t.recordClassification)"
              >
                <IconShieldCheck v-if="t.recordClassification === 'CONTROLLED_RECORD'" :size="10" />
                {{ t.recordClassification?.replace('_', ' ') }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-xs">
              <UserBadgeById v-if="t.supervisorUserId" :userId="t.supervisorUserId" />
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-secondary tw:text-xs">{{ editWindowSummary(t) }}</td>
            <td class="tw:px-3 tw:py-2 tw:text-xs">
              <span
                v-if="t.signatureRequired"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-amber-700"
              >
                <IconShieldCheck :size="12" />
                Required
              </span>
              <span v-else class="tw:text-secondary">—</span>
            </td>
          </BaseClickableRow>
        </tbody>
      </table>
    </div>

    <!-- Purpose-built log-book wizard. Backend payload identical to
         the generic form-template create, but the UX speaks the I&L
         vocabulary and skips fields that don't apply (Document Type,
         Training Configuration, preset gallery). -->
    <CreateLogBookDialog
      v-model="showCreateDialog"
      :initialClassification="pendingClassification"
      @created="onTemplateCreated"
    />
  </BasePage>
</template>
