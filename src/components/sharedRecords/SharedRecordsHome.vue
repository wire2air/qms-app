<script setup>
/**
 * Shared records — every external share link in the company, in one place.
 *
 * The per-record rail card answers "who can read THIS NC". It cannot answer the
 * questions an administrator actually has: what is outstanding across every
 * module, has this address been given access to anything else, has anyone
 * outside actually opened what we sent. That is what this page is for.
 *
 * ── It is not "admin sees everything" by fiat ───────────────────────────────
 * Rows are filtered by RLS: `record_share_links` inherits the visibility of the
 * record it points at. A tenant-scoped administrator therefore sees the whole
 * company; a site-scoped user sees the shares on records they could open
 * anyway. The page adds no gate of its own beyond needing `manage_access`
 * somewhere, because a second gate here would be a different answer to a
 * question the matrix has already answered.
 *
 * ── Polymorphic, addressed like tasks ───────────────────────────────────────
 * One list covers every shareable record kind. `RECORD_REF` already maps an
 * entity type to its model, number field and detail route, so the record column
 * resolves through the registry instead of a switch that would have to be
 * extended every time a module becomes shareable.
 */
import { IconShare } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers'
import { RECORD_REF } from '@/utils/recordRef.js'
import { SHAREABLE_ENTITIES } from '@/utils/shareableEntities.js'
import { shareLinkStatus, SHARE_LINK_STATUS_LABELS } from '@/utils/shareLinkStatus.js'

const links = useLiveQuery((db) => db.RecordShareLink.where().orderBy('createdAt', 'desc').exec(), {
  models: ['RecordShareLink'],
  initial: [],
})

const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })

/**
 * The records the links point at, one query per entity type present.
 *
 * Loaded so a link can be searched and read by its human reference ("NC-001")
 * rather than the uuid the row actually stores — nobody searches by uuid, and
 * an admin looking for "that complaint we sent the customer" has the number.
 */
const recordsByType = useLiveQueryWithDeps(
  [() => (links.value || []).map((l) => l.entityType).join(',')],
  async (db, [types]) => {
    const out = {}
    for (const type of new Set(types ? types.split(',') : [])) {
      const cfg = RECORD_REF[type]
      if (!cfg || !db[cfg.model]) continue
      out[type] = await db[cfg.model].where().exec()
    }
    return out
  },
  { models: Object.values(RECORD_REF).map((c) => c.model), initial: {} },
)

const viewCounts = useLiveQuery(
  async (db) => {
    const rows = await db.RecordShareLinkView.where().exec()
    const byLink = {}
    for (const v of rows) (byLink[v.shareLinkId] ||= []).push(v)
    return byLink
  },
  { models: ['RecordShareLinkView'], initial: {} },
)

function userName(id) {
  const u = (users.value || []).find((x) => x.id === id)
  if (!u) return null
  return `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
}

const rows = computed(() =>
  (links.value || []).map((link) => {
    const cfg = RECORD_REF[link.entityType]
    const record = (recordsByType.value?.[link.entityType] || []).find(
      (r) => r.id === link.entityId,
    )
    const views = viewCounts.value?.[link.id] || []
    return {
      id: link.id,
      link,
      entityType: link.entityType,
      entityLabel: SHAREABLE_ENTITIES[link.entityType] || link.entityType,
      reference: (cfg?.numberField ? record?.[cfg.numberField] : null) || null,
      recordTitle: record?.title || record?.subject || null,
      to: cfg?.path ? getCompanyPath(cfg.path(link.entityId)) : null,
      email: link.email,
      // A rule-sent link and a person-sent link are not the same act, and only
      // one of them has somebody to ask about it.
      origin: link.origin === 'NOTIFICATION' ? 'Rule' : 'Person',
      sharedBy: userName(link.createdBy),
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      lastViewedAt: link.lastViewedAt,
      viewCount: views.length || link.viewCount || 0,
      statusId: shareLinkStatus(link),
      // The label is what search and CSV export read; the badge renders itself.
      status: SHARE_LINK_STATUS_LABELS[shareLinkStatus(link)],
      entityId: link.entityId,
    }
  }),
)

const list = useListLayout({
  total: () => rows.value.length,
  loading: () => links.value === undefined,
  empty: () => rows.value.length === 0,
  syncUrl: false,
})

const selected = ref(null)

const toast = useToast()
const confirmWithdraw = ref({ open: false, rows: [] })

function askWithdraw(rows) {
  confirmWithdraw.value = { open: true, rows }
}

/**
 * Withdraw several links.
 *
 * Sequential rather than parallel: each revoke is its own permission check
 * against its own record, and a burst of them races the same session through
 * the same rate limiter for no gain — nobody is withdrawing hundreds at once.
 *
 * Failures are counted, not swallowed. A partial result is the realistic
 * outcome when a selection spans records with different scopes, and reporting
 * "12 withdrawn" when three of them failed would leave somebody believing
 * access was removed when it is still live.
 */
async function withdrawSelected() {
  const rows = confirmWithdraw.value.rows
  let done = 0
  const failed = []
  for (const row of rows) {
    try {
      await post(`/v1/services/recordShareLinks/${row.id}/revoke`, {}, { showError: false })
      done += 1
    } catch {
      failed.push(row.email)
    }
  }

  if (done) {
    toast.success(`Access withdrawn for ${done} ${done === 1 ? 'link' : 'links'}.`)
  }
  if (failed.length) {
    toast.error(
      `Could not withdraw ${failed.length}: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`,
    )
  }
  confirmWithdraw.value = { open: false, rows: [] }
}
</script>

<template>
  <BaseListLayout
    title="Shared Records"
    :icon="IconShare"
    subtitle="External links to company records: who has access, who has opened it, and what can be withdrawn. You see shares on records you can read."
    :state="list.state.value"
    :emptyIcon="IconShare"
    emptyTitle="Nothing has been shared externally"
    emptyDescription="Links created from a record's Share card appear here."
  >
    <SharedRecordsTable :rows="rows" @open="selected = $event" @bulkWithdraw="askWithdraw" />

    <SharedRecordDetailDialog v-if="selected" :row="selected" @close="selected = null" />

    <!-- Named, not counted. Withdrawing access is irreversible — restoring it
         means minting a fresh link — so the confirmation says WHO loses it. -->
    <BaseConfirmDialog
      v-model="confirmWithdraw.open"
      title="Withdraw access"
      :message="`${confirmWithdraw.rows.length} ${confirmWithdraw.rows.length === 1 ? 'person' : 'people'} lose access immediately: ${confirmWithdraw.rows
        .slice(0, 5)
        .map((r) => r.email)
        .join(', ')}${confirmWithdraw.rows.length > 5 ? `, and ${confirmWithdraw.rows.length - 5} more` : ''}. Their links stop working at once, including any files already open. Sharing again creates a new link.`"
      okLabel="Withdraw"
      @ok="withdrawSelected"
    />
  </BaseListLayout>
</template>
