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
// docId → the current version's effective date, for the row meta.
const effectiveDateByDoc = computed(() => {
  const m = {}
  for (const v of versions.value) {
    if (v.statusId !== 'EFFECTIVE' && v.statusId !== 'APPROVED') continue
    const cur = m[v.documentId]
    if (!cur || (v.effectiveDate?.toMillis?.() ?? 0) > (cur?.toMillis?.() ?? 0)) {
      m[v.documentId] = v.effectiveDate
    }
  }
  return m
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
  {
    id: 'QualityEvent',
    label: 'Quality Events',
    model: 'QualityEvent',
    numberField: 'eventNumber',
  },
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

// Period filter: an auditor asks "CAPAs closed in FY25" — so the range reads
// the CLOSED date when the status filter is Closed, created date otherwise.
const dateFrom = ref('')
const dateTo = ref('')
const dateFieldLabel = computed(() =>
  statusFilterApplies.value && recordStatus.value === 'CLOSED'
    ? 'Closed between'
    : 'Created between',
)
function inRange(r) {
  if (!dateFrom.value && !dateTo.value) return true
  const useClosed = statusFilterApplies.value && recordStatus.value === 'CLOSED'
  const d = useClosed ? (r.closedAt ?? r.createdAt) : r.createdAt
  const ms = d?.toMillis?.() ?? null
  if (ms === null) return false
  if (dateFrom.value && ms < Date.parse(dateFrom.value)) return false
  if (dateTo.value && ms > Date.parse(dateTo.value) + 86_399_000) return false
  return true
}

const RECORD_STATUS_CLASS = {
  CLOSED: 'tw:bg-emerald-100 tw:text-emerald-700',
  OPEN: 'tw:bg-amber-100 tw:text-amber-700',
  DRAFT: 'tw:bg-gray-200 tw:text-gray-600',
}

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
    .filter(inRange)
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
const replaceMode = ref(false)

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
        mode: replaceMode.value ? 'replace' : 'add',
      },
      { showError: true },
    )
    const n = res?.shared?.length ?? 0
    const total = res?.itemCount ?? selectedCount.value
    toast.success(
      replaceMode.value
        ? `Package replaced — now ${total} record(s), shared with ${n} recipient${n === 1 ? '' : 's'}.`
        : `Shared — the package now holds ${total} record(s) for ${n} recipient${n === 1 ? '' : 's'}.`,
    )
    selected.value = {}
    replaceMode.value = false
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

// ── Package details popup: what exactly this link exposes ───────────────────
const detailLink = ref(null)
const detailItems = useLiveQueryWithDeps(
  [() => detailLink.value?.id],
  async (db, [linkId]) => {
    if (!linkId) return []
    return db.RecordShareLinkItem.where('recordShareLinkId', linkId).exec()
  },
  { models: ['RecordShareLinkItem'], initial: [] },
)
const ITEM_MODELS = {
  Document: { model: 'Document', numberField: 'docNumber', label: 'Document' },
  Capa: { model: 'Capa', numberField: 'capaNumber', label: 'CAPA' },
  Nonconformance: { model: 'Nonconformance', numberField: 'ncNumber', label: 'NC' },
  QualityEvent: { model: 'QualityEvent', numberField: 'eventNumber', label: 'Quality Event' },
  ChangeRequest: { model: 'ChangeRequest', numberField: 'crNumber', label: 'Change Request' },
}
const detailResolved = useLiveQueryWithDeps(
  [() => detailItems.value.map((i) => `${i.entityType}:${i.entityId}`).join(',')],
  async (db, [csv]) => {
    const out = []
    for (const pair of (csv || '').split(',').filter(Boolean)) {
      const [entityType, entityId] = pair.split(':')
      const cfg = ITEM_MODELS[entityType]
      const rec = cfg ? await db[cfg.model]?.findByPk(entityId) : null
      out.push({
        key: pair,
        label: cfg?.label || entityType,
        reference: rec?.[cfg?.numberField] || null,
        title: rec?.title || null,
      })
    }
    return out
  },
  { initial: [] },
)
const detailViews = useLiveQueryWithDeps(
  [() => detailLink.value?.id],
  async (db, [linkId]) => {
    if (!linkId) return []
    return db.RecordShareLinkView.where('shareLinkId', linkId).orderBy('viewedAt', 'desc').exec()
  },
  { models: ['RecordShareLinkView'], initial: [] },
)

