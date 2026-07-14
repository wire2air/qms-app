<script setup>
// Platform Console — Approvals. Maker-checker queue for destructive tenant ops
// (today: purge). View = support; approve/reject/cancel = admin. Separation of
// duties: the requester cannot approve their own request (enforced server-side
// and reflected here by disabling the button). Every decision is audited.
import { IconGavel, IconCheck, IconX, IconBan, IconClock } from '@tabler/icons-vue'
import { useConfirm } from '@shared/composables/useConfirm.js'
import {
  listApprovals,
  approveApproval,
  rejectApproval,
  cancelApproval,
  APPROVAL_STATUSES,
} from '@/api/platform.js'
import { hasPlatformRole, currentSession } from '@/utils/currentSession.js'
import { useStepUp } from '@/composables/useStepUp'

const { confirm } = useConfirm()
const { stepUpOpen, run, onVerified } = useStepUp()

const rows = ref([])
const loading = ref(false)
const canDecide = computed(() => hasPlatformRole('admin'))
const myId = computed(() => currentSession.value?.id)

const actionDialog = ref(false)
const pending = ref(null) // { kind: 'reject'|'cancel', row }

const columns = computed(() => {
  const cols = [
    { name: 'action', label: 'ACTION', field: 'action', align: 'left' },
    { name: 'tenant', label: 'TENANT', field: 'tenant', align: 'left', sortable: true },
    { name: 'requester', label: 'REQUESTED BY', field: 'requester', align: 'left' },
    { name: 'status', label: 'STATUS', field: 'status', align: 'left', sortable: true },
    { name: 'when', label: 'REQUESTED', field: 'requestedAt', align: 'left', sortable: true },
    { name: 'decision', label: 'DECISION', field: 'decision', align: 'left' },
  ]
  if (canDecide.value) cols.push({ name: 'actions', label: '', field: 'actions', align: 'right' })
  return cols
})
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'when', desc: true }])

function statusMeta(id) {
  return APPROVAL_STATUSES.find((s) => s.id === id) || { label: id, class: 'tw:bg-gray-100' }
}

async function load() {
  loading.value = true
  try {
    const data = await listApprovals()
    rows.value = (data?.requests || []).map((r) => ({
      id: r.id,
      action: r.action,
      status: r.status,
      requestedAt: r.requestedAt,
      executeAfter: r.executeAfter,
      reason: r.reason,
      requestedBy: r.requestedBy,
      tenant: r.company?.name || r.targetCompanyName || '—',
      tenantCode: r.company?.code || r.targetCompanyCode || '',
      requester: r.requester
        ? `${r.requester.firstName || ''} ${r.requester.lastName || ''}`.trim() || r.requester.email
        : r.requestedByEmail || '—',
      decider: r.decider
        ? `${r.decider.firstName || ''} ${r.decider.lastName || ''}`.trim() || r.decider.email
        : null,
      decidedAt: r.decidedAt,
      decisionReason: r.decisionReason,
      failureReason: r.failureReason,
    }))
  } finally {
    loading.value = false
  }
}

onMounted(load)

// SoD: the requester cannot approve their own request.
function canApprove(row) {
  return row.status === 'pending' && row.requestedBy !== myId.value
}

async function onApprove(row) {
  const ok = await confirm({
    title: 'Approve destructive action',
    message: `Approve ${row.action.replace('_', ' ')} for ${row.tenant}? This schedules the action after its cooling-off window. It can still be cancelled until it runs.`,
    okLabel: 'Approve',
    danger: true,
  })
  if (!ok) return
  await run(async () => {
    await approveApproval(row.id)
    await load()
  })
}

function openReason(kind, row) {
  pending.value = { kind, row }
  actionDialog.value = true
}

async function onReasonConfirm(reason) {
  const { kind, row } = pending.value
  if (kind === 'reject') await rejectApproval(row.id, reason)
  else await cancelApproval(row.id, reason)
  actionDialog.value = false
  await load()
}

const reasonCfg = computed(() => {
  const kind = pending.value?.kind
  if (kind === 'reject') {
    return { title: 'Reject request', confirmLabel: 'Reject', danger: true }
  }
  return { title: 'Cancel scheduled action', confirmLabel: 'Cancel action', danger: true }
})
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconGavel" title="Approvals" />

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      rowKey="id"
      :mobileCards="false"
      searchable
    >
      <template #body-cell-action="{ row }">
        <span class="tw:font-medium tw:text-on-main tw:capitalize">
          {{ row.action.replace('_', ' ') }}
        </span>
      </template>
      <template #body-cell-tenant="{ row }">
        <div class="tw:font-medium tw:text-on-main">{{ row.tenant }}</div>
        <div class="tw:font-mono tw:text-xs tw:text-secondary">{{ row.tenantCode }}</div>
      </template>
      <template #body-cell-requester="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.requester }}</span>
      </template>
      <template #body-cell-status="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold"
          :class="statusMeta(row.status).class"
        >
          {{ statusMeta(row.status).label }}
        </span>
        <div
          v-if="row.status === 'approved' && row.executeAfter"
          class="tw:mt-1 tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary"
        >
          <IconClock :size="12" /> runs {{ row.executeAfter?.formatDate('datetime') }}
        </div>
      </template>
      <template #body-cell-when="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.requestedAt?.formatDate('date') }}</span>
      </template>
      <template #body-cell-decision="{ row }">
        <div v-if="row.decider" class="tw:text-sm">
          <span class="tw:text-on-main">{{ row.decider }}</span>
          <div v-if="row.decisionReason" class="tw:text-xs tw:text-secondary">
            {{ row.decisionReason }}
          </div>
          <div v-if="row.failureReason" class="tw:text-xs tw:text-red-600">
            {{ row.failureReason }}
          </div>
        </div>
        <span v-else class="tw:text-secondary tw:text-sm">—</span>
      </template>

      <template #body-cell-actions="{ row }">
        <div v-if="canDecide" class="tw:flex tw:justify-end tw:gap-1" @click.stop>
          <template v-if="row.status === 'pending'">
            <BaseTooltip
              v-if="!canApprove(row)"
              text="You can't approve your own request (separation of duties)"
            >
              <BaseButton variant="secondary" size="sm" disabled>
                <template #icon><IconCheck :size="16" /></template>
                Approve
              </BaseButton>
            </BaseTooltip>
            <BaseButton v-else variant="primary" size="sm" @click="onApprove(row)">
              <template #icon><IconCheck :size="16" /></template>
              Approve
            </BaseButton>
            <BaseButton variant="danger" size="sm" @click="openReason('reject', row)">
              <template #icon><IconX :size="16" /></template>
              Reject
            </BaseButton>
          </template>
          <BaseButton
            v-else-if="row.status === 'approved'"
            variant="danger"
            size="sm"
            @click="openReason('cancel', row)"
          >
            <template #icon><IconBan :size="16" /></template>
            Cancel
          </BaseButton>
          <span v-else class="tw:text-secondary tw:text-sm">—</span>
        </div>
      </template>
    </DataTable>

    <CredentialActionDialog
      v-model="actionDialog"
      :title="reasonCfg.title"
      :confirmLabel="reasonCfg.confirmLabel"
      :danger="reasonCfg.danger"
      :description="
        pending
          ? `${reasonCfg.title} for ${pending.row.tenant}. A reason is recorded in the audit log.`
          : ''
      "
      @confirm="onReasonConfirm"
    />

    <StepUpDialog v-model="stepUpOpen" @verified="onVerified" />
  </BasePage>
</template>
