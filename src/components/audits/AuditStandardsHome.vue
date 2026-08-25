<script setup>
/**
 * Audit Standards list. Phase B-2: list + Create dialog + click-through
 * to AuditStandardsPageId (detail + requirements editor). Rendered via
 * the shared DataTable — search, advanced filter, density, column
 * manager and export live in the table toolbar.
 */
import { IconPlus, IconUpload, IconSparkles, IconCopy } from '@tabler/icons-vue'
import { isAllowed, canUseAi } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canRead = computed(() => isAllowed(['audit_standards:read']))
const canCreate = computed(() => isAllowed(['audit_standards:create']))

const showCreateDialog = ref(false)
const showImportDialog = ref(false)
const showAiGenerateDialog = ref(false)
// Clone — row action opens the duplicate dialog seeded with that standard.
const showCloneDialog = ref(false)
const cloneTarget = ref(null)
function openClone(row) {
  cloneTarget.value = row
  showCloneDialog.value = true
}

function openDetail(id) {
  router.push(getCompanyPath(`/audits/standards/${id}`))
}

const standards = useLiveQuery(
  async (db) => {
    const results = await db.AuditStandard.where().exec()
    return results.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { models: ['AuditStandard'], initial: [] },
)

const effectiveVersionByStandardId = useLiveQueryWithDeps(
  [() => standards.value.map((s) => s.id).join(',')],
  async (db, [idsCsv]) => {
    if (!idsCsv) return {}
    const ids = idsCsv.split(',').filter(Boolean)
    const map = {}
    for (const id of ids) {
      const versions = await db.AuditStandardVersion.where('auditStandardId', id).exec()
      const effective = versions.find((v) => v.statusId === 'EFFECTIVE')
      const latestDraft = versions.find((v) => v.statusId === 'DRAFT')
      map[id] = { effective: effective ?? null, latestDraft: latestDraft ?? null }
    }
    return map
  },

  { models: ['AuditStandardVersion'], initial: {} },
)

function versionLabel(versions) {
  if (!versions) return '—'
  if (versions.effective) {
    return `v${versions.effective.versionMajor}.${versions.effective.versionMinor} EFFECTIVE`
  }
  if (versions.latestDraft) {
    return `v${versions.latestDraft.versionMajor}.${versions.latestDraft.versionMinor} DRAFT`
  }
  return 'No versions'
}

function versionBadgeClass(versions) {
  if (versions?.effective) return 'tw:bg-emerald-100 tw:text-emerald-700'
  if (versions?.latestDraft) return 'tw:bg-gray-100 tw:text-gray-700'
  return 'tw:bg-red-100 tw:text-red-700'
}

const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  { name: 'code', label: 'Code', field: 'code', align: 'left', sortable: true },
  { name: 'type', label: 'Type', field: 'auditStandardTypeId', align: 'left' },
  { name: 'license', label: 'License', field: 'contentLicense', align: 'left' },
  { name: 'version', label: 'Version', field: 'version', align: 'left', filterType: false },
  {
    name: 'createdAt',
    label: 'Created',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  { name: 'actions', label: '', field: 'actions', align: 'right', filterType: false },
]
</script>

<template>
  <div v-if="!canRead" class="tw:py-12 tw:text-center tw:text-secondary">
    You don't have permission to view the audit standards library.
  </div>
  <DataTable
    v-else
    :rows="standards"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    exportManager
    exportFilename="audit-standards.csv"
    persistKey="audits:standards"
    noDataLabel="No audit standards yet. New tenants are seeded with an empty 'Internal Quality Audit' shell."
  >
    <template #toolbar-left>
      <span class="tw:text-sm tw:text-secondary">
        {{ standards.length }} standard{{ standards.length === 1 ? '' : 's' }}
      </span>
      <BaseButton
        v-if="canCreate && canUseAi"
        variant="outline"
        size="sm"
        @click="showAiGenerateDialog = true"
      >
        <template #icon><IconSparkles :size="16" /></template>
        AI Generate
      </BaseButton>
      <BaseButton v-if="canCreate" variant="outline" size="sm" @click="showImportDialog = true">
        <template #icon><IconUpload :size="16" /></template>
        Import (CSV)
      </BaseButton>
      <BaseButton v-if="canCreate" variant="primary" size="sm" @click="showCreateDialog = true">
        <template #icon><IconPlus :size="16" /></template>
        New Standard
      </BaseButton>
    </template>

    <template #body-cell-name="{ row }">
      <RouterLink
        :to="getCompanyPath(`/audits/standards/${row.id}`)"
        class="tw:font-medium tw:text-on-main tw:hover:text-primary"
      >
        {{ row.name }}
      </RouterLink>
      <BaseBadge v-if="row.statusId === 'ARCHIVED'" class="tw:ml-2 tw:bg-gray-200 tw:text-gray-600">
        Archived
      </BaseBadge>
      <div
        v-if="row.description"
        class="tw:text-xs tw:text-secondary tw:font-normal tw:mt-0.5 tw:truncate tw:max-w-md"
      >
        {{ row.description }}
      </div>
    </template>

    <template #body-cell-code="{ row }">
      <code class="tw:text-xs tw:bg-main-hover tw:text-secondary tw:rounded tw:px-2 tw:py-0.5">
        {{ row.code }}
      </code>
    </template>

    <template #body-cell-type="{ row }">
      <AuditStandardTypeBadgeById
        v-if="row.auditStandardTypeId"
        :standardTypeId="row.auditStandardTypeId"
      />
      <span v-else class="tw:text-xs tw:text-secondary">—</span>
    </template>

    <template #body-cell-license="{ row }">
      <AuditStandardContentLicenseBadgeById :licenseId="row.contentLicense" />
    </template>

    <template #body-cell-version="{ row }">
      <span
        class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
        :class="versionBadgeClass(effectiveVersionByStandardId[row.id])"
      >
        {{ versionLabel(effectiveVersionByStandardId[row.id]) }}
      </span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-xs tw:text-secondary">{{
        row.createdAt ? row.createdAt.formatDate('date') : '—'
      }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <button
        v-if="canCreate"
        type="button"
        class="tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:rounded tw:p-1.5 tw:cursor-pointer tw:bg-transparent tw:border-0"
        title="Duplicate this standard"
        @click.stop="openClone(row)"
      >
        <IconCopy :size="16" />
      </button>
    </template>
  </DataTable>

  <AuditStandardCreateDialog v-model="showCreateDialog" />
  <!-- 'Duplicate & open' navigates from inside the dialog; plain 'Duplicate'
       stays here and the new row syncs into the list automatically. -->
  <AuditStandardCloneDialog v-model="showCloneDialog" :standard="cloneTarget" />
  <AuditStandardImportDialog
    v-model="showImportDialog"
    @created="(s) => s?.id && openDetail(s.id)"
  />
  <AuditStandardAiGenerateDialog
    v-model="showAiGenerateDialog"
    @created="(s) => s?.id && openDetail(s.id)"
  />
</template>
