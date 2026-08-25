<script setup>
/**
 * Share with the auditor — the auditee's bulk share.
 *
 * Pick effective documents (search by title, filter by site/department) and
 * open quality records (CAPA / NC / Quality Event / Change Request), then
 * share the whole selection as ONE package: one link, one OTP, emailed to the
 * auditor. Re-sharing to the same address replaces the package's contents.
 *
 * Existing packages for this audit list below with status, view count and
 * revoke — the same lifecycle every share link has; the Shared Records admin
 * page sees these links too.
 */
import { IconSend, IconTrash, IconFileText, IconSearch } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { shareLinkStatus, SHARE_LINK_STATUS_LABELS } from '@/utils/shareLinkStatus.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})

const toast = useToast()
const { confirm } = useConfirm()

// ── Selection state ─────────────────────────────────────────────────────────
const selected = ref({}) // `${entityType}:${id}` -> {entityType, entityId, label}
const selectedCount = computed(() => Object.keys(selected.value).length)
function keyOf(t, id) {
  return `${t}:${id}`
}
function isSelected(t, id) {
  return !!selected.value[keyOf(t, id)]
}
function toggle(t, id, label) {
  const k = keyOf(t, id)
  if (selected.value[k]) delete selected.value[k]
  else selected.value[k] = { entityType: t, entityId: id, label }
}

// ── Shared context: site + department scope BOTH pickers ────────────────────
const siteId = ref(null)
const departmentId = ref(null)

// ── Documents (effective only) ──────────────────────────────────────────────
const docSearch = ref('')

const documents = useLiveQuery((db) => db.Document.where().exec(), {
  models: ['Document'],
  initial: [],
})
const versions = useLiveQuery((db) => db.DocumentVersion.where().exec(), {
  models: ['DocumentVersion'],
  initial: [],
})
const effectiveDocIds = computed(() => {
  const s = new Set()
  for (const v of versions.value) {
    if (v.statusId === 'EFFECTIVE' || v.statusId === 'APPROVED') s.add(v.documentId)
  }
  return s
})
const filteredDocuments = computed(() => {
  const q = docSearch.value.trim().toLowerCase()
  return documents.value
    .filter((d) => d.statusId !== 'ARCHIVED' && effectiveDocIds.value.has(d.id))
    .filter((d) => !siteId.value || d.siteId === siteId.value || d.appliesAllSites)
    .filter((d) => !departmentId.value || d.departmentId === departmentId.value)
    .filter(
      (d) =>
        !q ||
        (d.title || '').toLowerCase().includes(q) ||
        (d.docNumber || '').toLowerCase().includes(q),
    )
    .slice(0, 50)
})

// ── Quality records ─────────────────────────────────────────────────────────
const RECORD_TABS = [
  { id: 'Capa', label: 'CAPAs', model: 'Capa', numberField: 'capaNumber' },
  { id: 'Nonconformance', label: 'NCs', model: 'Nonconformance', numberField: 'ncNumber' },
  { id: 'QualityEvent', label: 'Quality Events', model: 'QualityEvent', numberField: 'eventNumber' },
  { id: 'ChangeRequest', label: 'Change Control', model: 'ChangeRequest', numberField: 'crNumber' },
]
const recordTab = ref('Capa')
const recordSearch = ref('')

// Status filter (CAPA/NC/QE share the unified lifecycle). Default CLOSED: an
// audit package is evidence the loop CLOSES — open work is shared knowingly.
const STATUS_OPTIONS = [
  { id: 'CLOSED', name: 'Closed' },
  { id: 'OPEN', name: 'Open' },
  { id: 'DRAFT', name: 'Draft' },
  { id: 'ALL', name: 'All statuses' },
]
const recordStatus = ref('CLOSED')
const statusFilterApplies = computed(() =>
  ['Capa', 'Nonconformance', 'QualityEvent'].includes(recordTab.value),
)

const capas = useLiveQuery((db) => db.Capa.where().exec(), { models: ['Capa'], initial: [] })
const ncs = useLiveQuery((db) => db.Nonconformance.where().exec(), {
  models: ['Nonconformance'],
  initial: [],
})
const qes = useLiveQuery((db) => db.QualityEvent.where().exec(), {
  models: ['QualityEvent'],
  initial: [],
})
const crs = useLiveQuery((db) => db.ChangeRequest.where().exec(), {
  models: ['ChangeRequest'],
  initial: [],
})
const RECORD_SOURCES = { Capa: capas, Nonconformance: ncs, QualityEvent: qes, ChangeRequest: crs }