async function revokeFromDialog() {
  if (!detailLink.value) return
  await revoke(detailLink.value)
  detailLink.value = null
}

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

// shareLinkStatus returns UPPERCASE ids — lowercase keys here were why the
// Revoke button and badge colors never rendered (user report 2026-08-26).
const STATUS_CLASS = {
  ACTIVE: 'tw:bg-emerald-100 tw:text-emerald-700',
  WITHDRAWN: 'tw:bg-red-100 tw:text-red-700',
  EXPIRED: 'tw:bg-gray-200 tw:text-gray-600',
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
    <div class="tw:flex tw:flex-col tw:gap-4">
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
        <div
          class="tw:max-h-72 tw:overflow-y-auto tw:flex tw:flex-col tw:divide-y tw:divide-divider"
        >
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
            <span class="tw:text-sm tw:min-w-0 tw:flex-1 tw:truncate">
              <span class="tw:font-medium">{{ d.docNumber || '—' }}</span> · {{ d.title }}
            </span>
            <span class="tw:text-xs tw:text-secondary tw:shrink-0">
              Effective
              {{
                effectiveDateByDoc[d.id]?.formatDate
                  ? effectiveDateByDoc[d.id].formatDate('date')
                  : '—'
              }}
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
          <BaseInlineSelect
            v-model="recordTab"
            :items="RECORD_TABS.map((t) => ({ id: t.id, name: t.label }))"
            :required="true"
          />
          <BaseInlineSelect
            v-if="statusFilterApplies"
            v-model="recordStatus"
            :items="STATUS_OPTIONS"
            :required="true"
          />
          <span class="tw:text-xs tw:text-secondary">{{ dateFieldLabel }}</span>
          <BaseTextInput v-model="dateFrom" size="sm" type="date" class="tw:w-36" />
          <span class="tw:text-xs tw:text-secondary">–</span>
          <BaseTextInput v-model="dateTo" size="sm" type="date" class="tw:w-36" />
          <BaseTextInput
            v-model="recordSearch"
            size="sm"
            placeholder="Search number or title…"
            class="tw:flex-1 tw:min-w-40"
          >
            <template #icon><IconSearch :size="14" /></template>
          </BaseTextInput>
        </div>
        <div
          class="tw:max-h-72 tw:overflow-y-auto tw:flex tw:flex-col tw:divide-y tw:divide-divider"
        >
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
            <span class="tw:text-sm tw:min-w-0 tw:flex-1 tw:truncate">
              <span class="tw:font-medium">{{
                r[RECORD_TABS.find((t) => t.id === recordTab).numberField] || '—'
              }}</span>
              · {{ r.title }}
            </span>
            <BaseBadge
              :class="RECORD_STATUS_CLASS[r.statusId] || 'tw:bg-gray-100 tw:text-gray-600'"
            >
              {{ r.statusId }}
            </BaseBadge>
            <span class="tw:text-xs tw:text-secondary tw:shrink-0 tw:w-40 tw:text-right">
              <template v-if="r.closedAt?.formatDate"
                >Closed {{ r.closedAt.formatDate('date') }}</template
              >
              <template v-else-if="r.createdAt?.formatDate"
                >Created {{ r.createdAt.formatDate('date') }}</template
              >
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
        <BaseText weight="semibold" class="tw:text-sm"> {{ selectedCount }} selected </BaseText>
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
      <label
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary tw:cursor-pointer"
      >
        <input v-model="replaceMode" type="checkbox" />
        Replace the recipient's existing package instead of adding to it
      </label>
      <p class="tw:text-xs tw:text-secondary">
        One link, one email code. The auditor verifies once and can read, print and download
        everything in the package. Sharing again to the same address ADDS to their package unless
        you choose replace.
      </p>
    </div>

    <!-- Existing packages -->
    <div v-if="links.length" class="tw:flex tw:flex-col tw:gap-2">
      <BaseText variant="overline">Shared packages</BaseText>
      <div class="tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider">
        <BaseClickableRow
          v-for="l in links"
          :key="l.id"
          :ariaLabel="`Package for ${l.email}`"
          class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2 tw:w-full tw:text-left"
          @click="detailLink = l"
        >
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
              <template v-if="l.expiresAt">
                · expires {{ l.expiresAt.formatDate('date') }}</template
              >
            </BaseText>
          </div>
          <BaseButton
            v-if="!readonly && shareLinkStatus(l) === 'ACTIVE'"
            variant="outline"
            size="sm"
            @click.stop="revoke(l)"
          >
            <template #icon><IconTrash :size="14" /></template>
            Revoke
          </BaseButton>
        </BaseClickableRow>
      </div>
      <p class="tw:text-xs tw:text-secondary">
        Full history — including who opened what and when — lives on the
        <RouterLink
          :to="getCompanyPath('/shared-records')"
          class="tw:text-primary tw:hover:underline"
          >Shared Records</RouterLink
        >
        page.
      </p>
    </div>

    <!-- Package details: exactly what this link exposes, and who opened it. -->
    <BaseDialog
      :modelValue="!!detailLink"
      :title="`Package — ${detailLink?.email || ''}`"
      maxWidth="lg"
      @update:modelValue="detailLink = null"
    >
      <div v-if="detailLink" class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-sm">
          <BaseBadge :class="STATUS_CLASS[shareLinkStatus(detailLink)] || ''">
            {{ SHARE_LINK_STATUS_LABELS[shareLinkStatus(detailLink)] }}
          </BaseBadge>
          <BaseText color="secondary" class="tw:text-xs">
            Shared {{ detailLink.createdAt ? detailLink.createdAt.formatDate('date') : '—' }}
            <template v-if="detailLink.expiresAt">
              · expires {{ detailLink.expiresAt.formatDate('date') }}</template
            >
          </BaseText>
        </div>

        <div>
          <BaseText variant="overline" class="tw:block tw:mb-1">
            Contents ({{ detailResolved.length }})
          </BaseText>
          <ul
            class="tw:m-0 tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:rounded-lg tw:border tw:border-divider tw:p-0"
          >
            <li
              v-for="it in detailResolved"
              :key="it.key"
              class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1.5 tw:text-sm tw:list-none"
            >
              <span
                class="tw:text-xs tw:uppercase tw:tracking-wide tw:text-secondary tw:w-28 tw:shrink-0"
              >
                {{ it.label }}
              </span>
              <span class="tw:min-w-0 tw:truncate">
                <span class="tw:font-medium">{{ it.reference || '—' }}</span>
                <template v-if="it.title"> · {{ it.title }}</template>
              </span>
            </li>
          </ul>
        </div>

        <div>
          <BaseText variant="overline" class="tw:block tw:mb-1">
            Access history ({{ detailViews.length }})
          </BaseText>
          <p v-if="!detailViews.length" class="tw:text-xs tw:text-secondary">Not opened yet.</p>
          <ul
            v-else
            class="tw:m-0 tw:p-0 tw:flex tw:flex-col tw:gap-1 tw:max-h-40 tw:overflow-y-auto"
          >
            <li
              v-for="v in detailViews"
              :key="v.id"
              class="tw:text-xs tw:text-secondary tw:list-none"
            >
              {{ v.viewedAt ? v.viewedAt.formatDate('datetime') : '—' }}
              <template v-if="v.ip"> · {{ v.ip }}</template>
            </li>
          </ul>
        </div>

        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton
            v-if="!readonly && shareLinkStatus(detailLink) === 'ACTIVE'"
            variant="danger"
            size="sm"
            @click="revokeFromDialog"
          >
            Revoke access
          </BaseButton>
        </div>
      </div>
    </BaseDialog>
  </div>
</template>
