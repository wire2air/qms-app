<script setup>
import { IconLink, IconLinkOff, IconFilePlus, IconFileDescription } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  supplierId: {
    type: String,
    required: true,
  },
})

const canUpdate = computed(() => isAllowed(['supplier_management:update']))

// ─── Live queries ─────────────────────────────────────────────────────────────

// Shares are per-USER grants (`SharedWithUser`), not per-supplier token rows.
// Group them by document so the tab still reads as "documents this supplier
// has", with the recipients listed underneath.
const sharedDocs = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    const users = (await db.User.where().exec()).filter(
      (u) => u.supplierId === supplierId && u.kind === 'EXTERNAL_SUPPLIER',
    )
    if (!users.length) return []
    const nameById = new Map(
      users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email]),
    )

    // Query per user on the [userId+entityType] compound index. `entityType`
    // alone is NOT indexed — the model's indexes are [entityType+entityId],
    // userId, [userId+entityType], companyId — so where('entityType', …)
    // silently returns nothing.
    const perUser = await Promise.all(
      users.map((u) => db.SharedWithUser.where('[userId+entityType]', [u.id, 'Document']).exec()),
    )
    const rows = perUser.flat()

    const byDocument = new Map()
    for (const row of rows) {
      if (!byDocument.has(row.entityId)) byDocument.set(row.entityId, [])
      byDocument.get(row.entityId).push(row)
    }

    const entries = await Promise.all(
      [...byDocument.entries()].map(async ([documentId, shares]) => ({
        documentId,
        document: await db.Document.findByPk(documentId),
        shares,
        recipients: [...new Set(shares.map((s) => nameById.get(s.userId)).filter(Boolean))],
        // A cascade grant exists because a shared document cites this one.
        // Showing it plainly is the point: the admin should be able to see the
        // supplier's full reach, not just what was clicked.
        viaReference: shares.every((s) => s.grantedVia === 'REFERENCE'),
        sourceIds: [...new Set(shares.map((s) => s.sourceEntityId).filter(Boolean))],
      })),
    )

    // Resolve the citing document's title so the label names it.
    for (const entry of entries) {
      if (!entry.viaReference || !entry.sourceIds.length) continue
      const source = await db.Document.findByPk(entry.sourceIds[0])
      entry.sourceLabel = source ? source.docNumber || source.title : null
    }

    // Directly-shared documents first; cascade grants read as their dependants.
    return entries.sort((a, b) => Number(a.viaReference) - Number(b.viaReference))
  },

  { models: ['SharedWithUser', 'User', 'Document'], initial: [] },
)

// ─── Share document ──────────────────────────────────────────────────────────

const showShareDialog = ref(false)

// ─── Remove document ──────────────────────────────────────────────────────────

const { confirm } = useConfirm()

async function onRemoveDocument(entry) {
  const base = `Revoke access for ${entry.recipients.length} portal user(s)? They will no longer see this document in the supplier portal.`
  // Revoking a cascade grant while its citing document stays shared is a
  // deliberate override — say so, because the result is a document the
  // supplier can read that cites one they cannot.
  const message = entry.viaReference
    ? `${base}\n\nThis access was granted automatically because ${entry.sourceLabel || 'a shared document'} references it. Revoking leaves that document citing a procedure the supplier cannot open.`
    : `${base}\n\nDocuments shared only because this one references them are revoked with it.`

  const ok = await confirm({
    title: 'Unshare Document',
    message,
    okLabel: 'Unshare',
    danger: true,
  })
  if (!ok) return
  // Soft-delete every grant for this document — revocation is per-row, and
  // the audit trail keeps the withdrawal because deletedAt is tracked.
  for (const share of entry.shares) await share.delete()
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconLink :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-semibold tw:text-on-main">Shared Documents</h3>
        <span
          v-if="sharedDocs.length"
          class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-gray-200 tw:text-gray-700 tw:px-2 tw:py-0.5 tw:text-micro tw:font-bold"
        >
          {{ sharedDocs.length }}
        </span>
      </div>
      <BaseButton v-if="canUpdate" variant="outline" @click="showShareDialog = true">
        <IconFilePlus :size="16" />
        <span>Share Document</span>
      </BaseButton>
    </div>

    <div v-if="sharedDocs.length" class="tw:divide-y tw:divide-divider">
      <div
        v-for="entry in sharedDocs"
        :key="entry.documentId"
        class="tw:p-4 tw:flex tw:items-center tw:gap-4 tw:hover:bg-main-hover tw:transition-colors"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconFileDescription :size="20" class="tw:text-primary" />
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <p class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
            <template v-if="entry.document">
              {{ entry.document.docNumber }} — {{ entry.document.title || 'Document' }}
            </template>
            <template v-else>Document</template>
          </p>
          <p class="tw:mt-0.5 tw:truncate tw:text-caption tw:text-secondary">
            Shared with {{ entry.recipients.join(', ') }}
          </p>
        </div>
        <span
          v-if="entry.viaReference"
          class="tw:shrink-0 tw:rounded-full tw:bg-main-hover tw:px-2 tw:py-0.5 tw:text-caption tw:text-secondary"
          :title="
            entry.sourceLabel
              ? `Granted automatically because ${entry.sourceLabel} references it`
              : 'Granted automatically because a shared document references it'
          "
        >
          Referenced<template v-if="entry.sourceLabel"> by {{ entry.sourceLabel }}</template>
        </span>
        <button
          v-if="canUpdate"
          class="tw:p-1.5 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
          title="Unshare document"
          @click="onRemoveDocument(entry)"
        >
          <IconLinkOff :size="16" />
        </button>
      </div>
    </div>

    <BaseEmptyState
      v-else
      :icon="IconLinkOff"
      title="No documents shared with this supplier."
      description="Shared documents appear in the supplier portal for the users you grant access to."
    />
  </div>

  <!-- Share Document Dialog -->
  <SuppliersShareDocumentDialog v-model="showShareDialog" :supplierId="props.supplierId" />

</template>
