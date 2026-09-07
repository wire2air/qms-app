<script setup>
/**
 * /<companyCode>/supplier — landing page for EXTERNAL_SUPPLIER users.
 *
 * Live lists, two visibility paths:
 *   - SharedWithUser-driven (Documents / CAPAs / NCs / Quality Events /
 *     module Records, and audits shared rather than staffed) — the
 *     per-entity SELECT RLS extension (B.2) makes the entity itself
 *     visible only when the shared row exists.
 *   - Asset Requests — RLS-filtered by the C.5 extension.
 *   - Audits — ALSO RLS-via-membership: audit_instances are visible when
 *     audit_team_members has a row for the current user (no permission
 *     required). Same path findings + responses ride on. The audit list
 *     below unions that with AuditInstance shares.
 *
 * PORTAL-F15 — the buckets are derived from `@/utils/portalShareEntities.js`,
 * the SPA mirror of the backend's canonical entity_type map. They used to be a
 * hardcoded three plus a catch-all `else → db.Record`, which is why a
 * QualityEvent or AuditInstance grant — legal at the CHECK, authorised by RLS,
 * trusted by the entity's own SELECT policy — was looked up in a table it can
 * never appear in and rendered nowhere. The module-record bucket is now a
 * POSITIVE module-key test, so a type this page does not know about is dropped
 * loudly-ish (nowhere) rather than mis-filed silently.
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
  IconEye,
} from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isModuleKeyPortalShareType } from '@/utils/portalShareEntities.js'
import { refreshModel } from '@syncEngine/sync/bootstrap.js'

defineOptions({
  name: 'SupplierDashboardPage',
})
const pageInfo = usePageInfo()
pageInfo.value = {
  showHeader: true,
}

const myUserId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)
const firstName = computed(() => currentSession.value?.firstName || 'there')

// PORTAL-F14 — re-read the grant table from the server on every mount, out of
// band from the 5-minute bootstrapGate.
//
// Everywhere else in the app a stale local row means slightly old data. Here it
// means the wrong answer to an authorization question: this page lists exactly
// the entities `shared_with_user` holds a live row for, so a grant revoked while
// this client was reloading, offline or briefly disconnected is a grant it never
// hears about. The socket event is missed and nothing afterwards reconciles —
// the delta bootstrap only bulkPuts, there is no tombstone pass, and the gate
// skips it for five minutes. Measured by SUP-J8b, which revokes and reloads in
// the same tick and saw the revoked document for a full 30 seconds.
//
// A delta refresh is sufficient and a tombstone pass is not needed: a revoke is
// an UPDATE that bumps updated_at, so the row is newer than the watermark and
// comes back carrying deleted_at (neither shared_with_user_select_rls nor the
// generated query filters soft deletes). Writing it to IndexedDB is what removes
// it, because QueryBuilder's paranoid filter then drops it from myShares below.
//
// ⚠️ This corrects the LIST. It does not evict the entity rows themselves —
// Document, DocumentVersion and DocumentSection survive in IndexedDB until
// logout, so a path that loads content by id without consulting a grant is still
// exposed. That is the other half of F-14 and needs a real tombstone pass.
//
// Failure is deliberately non-fatal: offline, the live queries fall back to the
// local copy, which is the same behaviour as before this call existed.
onMounted(async () => {
  try {
    await refreshModel('SharedWithUser')
  } catch (err) {
    console.error('[supplier portal] grant refresh failed; list may be stale', err)
  }
})

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

// Audits the supplier user can see. THREE paths produce the same row list and
// we union them: (a) team membership via audit_team_members (the
// RLS-via-membership branch on audit_instances), (b) any audit whose
// supplier_id matches the supplier this user belongs to (kept as a
// defence-in-depth filter in case team-seeding hasn't happened yet at
// audit-create time), (c) an explicit AuditInstance share.
//
// (c) is the PORTAL-F15 fix. `shared_with_user_entity_type_chk` has admitted
// 'AuditInstance' since 20260714000400, share_entity_permission() has an
// audit_management arm for it, and audit_management's generated read predicate
// (migration 20260709121700) makes the row visible on a share alone — as do
// audit_findings / audit_evidence / audit_document_requests /
// audit_requirement_responses, all four of which key off exactly this share.
// The row therefore arrived in the supplier's IndexedDB and this page threw it
// into the module-record bucket, where `db.Record` could never match it. A
// shared-but-unstaffed auditee saw an empty dashboard.
//
// The SyncEngine only delivers rows RLS allows the user to see — so this query
// is by construction safe even if all three branches over-match.
const mySupplierId = computed(() => currentSession.value?.supplierId ?? null)
const sharedAuditIds = computed(() => bucketForType(myShares.value, 'AuditInstance'))
const myAudits = useLiveQueryWithDeps(
  [() => myUserId.value, () => mySupplierId.value, () => sharedAuditIds.value],
  async (db, [userId, supplierId, sharedIds]) => {
    if (!userId) return []
    const all = await db.AuditInstance.where().exec()
    if (!all.length) return []
    const memberships = await db.AuditTeamMember.where('userId', userId).exec()
    const myAuditIds = new Set(memberships.map((m) => m.auditInstanceId))
    const sharedIdSet = new Set(sharedIds)
    return all
      .filter(
        (a) =>
          myAuditIds.has(a.id) ||
          sharedIdSet.has(a.id) ||
          (supplierId && a.supplierId === supplierId),
      )
      .sort(
        (a, b) =>
          (b.scheduledDate?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) -
          (a.scheduledDate?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0),
      )
  },

  { models: ['AuditInstance', 'AuditTeamMember', 'SharedWithUser'], initial: [] },
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

// Quality Events shared with this supplier. quality_events' generated read
// predicate (migration 20260709121200) trusts the share row directly, and the
// supplier sidebar has linked /qualityEvents on that basis all along — the
// dashboard was the one surface that never listed them.
const sharedEventIds = computed(() => bucketForType(myShares.value, 'QualityEvent'))
const sharedEvents = useLiveQueryWithDeps(
  [() => sharedEventIds.value],
  async (db, [ids]) => {
    if (!ids.length) return []
    const all = await db.QualityEvent.where().exec()
    const idSet = new Set(ids)
    return all.filter((e) => idSet.has(e.id))
  },

  { models: ['QualityEvent'], initial: [] },
)

// Admin-defined module records — shared via SharedWithUser keyed by the
// module_key. Selected by MATCHING the module-key shape, not by "isn't one of
// the built-ins I happen to know": the old negative test swept every built-in
// this page had not been taught about into a `db.Record` lookup that could
// never match. See @/utils/portalShareEntities.js.
const sharedRecordIds = computed(() =>
  myShares.value.filter((s) => isModuleKeyPortalShareType(s.entityType)).map((s) => s.entityId),
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
function eventHref(e) {
  return getCompanyPath(`qualityEvents/${e.id}`)
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
        <BaseHeading :level="1" as="page-title" weight="semibold"
          >Welcome, {{ firstName }}</BaseHeading
        >
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
        <BaseHeading :level="2" as="section-title">
          Shared Documents
          <span v-if="sharedDocs.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedDocs.length }})
          </span>
        </BaseHeading>
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
        <BaseHeading :level="2" as="section-title">
          Shared CAPAs
          <span v-if="sharedCapas.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedCapas.length }})
          </span>
        </BaseHeading>
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
        <BaseHeading :level="2" as="section-title">
          Shared Non-conformances
          <span v-if="sharedNcs.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedNcs.length }})
          </span>
        </BaseHeading>
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

    <!-- Shared Quality Events — events & observations explicitly routed to
         this supplier user. Read-only unless they hold an assignment. -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconEye :size="18" class="tw:text-primary" />
        <BaseHeading :level="2" as="section-title">
          Shared Quality Events
          <span v-if="sharedEvents.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedEvents.length }})
          </span>
        </BaseHeading>
      </div>
      <p v-if="sharedEvents.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        No quality events shared with you yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="e in sharedEvents"
          :key="e.id"
          class="tw:flex tw:items-center tw:gap-3 tw:py-2 tw:text-sm"
        >
          <a
            :href="eventHref(e)"
            class="tw:flex tw:items-center tw:gap-1.5 tw:text-on-main tw:hover:text-primary tw:flex-1"
          >
            <span class="tw:text-xs tw:text-secondary">{{ e.eventNumber }}</span>
            <span class="tw:font-medium">{{ e.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
          >
            {{ e.statusId }}
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
        <BaseHeading :level="2" as="section-title">
          Shared Records
          <span v-if="sharedRecords.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ sharedRecords.length }})
          </span>
        </BaseHeading>
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
            <span class="tw:text-xs tw:text-secondary">{{ r.recordNumber }}</span>
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
        <BaseHeading :level="2" as="section-title">
          Your Audits
          <span v-if="myAudits.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ myAudits.length }})
          </span>
        </BaseHeading>
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