const filteredRecords = computed(() => {
  const cfg = RECORD_TABS.find((t) => t.id === recordTab.value)
  const q = recordSearch.value.trim().toLowerCase()
  return (RECORD_SOURCES[cfg.id]?.value || [])
    .filter((r) => r.statusId !== 'CANCELLED')
    .filter(
      (r) =>
        !statusFilterApplies.value ||
        recordStatus.value === 'ALL' ||
        r.statusId === recordStatus.value,
    )
    .filter((r) => !siteId.value || r.siteId === siteId.value)
    .filter((r) => !departmentId.value || r.departmentId === departmentId.value)
    .filter(
      (r) =>
        !q ||
        (r.title || '').toLowerCase().includes(q) ||
        (r[cfg.numberField] || '').toLowerCase().includes(q),
    )
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 50)
})

// ── Share ───────────────────────────────────────────────────────────────────
const email = ref('')
watch(
  () => props.auditInstance?.externalAuditorEmail,
  (v) => {
    if (v && !email.value) email.value = v
  },
  { immediate: true },
)
const sharing = ref(false)

async function sharePackage() {
  if (sharing.value || !selectedCount.value) return
  sharing.value = true
  try {
    const res = await post(
      '/v1/services/recordShareLinks/package',
      {
        auditInstanceId: props.auditInstance.id,
        emails: email.value
          .split(/[,;\s]+/)
          .map((e) => e.trim())
          .filter(Boolean),
        items: Object.values(selected.value).map(({ entityType, entityId }) => ({
          entityType,
          entityId,
        })),
      },
      { showError: true },
    )
    const n = res?.shared?.length ?? 0
    toast.success(
      `Package of ${res?.itemCount ?? selectedCount.value} record(s) shared with ${n} recipient${n === 1 ? '' : 's'}.`,
    )
    selected.value = {}
  } catch {
    /* toast shown */
  } finally {
    sharing.value = false
  }
}

// ── Existing packages for this audit ────────────────────────────────────────
const links = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [auditId]) => {
    const rows = await db.RecordShareLink.where().exec()
    return rows
      .filter((l) => l.entityType === 'AuditInstance' && l.entityId === auditId)
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['RecordShareLink'], initial: [] },
)
const itemsByLink = useLiveQueryWithDeps(
  [() => links.value.map((l) => l.id).join(',')],
  async (db, [csv]) => {
    const m = {}
    for (const id of (csv || '').split(',').filter(Boolean)) {
      m[id] = await db.RecordShareLinkItem.where('recordShareLinkId', id).exec()
    }
    return m
  },
  { models: ['RecordShareLinkItem'], initial: {} },
)

async function revoke(link) {
  if (
    !(await confirm({
      title: 'Revoke package',
      message: `Withdraw external access for ${link.email}? Their link and any code in flight die immediately.`,
      okLabel: 'Revoke',
      danger: true,
    }))
  )
    return
  try {
    await post(`/v1/services/recordShareLinks/${link.id}/revoke`, {}, { showError: true })
    toast.success('Package revoked.')
  } catch {
    /* toast shown */
  }
}

