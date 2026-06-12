<script setup>
import {
  IconMailCheck,
  IconStar,
  IconCircleOff,
  IconCircleCheck,
  IconTrash,
  IconListDetails,
} from '@tabler/icons-vue'

const props = defineProps({
  channels: { type: Array, default: () => [] },
})

const emit = defineEmits(['verify', 'setup', 'makeDefault', 'setState', 'delete'])

const CONNECTION_TYPE_LABELS = {
  SYSTEM: 'System address',
  FORWARDING: 'Forwarding',
}

const columns = [
  { name: 'address', label: 'ADDRESS', field: 'address', align: 'left', sortable: true },
  { name: 'name', label: 'NAME', field: 'name', align: 'left', sortable: true },
  {
    name: 'channelType',
    label: 'CONNECTION TYPE',
    field: 'channelType',
    align: 'left',
    sortable: false,
  },
  { name: 'status', label: 'STATUS', field: 'verificationStatus', align: 'left' },
  { name: 'updatedAt', label: 'UPDATED', field: 'updatedAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'address',
  descending: false,
  total: null,
})

function rowMenuItems(row) {
  const items = []
  if (row.channelType === 'FORWARDING') {
    items.push({
      name: 'Setup instructions',
      icon: IconListDetails,
      click: () => emit('setup', row),
    })
    if (row.verificationStatus !== 'VERIFIED') {
      items.push({ name: 'Verify', icon: IconMailCheck, click: () => emit('verify', row) })
    }
  }
  if (!row.isDefault && row.verificationStatus === 'VERIFIED' && row.stateId === 'ACTIVE') {
    items.push({ name: 'Make default', icon: IconStar, click: () => emit('makeDefault', row) })
  }
  if (!row.isDefault) {
    items.push(
      row.stateId === 'ACTIVE'
        ? { name: 'Disable', icon: IconCircleOff, click: () => emit('setState', row, 'INACTIVE') }
        : { name: 'Enable', icon: IconCircleCheck, click: () => emit('setState', row, 'ACTIVE') },
    )
  }
  if (props.channels.length > 1) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
}
</script>

<template>
  <BaseTable v-model:pagination="pagination" :rows="channels" :columns="columns" rowKey="id">
    <template #body-cell-address="{ row }">
      <div class="tw:flex tw:flex-col tw:gap-0.5">
        <span class="tw:text-sm tw:font-mono tw:font-medium">{{ row.address }}</span>
        <div class="tw:flex tw:items-center tw:gap-1">
          <BaseBadge v-if="row.isDefault" class="tw:bg-amber-100 tw:text-amber-700 tw:text-[10px]">
            Default
          </BaseBadge>
          <span
            v-if="row.channelType === 'FORWARDING'"
            class="tw:text-[11px] tw:text-secondary tw:font-mono"
            :title="`Forwarding target: ${row.inboundAddress}`"
          >
            → {{ row.inboundAddress }}
          </span>
        </div>
      </div>
    </template>

    <template #body-cell-name="{ row }">
      <span class="tw:text-sm">{{ row.name || '—' }}</span>
    </template>

    <template #body-cell-channelType="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        {{ CONNECTION_TYPE_LABELS[row.channelType] || row.channelType }}
      </span>
    </template>

    <template #body-cell-status="{ row }">
      <EmailVerificationStatusBadge
        :verificationStatus="row.verificationStatus"
        :stateId="row.stateId"
      />
    </template>

    <template #body-cell-updatedAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        {{ row.updatedAt?.formatDate?.('date') ?? '—' }}
      </span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="rowMenuItems(row).length" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </BaseTable>
</template>
