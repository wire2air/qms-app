<script setup>
/**
 * /<companyCode>/supplier — landing page for EXTERNAL_SUPPLIER users.
 *
 * Four live lists, two visibility paths:
 *   - SharedWithUser-driven (Documents / CAPAs / NCs) — the per-entity
 *     SELECT RLS extension (B.2) makes the entity itself visible only
 *     when the shared row exists.
 *   - Asset Requests — RLS-filtered by the C.5 extension.
 *   - Audits — RLS-via-membership: audit_instances are visible when
 *     audit_team_members has a row for the current user (no permission
 *     required). Same path findings + responses ride on.
 *
 * An internal user landing here (e.g. impersonating) would see only
 * what's explicitly shared with them too — the page is supplier-shaped
 * but not supplier-only.
 */
import {
  IconFileText,
  IconAlertTriangle,
  IconClipboardList,
  IconShieldCheck,
  IconExternalLink,
  IconChecklist,
  IconForms,
} from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineOptions({
  name: 'SupplierDashboardPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

const myUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)
const firstName = computed(() => currentSession.value?.firstName || 'there')

// Single live query covers all three entity-types; we fan it out into
// per-type buckets in the computed below. One sync cost instead of three.
const myShares = useLiveQueryWithDeps(
  [() => myUserId.value],
  async (db, [userId]) => {
    if (!userId) return []
    return db.SharedWithUser.where('userId', userId).exec()
  },

  { models: ['SharedWithUser'], initial: [] },
)

function bucketForType(shares, type) {
  return shares.filter((s) => s.entityType === type).map((s) => s.entityId)
}

// Resolve entity IDs → full records via live query (each entity's RLS
// re-confirms the share so a revoked share disappears immediately).
const sharedDocIds = computed(() => bucketForType(myShares.value, 'Document'))
const sharedDocs = useLiveQueryWithDeps(
  [() => sharedDocIds.value],
  async (db, [ids]) => {
    if (!ids.length) return []
    const all = await db.Document.where().exec()
    const idSet = new Set(ids)
    return all.filter((d) => idSet.has(d.id))
  },

  { models: ['Document'], initial: [] },
)

const sharedCapaIds = computed(() => bucketForType(myShares.value, 'Capa'))
const sharedCapas = useLiveQueryWithDeps(
  [() => sharedCapaIds.value],
  async (db, [ids]) => {
    if (!ids.length) return []
    const all = await db.Capa.where().exec()
    const idSet = new Set(ids)
    return all.filter((c) => idSet.has(c.id))
  },

  { models: ['Capa'], initial: [] },
)

// Audits the supplier user can see. Two paths produce the same row
// list and we union them: (a) team membership via audit_team_members
// (the RLS-via-membership branch on audit_instances), (b) any audit
// whose supplier_id matches the supplier this user belongs to (kept
// as a defence-in-depth filter in case team-seeding hasn't happened
// yet at audit-create time). The SyncEngine only delivers rows RLS
// allows the user to see — so this query is by construction safe even
// if both branches over-match.
const mySupplierId = computed(() => currentSession.value?.supplierId ?? null)
const myAudits = useLiveQueryWithDeps(
  [() => myUserId.value, () => mySupplierId.value],
  async (db, [userId, supplierId]) => {
    if (!userId) return []
    const all = await db.AuditInstance.where().exec()
    if (!all.length) return []
    const memberships = await db.AuditTeamMember.where('userId', userId).exec()
    const myAuditIds = new Set(memberships.map((m) => m.auditInstanceId))
    return all
      .filter((a) => myAuditIds.has(a.id) || (supplierId && a.supplierId === supplierId))
      .sort(
        (a, b) =>
          (b.scheduledDate?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) -
          (a.scheduledDate?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0),
      )
  },

  { models: ['AuditInstance', 'AuditTeamMember'], initial: [] },
)

const sharedNcIds = computed(() => bucketForType(myShares.value, 'Nonconformance'))
const sharedNcs = useLiveQueryWithDeps(
  [() => sharedNcIds.value],
  async (db, [ids]) => {
    if (!ids.length) return []
    const all = await db.Nonconformance.where().exec()
    const idSet = new Set(ids)
    return all.filter((n) => idSet.has(n.id))
  },

  { models: ['Nonconformance'], initial: [] },
)

// Admin-defined module records — shared via SharedWithUser keyed by the
// module_key (anything that isn't a built-in share entity type).
const BUILTIN_SHARE_TYPES = new Set(['Document', 'Capa', 'Nonconformance'])
const sharedRecordIds = computed(() =>
  myShares.value.filter((s) => !BUILTIN_SHARE_TYPES.has(s.entityType)).map((s) => s.entityId),
)
const sharedRecords = useLiveQueryWithDeps(
  [() => sharedRecordIds.value],
  async (db, [ids]) => {
    if (!ids.length) return []
    const all = await db.Record.where().exec()
    const idSet = new Set(ids)
    return all.filter((r) => idSet.has(r.id))
  },

  { models: ['Record'], initial: [] },
)
function recordHref(r) {
  return getCompanyPath(`m/${r.moduleKey}/${r.id}`)
}

function docHref(d) {
  return getCompanyPath(`documents/${d.id}`)
}
function capaHref(c) {
  return getCompanyPath(`capas/${c.id}`)
}
function ncHref(n) {
  return getCompanyPath(`nonconformances/${n.id}`)
}
function auditHref(a) {
  return getCompanyPath(`audits/instances/${a.id}`)
}
</script>

<template>
  <div class="tw:p-5 tw:max-w-5xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-3">
      <IconShieldCheck :size="28" class="tw:text-primary tw:shrink-0" />
      <div>
        <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main">Welcome, {{ firstName }}</h1>
        <p class="tw:text-sm tw:text-secondary">
          Everything below has been explicitly shared with you by the client. Read-only by default,
          except where you've been included in an approval or action workflow.
        </p>
      </div>
    </div>

    <!-- Shared Documents -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconFileText :size="18" class="tw:text-primary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Shared Documents
          <span v-if="sharedDocs.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedDocs.length }})
          </span>
        </h2>
      </div>
      <p v-if="sharedDocs.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No documents shared with you yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="d in sharedDocs"
          :key="d.id"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2 tw:text-sm"
        >
          <a
            :href="docHref(d)"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-on-main tw:hover:text-primary tw:flex-1"
          >
            <span class="tw:text-xs tw:text-secondary">{{ d.docNumber }}</span>
            <span class="tw:font-medium">{{ d.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
          >
            {{ d.statusId }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Shared CAPAs -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconAlertTriangle :size="18" class="tw:text-primary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Shared CAPAs
          <span v-if="sharedCapas.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedCapas.length }})
          </span>
        </h2>
      </div>
      <p v-if="sharedCapas.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No CAPAs shared with you yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="c in sharedCapas"
          :key="c.id"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2 tw:text-sm"
        >
          <a
            :href="capaHref(c)"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-on-main tw:hover:text-primary tw:flex-1"
          >
            <span class="tw:text-xs tw:text-secondary">{{ c.capaNumber }}</span>
            <span class="tw:font-medium">{{ c.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
          >
            {{ c.statusId }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Shared NCs -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconClipboardList :size="18" class="tw:text-primary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Shared Non-conformances
          <span v-if="sharedNcs.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedNcs.length }})
          </span>
        </h2>
      </div>
      <p v-if="sharedNcs.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No non-conformances shared with you yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="n in sharedNcs"
          :key="n.id"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2 tw:text-sm"
        >
          <a
            :href="ncHref(n)"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-on-main tw:hover:text-primary tw:flex-1"
          >
            <span class="tw:text-xs tw:text-secondary">{{ n.ncNumber }}</span>
            <span class="tw:font-medium">{{ n.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
          >
            {{ n.statusId }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Shared Records — admin-defined module records routed to this supplier
         user. Opening one shows the section workflow; their assigned step is
         editable, the rest read-only. -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconForms :size="18" class="tw:text-primary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Shared Records
          <span v-if="sharedRecords.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedRecords.length }})
          </span>
        </h2>
      </div>
      <p v-if="sharedRecords.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No records shared with you yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="r in sharedRecords"
          :key="r.id"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2 tw:text-sm"
        >
          <a
            :href="recordHref(r)"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-on-main tw:hover:text-primary tw:flex-1"
          >
            <span class="tw:font-mono tw:text-xs tw:text-secondary">{{ r.recordNumber }}</span>
            <span class="tw:font-medium">{{ r.moduleKey }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
          >
            {{ r.statusId }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Audits you're on — RLS-via-team-membership branch; the
         instance landing page handles read-only / editable gating
         based on the supplier user's permissions. -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconChecklist :size="18" class="tw:text-primary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Your Audits
          <span v-if="myAudits.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ myAudits.length }})
          </span>
        </h2>
      </div>
      <p v-if="myAudits.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No audits assigned to you yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="a in myAudits"
          :key="a.id"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2 tw:text-sm"
        >
          <a
            :href="auditHref(a)"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-on-main tw:hover:text-primary tw:flex-1"
          >
            <span class="tw:text-xs tw:text-secondary">{{ a.auditNumber }}</span>
            <span v-if="a.scheduledDate" class="tw:text-xs tw:text-secondary">
              {{ a.scheduledDate.formatDate?.('date') ?? a.scheduledDate }}
            </span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <AuditInstanceStatusBadgeById :statusId="a.statusId" />
        </li>
      </ul>
    </section>

    <!-- Asset Requests — live, RLS-filtered to this supplier's requests -->
    <SupplierAssetRequestsList />
  </div>
</template>