const STATUS_CLASS = {
  active: 'tw:bg-emerald-100 tw:text-emerald-700',
  revoked: 'tw:bg-red-100 tw:text-red-700',
  expired: 'tw:bg-gray-200 tw:text-gray-600',
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-5">
    <!-- Context: scopes BOTH pickers — you are assembling evidence for one
         site/department's audit. -->
    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseText variant="overline" class="tw:mr-1">Context</BaseText>
      <SiteSelectMenu v-model="siteId" class="tw:w-48" />
      <DepartmentSelectMenu v-model="departmentId" :siteId="siteId" class="tw:w-48" />
    </div>

    <!-- Pickers -->
    <div class="tw:grid tw:grid-cols-1 tw:xl:grid-cols-2 tw:gap-4">
      <!-- Documents -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:p-3 tw:flex tw:flex-col tw:gap-2">
        <BaseText variant="overline">Effective Documents</BaseText>
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <BaseTextInput
            v-model="docSearch"
            size="sm"
            placeholder='Search title or number — "SOP…"'
            class="tw:flex-1 tw:min-w-40"
          >
            <template #icon><IconSearch :size="14" /></template>
          </BaseTextInput>
        </div>
        <div class="tw:max-h-72 tw:overflow-y-auto tw:flex tw:flex-col tw:divide-y tw:divide-divider">
          <label
            v-for="d in filteredDocuments"
            :key="d.id"
            class="tw:flex tw:items-center tw:gap-2 tw:py-1.5 tw:cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="isSelected('Document', d.id)"
              :disabled="readonly"
              @change="toggle('Document', d.id, `${d.docNumber || 'Doc'}: ${d.title}`)"
            />
            <IconFileText :size="14" class="tw:shrink-0 tw:text-secondary" />
            <span class="tw:text-sm tw:min-w-0 tw:truncate">
              <span class="tw:font-medium">{{ d.docNumber || '—' }}</span> · {{ d.title }}
            </span>
          </label>
          <p v-if="!filteredDocuments.length" class="tw:text-xs tw:text-secondary tw:py-2">
            No effective documents match.
          </p>
        </div>
      </div>

      <!-- Quality records -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:p-3 tw:flex tw:flex-col tw:gap-2">
        <BaseText variant="overline">Quality Records</BaseText>
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <BaseInlineSelect v-model="recordTab" :items="RECORD_TABS.map((t) => ({ id: t.id, name: t.label }))" :required="true" />
          <BaseInlineSelect
            v-if="statusFilterApplies"
            v-model="recordStatus"
            :items="STATUS_OPTIONS"
            :required="true"
          />
          <BaseTextInput
            v-model="recordSearch"
            size="sm"
            placeholder="Search number or title…"
            class="tw:flex-1 tw:min-w-40"
          >
            <template #icon><IconSearch :size="14" /></template>
          </BaseTextInput>
        </div>
        <div class="tw:max-h-72 tw:overflow-y-auto tw:flex tw:flex-col tw:divide-y tw:divide-divider">
          <label
            v-for="r in filteredRecords"
            :key="r.id"
            class="tw:flex tw:items-center tw:gap-2 tw:py-1.5 tw:cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="isSelected(recordTab, r.id)"
              :disabled="readonly"
              @change="
                toggle(
                  recordTab,
                  r.id,
                  `${r[RECORD_TABS.find((t) => t.id === recordTab).numberField] || ''}: ${r.title}`,
                )
              "
            />
            <span class="tw:text-sm tw:min-w-0 tw:truncate">
              <span class="tw:font-medium">{{
                r[RECORD_TABS.find((t) => t.id === recordTab).numberField] || '—'
              }}</span>
              · {{ r.title }}
            </span>
          </label>
          <p v-if="!filteredRecords.length" class="tw:text-xs tw:text-secondary tw:py-2">
            Nothing matches.
          </p>
        </div>
      </div>
    </div>

    <!-- Basket + send -->
    <div
      class="tw:rounded-xl tw:border tw:border-primary/30 tw:bg-primary/5 tw:p-3 tw:flex tw:flex-col tw:gap-2"
    >
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
        <BaseText weight="semibold" class="tw:text-sm">
          {{ selectedCount }} selected
        </BaseText>
        <span class="tw:flex-1" />
        <BaseTextInput
          v-model="email"
          size="sm"
          type="email"
          placeholder="auditor@registrar.com"
          class="tw:w-72"
        />
        <BaseButton
          :disabled="readonly || !selectedCount || !email.trim()"
          :isLoading="sharing"
          @click="sharePackage"
        >
          <template #icon><IconSend :size="15" /></template>
          Share package
        </BaseButton>
      </div>
      <div v-if="selectedCount" class="tw:flex tw:flex-wrap tw:gap-1.5">
        <span
          v-for="(item, k) in selected"
          :key="k"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-main tw:border tw:border-divider tw:px-2 tw:py-0.5 tw:text-xs"
        >
          <span class="tw:max-w-64 tw:truncate">{{ item.label }}</span>
          <button
            type="button"
            class="tw:text-secondary tw:hover:text-red-600 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:leading-none"
            :aria-label="`Remove ${item.label}`"
            @click="delete selected[k]"
          >
            ×
          </button>
        </span>
      </div>
      <p class="tw:text-xs tw:text-secondary">
        One link, one email code. The auditor verifies once and can read, print and download
        everything in the package. Re-sharing to the same address replaces the package's contents.
      </p>
    </div>

    <!-- Existing packages -->
    <div v-if="links.length" class="tw:flex tw:flex-col tw:gap-2">
      <BaseText variant="overline">Shared packages</BaseText>
      <div class="tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider">
        <div v-for="l in links" :key="l.id" class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2">
          <div class="tw:min-w-0 tw:flex-1">
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseText class="tw:text-sm tw:font-medium tw:truncate">{{ l.email }}</BaseText>
              <BaseBadge :class="STATUS_CLASS[shareLinkStatus(l)] || ''">
                {{ SHARE_LINK_STATUS_LABELS[shareLinkStatus(l)] || shareLinkStatus(l) }}
              </BaseBadge>
            </div>
            <BaseText color="secondary" class="tw:text-xs">
              {{ (itemsByLink[l.id] || []).length }} item(s) · shared
              {{ l.createdAt ? l.createdAt.formatDate('date') : '—' }}
              <template v-if="l.expiresAt"> · expires {{ l.expiresAt.formatDate('date') }}</template>
            </BaseText>
          </div>
          <BaseButton
            v-if="!readonly && shareLinkStatus(l) === 'active'"
            variant="outline"
            size="sm"
            @click="revoke(l)"
          >
            <template #icon><IconTrash :size="14" /></template>
            Revoke
          </BaseButton>
        </div>
      </div>
      <p class="tw:text-xs tw:text-secondary">
        Full history — including who opened what and when — lives on the
        <RouterLink :to="getCompanyPath('/shared-records')" class="tw:text-primary tw:hover:underline"
          >Shared Records</RouterLink
        >
        page.
      </p>
    </div>
  </div>
</template>
