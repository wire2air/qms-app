<script setup>
/**
 * /<companyCode>/supplier — landing page for EXTERNAL_SUPPLIER users.
 *
 * Phase B.6: three live lists driven by SharedWithUser (live query
 * filtered to the current user's userId), plus the Asset Requests
 * placeholder (Phase C wires that one).
 *
 * Visibility is doubly enforced: the SharedWithUser query scopes "what's
 * shared with me", and the per-entity SELECT RLS extension (B.2) makes
 * the entity itself visible only when the shared row exists. An internal
 * user landing here (e.g. impersonating) would see only what's explicitly
 * shared with them too — the page is supplier-shaped but not
 * supplier-only.
 */
import {
  IconFileText,
  IconAlertTriangle,
  IconClipboardList,
  IconUpload,
  IconShieldCheck,
  IconExternalLink,
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
  { initial: [] },
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
  { initial: [] },
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
  { initial: [] },
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
  { initial: [] },
)

function docHref(d) {
  return getCompanyPath(`documents/${d.id}`)
}
function capaHref(c) {
  return getCompanyPath(`capas/${c.id}`)
}
function ncHref(n) {
  return getCompanyPath(`nonconformances/${n.id}`)
}
</script>

<template>
  <div class="tw:p-5 tw:max-w-5xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-3">
      <IconShieldCheck :size="28" class="tw:text-primary tw:shrink-0" />
      <div>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-main">Welcome, {{ firstName }}</h1>
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
            <span class="tw:font-mono tw:text-xs tw:text-secondary">{{ d.docNumber }}</span>
            <span class="tw:font-medium">{{ d.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
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
            <span class="tw:font-mono tw:text-xs tw:text-secondary">{{ c.capaNumber }}</span>
            <span class="tw:font-medium">{{ c.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
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
            <span class="tw:font-mono tw:text-xs tw:text-secondary">{{ n.ncNumber }}</span>
            <span class="tw:font-medium">{{ n.title }}</span>
            <IconExternalLink :size="12" class="tw:text-secondary" />
          </a>
          <span
            class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
          >
            {{ n.statusId }}
          </span>
        </li>
      </ul>
    </section>

    <!-- Asset Requests (placeholder — Phase C wires this) -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-2">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconUpload :size="18" class="tw:text-primary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">Asset Requests</h2>
      </div>
      <p class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        Document requests from the client (certifications, licenses, insurance) — Phase C wires
        this into the redesigned asset request flow.
      </p>
    </section>
  </div>
</template>
