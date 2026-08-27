<script setup>
/**
 * The shared-records list.
 *
 * Search is the point of this page, so every column an administrator would
 * search by is a real column with a real value behind it: the recipient
 * address, the record's number, the record kind, the status. DataTable's own
 * search covers all of them at once, which is why there is no bespoke search
 * box here.
 *
 * Withdrawn and expired links stay in the list. "This was shared and then
 * withdrawn" is exactly the history an auditor asks about, and hiding it would
 * make the page answer a narrower question than the one it exists for.
 */
import { IconHistory, IconBan } from '@tabler/icons-vue'
import { SHAREABLE_ENTITIES } from '@/utils/shareableEntities.js'
import { SHARE_LINK_STATUS_LABELS } from '@/utils/shareLinkStatus.js'

const props = defineProps({
  rows: { type: Array, default: () => [] },
})

const emit = defineEmits(['open', 'bulkWithdraw'])

const selected = ref([])
const selectedRows = computed(() => props.rows.filter((r) => selected.value.includes(r.id)))

/**
 * Only live links can be withdrawn.
 *
 * A selection will routinely include expired and already-withdrawn rows —
 * they stay in the list on purpose — so the action works on the withdrawable
 * subset and SAYS how many that is. Silently acting on fewer rows than the
 * user selected is how somebody concludes a link was revoked when it never
 * was; disabling the button whenever the selection is impure would be just as
 * bad, since "3 of 8" is the normal case here.
 */
const withdrawable = computed(() => selectedRows.value.filter((r) => r.statusId === 'ACTIVE'))

const columns = computed(() => [
  {
    name: 'record',
    label: 'RECORD',
    field: 'reference',
    align: 'left',
    sortable: true,
    hideable: false,
  },
  {
    name: 'entityLabel',
    label: 'TYPE',
    field: 'entityLabel',
    align: 'left',
    sortable: true,
    filterType: 'select',
    // Filter on the LABEL, since that is what the column renders and exports.
    filterOptions: Object.values(SHAREABLE_ENTITIES).map((label) => ({ value: label, label })),
  },
  { name: 'email', label: 'SHARED WITH', field: 'email', align: 'left', sortable: true },
  {
    name: 'status',
    label: 'STATUS',
    field: 'status',
    align: 'left',
    sortable: true,
    filterType: 'select',
    filterOptions: Object.values(SHARE_LINK_STATUS_LABELS).map((s) => ({ value: s, label: s })),
  },
  { name: 'viewCount', label: 'OPENED', field: 'viewCount', align: 'right', sortable: true },
  {
    name: 'lastViewedAt',
    label: 'LAST OPENED',
    field: 'lastViewedAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  { name: 'sharedBy', label: 'SHARED BY', field: 'sharedBy', align: 'left', sortable: true },
  {
    name: 'createdAt',
    label: 'SHARED ON',
    field: 'createdAt',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
  { name: 'expiresAt', label: 'EXPIRES', field: 'expiresAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
])

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

/**
 * One entry, not two.
 *
 * Withdrawing is done from the detail view rather than from a row menu: it ends
 * somebody's access, and the thing worth seeing first is whether they ever used
 * it. A one-click revoke in a list is how the wrong row gets picked.
 */
function rowMenuItems(row) {
  return [{ name: 'Access history', icon: IconHistory, click: () => emit('open', row) }]
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    v-model:selected="selected"
    :rows="props.rows"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    selectable
    filterable
    exportManager
    exportFilename="shared-records.csv"
    persistKey="sharedRecords"
  >
    <template #bulk-actions="{ clear }">
      <BaseButton
        variant="danger"
        size="sm"
        :disabled="!withdrawable.length"
        @click="
          () => {
            emit('bulkWithdraw', withdrawable)
            clear()
          }
        "
      >
        <template #icon><IconBan :size="16" /></template>
        Withdraw access
        <span v-if="withdrawable.length !== selectedRows.length">
          ({{ withdrawable.length }} of {{ selectedRows.length }})
        </span>
      </BaseButton>

      <BaseText v-if="!withdrawable.length" color="secondary" class="tw:text-sm">
        Nothing selected is still active.
      </BaseText>
    </template>

    <template #body-cell-record="{ row }">
      <RouterLink
        v-if="row.to"
        :to="row.to"
        class="tw:font-medium tw:text-on-main tw:hover:text-primary"
      >
        {{ row.reference || 'Open record' }}
      </RouterLink>
      <BaseText v-else color="secondary">{{ row.reference || '—' }}</BaseText>
      <BaseText v-if="row.recordTitle" color="secondary" class="tw:block tw:text-xs tw:truncate">
        {{ row.recordTitle }}
      </BaseText>
    </template>

    <template #body-cell-status="{ row }">
      <ShareLinkStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-viewCount="{ row }">
      <!-- Never opened is a real answer, and a different one from zero views on
           a link nobody has withdrawn yet. -->
      <BaseText v-if="row.viewCount" class="tw:text-sm">{{ row.viewCount }}</BaseText>
      <BaseText v-else color="secondary" class="tw:text-sm">Never</BaseText>
    </template>

    <template #body-cell-lastViewedAt="{ row }">
      {{ row.lastViewedAt ? row.lastViewedAt.formatDate('datetime') : '—' }}
    </template>

    <template #body-cell-createdAt="{ row }">
      {{ row.createdAt ? row.createdAt.formatDate('date') : '—' }}
    </template>

    <template #body-cell-expiresAt="{ row }">
      {{ row.expiresAt ? row.expiresAt.formatDate('date') : '—' }}
    </template>

    <template #body-cell-sharedBy="{ row }">
      <BaseText v-if="row.sharedBy" class="tw:text-sm">{{ row.sharedBy }}</BaseText>
      <BaseText v-else color="secondary" class="tw:text-sm">{{ row.origin }}</BaseText>
    </template>

    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
