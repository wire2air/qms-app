<script setup>
/**
 * Auditee — certification audits, where WE are being audited.
 *
 * The registrar schedules the audit, sends an agenda, runs the visit, and
 * issues reports; the company's job is to track it: who's coming, when, what
 * they found, and whether the CAPAs closing those findings are done. That's
 * a different job from RUNNING an audit, which is why this lives beside the
 * Auditor module instead of inside it.
 */
import { IconBuildingBank, IconPlus } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'

const router = useRouter()

const canCreate = computed(() => isAllowed(['audit_management:create']))

const audits = useLiveQuery(
  async (db) => {
    const rows = await db.AuditInstance.where().exec()
    return rows
      .filter((a) => a.programTypeId === 'EXTERNAL')
      .sort(
        (a, b) =>
          (b.scheduledDate?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0) -
          (a.scheduledDate?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0),
      )
  },
  { models: ['AuditInstance'], initial: [] },
)

const standards = useLiveQuery((db) => db.AuditStandard.where().exec(), {
  models: ['AuditStandard'],
  initial: [],
})
const standardName = computed(() => {
  const m = {}
  for (const s of standards.value) m[s.id] = s.name
  return m
})

const showCreateDialog = ref(false)

const columns = [
  { name: 'auditNumber', label: 'Audit', field: 'auditNumber', align: 'left', sortable: true },
  { name: 'firm', label: 'Auditing Body', field: 'externalAuditFirm', align: 'left' },
  { name: 'standard', label: 'Standard', field: 'auditStandardId', align: 'left' },
  { name: 'status', label: 'Status', field: 'statusId', align: 'left' },
  {
    name: 'scheduledDate',
    label: 'Scheduled',
    field: 'scheduledDate',
    align: 'left',
    sortable: true,
    filterType: 'date',
  },
]

function openAudit(row) {
  router.push(getCompanyPath(`/auditee/${row.id}`))
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconBuildingBank"
      title="Auditee"
      subtitle="External audits — ISO certification, FDA inspection, customer audit — where the company is being audited."
    >
      <template #title>
        <span class="tw:inline-flex tw:items-center tw:gap-1.5">
          Auditee
          <HelpButton slug="KB/quality/audits-auditee" :size="16" />
        </span>
      </template>
      <template #actions>
        <BaseButton v-if="canCreate" size="sm" @click="showCreateDialog = true">
          <template #icon><IconPlus :size="16" /></template>
          New External Audit
        </BaseButton>
      </template>
    </PageHeader>

    <DataTable
      :rows="audits"
      :columns="columns"
      rowKey="id"
      :loading="false"
      noDataLabel="No external audits yet. When an auditing body schedules one, create it here to track the agenda, reports and findings."
      @rowClick="openAudit"
    >
      <template #body-cell-firm="{ row }">
        <span v-if="row.externalAuditFirm" class="tw:text-sm">
          {{ row.externalAuditFirm
          }}<span v-if="row.externalAuditorName" class="tw:text-secondary">
            · {{ row.externalAuditorName }}</span
          >
        </span>
        <span v-else class="tw:text-sm tw:text-secondary">—</span>
      </template>
      <template #body-cell-standard="{ row }">
        <span class="tw:text-sm">{{ standardName[row.auditStandardId] || '—' }}</span>
      </template>
      <template #body-cell-status="{ row }">
        <AuditInstanceStatusBadgeById :statusId="row.statusId" />
      </template>
      <template #body-cell-scheduledDate="{ row }">
        {{ row.scheduledDate ? row.scheduledDate.formatDate('date') : '—' }}
      </template>
    </DataTable>

    <AuditeeCreateDialog v-model="showCreateDialog" />
  </BasePage>
</template>
