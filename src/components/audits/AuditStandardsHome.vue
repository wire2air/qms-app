<script setup>
/**
 * Audit Standards list. Phase B-2: list + Create dialog + click-through
 * to AuditStandardsPageId (detail + requirements editor). Version
 * submit-for-approval lands in Phase B-3.
 */
import { IconBook, IconPlus, IconUpload, IconSparkles, IconCopy } from '@tabler/icons-vue'
import { isAllowed, canUseAi } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()

const canRead = computed(() => isAllowed(['auditStandards:read']))
const canCreate = computed(() => isAllowed(['auditStandards:create']))

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

function openDetail(row) {
  router.push(getCompanyPath(`/audits/standards/${row.id}`))
}

const search = ref('')

const standards = useLiveQueryWithDeps(
  [() => search.value],
  async (db, [q]) => {
    const results = await db.AuditStandard.where().exec()
    if (!q) {
      return results.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      )
    }
    const lower = q.toLowerCase()
    return results
      .filter((s) => s.name.toLowerCase().includes(lower) || s.code.toLowerCase().includes(lower))
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
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
</script>

<template>
  <div v-if="!canRead" class="tw:py-12 tw:text-center tw:text-secondary">
    You don't have permission to view the audit standards library.
  </div>
  <div v-else class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-3">
        <BaseTextInput v-model="search" placeholder="Search standards..." class="tw:w-72" />
        <div class="tw:text-xs tw:text-secondary">
          {{ standards.length }} standard{{ standards.length === 1 ? '' : 's' }}
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
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
      </div>
    </div>

    <div
      v-if="!standards.length"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-16 tw:text-secondary"
    >
      <IconBook :size="40" class="tw:opacity-50" />
      <div class="tw:text-base tw:font-semibold">No audit standards yet</div>
      <div class="tw:text-sm tw:text-center tw:max-w-md">
        New tenants are seeded with an empty "Internal Quality Audit" shell. Standard + clause
        authoring UI lands in Phase B-2.
      </div>
    </div>

    <div v-else class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead>
          <tr
            class="tw:text-left tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider tw:bg-main-hover"
          >
            <th class="tw:px-4 tw:py-3">Name</th>
            <th class="tw:px-4 tw:py-3">Code</th>
            <th class="tw:px-4 tw:py-3">Type</th>
            <th class="tw:px-4 tw:py-3">License</th>
            <th class="tw:px-4 tw:py-3">Version</th>
            <th class="tw:px-4 tw:py-3">Created</th>
            <th class="tw:px-4 tw:py-3" />
          </tr>
        </thead>
        <tbody>
          <BaseClickableRow
            v-for="row in standards"
            :key="row.id"
            tag="tr"
            class="tw:border-b tw:border-divider tw:hover:bg-main-hover/40"
            :aria-label="`Open standard ${row.name}`"
            @click="openDetail(row)"
          >
            <td class="tw:px-4 tw:py-3 tw:font-medium tw:text-on-sidebar">
              {{ row.name }}
              <div
                v-if="row.description"
                class="tw:text-xs tw:text-secondary tw:font-normal tw:mt-0.5 tw:truncate tw:max-w-md"
              >
                {{ row.description }}
              </div>
            </td>
            <td class="tw:px-4 tw:py-3">
              <code
                class="tw:text-xs tw:bg-main-hover tw:text-secondary tw:rounded tw:px-2 tw:py-0.5"
              >
                {{ row.code }}
              </code>
            </td>
            <td class="tw:px-4 tw:py-3">
              <AuditStandardTypeBadgeById
                v-if="row.auditStandardTypeId"
                :standardTypeId="row.auditStandardTypeId"
              />
              <span v-else class="tw:text-xs tw:text-secondary">—</span>
            </td>
            <td class="tw:px-4 tw:py-3">
              <AuditStandardContentLicenseBadgeById :licenseId="row.contentLicense" />
            </td>
            <td class="tw:px-4 tw:py-3">
              <span
                class="tw:text-[10px] tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                :class="versionBadgeClass(effectiveVersionByStandardId[row.id])"
              >
                {{ versionLabel(effectiveVersionByStandardId[row.id]) }}
              </span>
            </td>
            <td class="tw:px-4 tw:py-3 tw:text-xs tw:text-secondary">
              {{ row.createdAt ? row.createdAt.formatDate('date') : '—' }}
            </td>
            <td class="tw:px-4 tw:py-3 tw:text-right">
              <button
                v-if="canCreate"
                type="button"
                class="tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:rounded tw:p-1.5 tw:cursor-pointer tw:bg-transparent tw:border-0"
                title="Duplicate this standard"
                @click.stop="openClone(row)"
              >
                <IconCopy :size="16" />
              </button>
            </td>
          </BaseClickableRow>
        </tbody>
      </table>
    </div>

    <AuditStandardCreateDialog v-model="showCreateDialog" />
    <!-- 'Duplicate & open' navigates from inside the dialog; plain 'Duplicate'
         stays here and the new row syncs into the list automatically. -->
    <AuditStandardCloneDialog v-model="showCloneDialog" :standard="cloneTarget" />
    <AuditStandardImportDialog
      v-model="showImportDialog"
      @created="(s) => s?.id && openDetail(s)"
    />
    <AuditStandardAiGenerateDialog
      v-model="showAiGenerateDialog"
      @created="(s) => s?.id && openDetail(s)"
    />
  </div>
</template>
