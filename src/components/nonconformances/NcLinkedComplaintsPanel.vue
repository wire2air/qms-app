<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Complaints this NC was raised from — self-hides when it has none.
 *
 * Reads record_links (2026-08-17). It used to read nc_source_links, a second
 * table recording the same fact: both convert-to-NC controllers wrote a row to
 * each, in the same loop. Two tables for one idea can only diverge, so the
 * duplicate is gone and the generic one — which already carries every other
 * lineage edge in the system — is the single source.
 *
 * It also fixes a real bug. nc_source_links stamped BOTH complaint kinds as
 * source_type 'CUSTOMER_COMPLAINT', so a QMS `Complaint` id was looked up in
 * the customer_complaints table and silently dropped. record_links gives each
 * kind its own fromType, so both resolve and link to the right page.
 */
const props = defineProps({
  ncId: { type: String, required: true },
})

const COMPLAINT_TYPES = new Set(['Complaint', 'CustomerComplaint'])

const links = useLiveQueryWithDeps(
  [() => props.ncId],
  async (db, [ncId]) => {
    if (!ncId) return []
    const rows = await db.RecordLink.where('[toType+toId]', ['Nonconformance', ncId]).exec()
    return rows.filter((l) => COMPLAINT_TYPES.has(l.fromType))
  },
  { models: ['RecordLink'], initial: [] },
)

// Keyed by type as well as id — the two complaint kinds live in different
// tables, so a bare id list could not tell us which one to load.
const linkKey = computed(() => links.value.map((l) => `${l.fromType}:${l.fromId}`).join(','))

const complaints = useLiveQueryWithDeps(
  [() => linkKey.value],
  async (db, [key]) => {
    if (!key) return []
    const rows = await Promise.all(
      key.split(',').map(async (entry) => {
        const [type, id] = entry.split(':')
        const row =
          type === 'CustomerComplaint'
            ? await db.CustomerComplaint.findByPk(id)
            : await db.Complaint.findByPk(id)
        return row ? { row, type } : null
      }),
    )
    return rows.filter(Boolean)
  },
  { models: ['CustomerComplaint', 'Complaint'], initial: [] },
)
</script>

<template>
  <div v-if="links.length" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
    <BaseText variant="overline" class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
      Linked Complaints
    </BaseText>
    <div class="tw:flex tw:flex-col tw:gap-2">
      <RouterLink
        v-for="entry in complaints"
        :key="entry.row.id"
        :to="
          getCompanyPath(
            entry.type === 'CustomerComplaint'
              ? `/customer-complaints/${entry.row.id}`
              : `/complaints/${entry.row.id}`,
          )
        "
        class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
      >
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
          <span class="tw:text-xs tw:text-secondary">{{ entry.row.complaintNumber }}</span>
          <span class="tw:text-sm tw:font-medium tw:truncate">{{ entry.row.subject }}</span>
        </div>
        <CustomerComplaintStatusBadgeById
          v-if="entry.type === 'CustomerComplaint'"
          :statusId="entry.row.statusId"
        />
        <ComplaintStatusBadgeById v-else :statusId="entry.row.statusId" />
      </RouterLink>
    </div>
  </div>
</template>
