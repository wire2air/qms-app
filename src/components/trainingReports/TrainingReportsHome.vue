<script setup>
/**
 * Matrix Report — a flat, auditor-friendly view of every training assignment:
 * one row per employee × training with roles, status, completion date, and
 * type (standard vs ad-hoc + reason). Filterable by site / department / role /
 * user / status / completion date range; exportable to CSV and printable via
 * the shared print-module system. Data + filtering live in
 * useTrainingMatrixReport so the print module stays in sync.
 */
import { IconChartBar, IconDownload, IconPrinter } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { useTrainingMatrixReport } from '@/composables/useTrainingMatrixReport.js'

const search = ref('')
const statusFilter = ref('all')
const siteId = ref(null)
const departmentId = ref(null)
const roleId = ref(null)
const userId = ref(null)
// Single range control ({ start, end }) instead of two from/to fields.
const dateRange = ref(null)

const STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'FAILED', 'RETRAIN_REQUIRED']

const getFilters = () => ({
  search: search.value,
  status: statusFilter.value,
  siteId: siteId.value,
  departmentId: departmentId.value,
  roleId: roleId.value,
  userId: userId.value,
  from: dateRange.value?.start?.toISODate?.() || '',
  to: dateRange.value?.end?.toISODate?.() || '',
})
const { rows } = useTrainingMatrixReport(getFilters)

function resetFilters() {
  search.value = ''
  statusFilter.value = 'all'
  siteId.value = null
  departmentId.value = null
  roleId.value = null
  userId.value = null
  dateRange.value = null
}

const HEADERS = ['Employee', 'Roles', 'Training', 'Status', 'Completed', 'Type', 'Ad-hoc reason']
function exportCsv() {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [HEADERS.join(',')]
  for (const r of rows.value) {
    lines.push(
      [r.employee, r.roles, r.training, r.status, r.completedAt, r.type, r.reason].map(esc).join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'training-matrix-report.csv'
  link.click()
  URL.revokeObjectURL(url)
}

// Print via the shared /print?module=TrainingMatrix route so the printed view
// carries the same filters the user is looking at.
function printReport() {
  const params = new URLSearchParams({ module: 'TrainingMatrix' })
  if (search.value) params.set('search', search.value)
  if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
  if (siteId.value) params.set('site', siteId.value)
  if (departmentId.value) params.set('department', departmentId.value)
  if (roleId.value) params.set('role', roleId.value)
  if (userId.value) params.set('user', userId.value)
  if (dateRange.value?.start?.toISODate) params.set('from', dateRange.value.start.toISODate())
  if (dateRange.value?.end?.toISODate) params.set('to', dateRange.value.end.toISODate())
  window.open(getCompanyPath(`/print?${params.toString()}`), '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconChartBar" title="Matrix Report">
      <template #actions>
        <BaseButton variant="outline" size="sm" @click="exportCsv">
          <IconDownload :size="14" class="tw:mr-1" /> Export CSV
        </BaseButton>
        <BaseButton variant="outline" size="sm" @click="printReport">
          <IconPrinter :size="14" class="tw:mr-1" /> Print
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Filters -->
    <PageSection title="Filters">
      <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-4 tw:gap-3">
        <div>
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Search</label>
          <BaseTextInput v-model="search" placeholder="Employee, training…" size="sm" />
        </div>
        <div>
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Status</label>
          <BaseSelect
            v-model="statusFilter"
            :options="[{ id: 'all', name: 'All statuses' }, ...STATUSES.map((s) => ({ id: s, name: s }))]"
            optionLabel="name"
            optionValue="id"
          />
        </div>
        <div>
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Site</label>
          <SiteSelectMenu v-model="siteId" nullLabel="All sites" />
        </div>
        <div>
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Department</label>
          <DepartmentSelectMenu v-model="departmentId" :siteId="siteId" nullLabel="All departments" />
        </div>
        <div>
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Role</label>
          <RoleSelectMenu v-model="roleId" nullLabel="All roles" />
        </div>
        <div>
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Employee</label>
          <UserSelectMenu v-model="userId" nullLabel="All employees" />
        </div>
        <div class="tw:sm:col-span-2">
          <label class="tw:text-xs tw:font-medium tw:text-secondary tw:mb-1 tw:block">Completed</label>
          <BaseDateField v-model="dateRange" mode="range" :clearable="true" placeholder="Any date" />
        </div>
      </div>
      <div class="tw:mt-3">
        <BaseButton variant="ghost" size="sm" @click="resetFilters">Clear filters</BaseButton>
      </div>
    </PageSection>

    <PageSection :title="`Training Matrix — ${rows.length} record${rows.length === 1 ? '' : 's'}`">
      <div class="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-divider">
        <table class="tw:w-full tw:border-collapse tw:text-sm">
          <thead>
            <tr class="tw:bg-main-hover/50 tw:text-left">
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Employee</th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Roles</th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Training</th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Status</th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Completed</th>
              <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Type</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.id"
              class="tw:border-t tw:border-divider tw:hover:bg-gray-50"
            >
              <td class="tw:px-3 tw:py-2 tw:text-on-main tw:whitespace-nowrap">{{ r.employee }}</td>
              <td class="tw:px-3 tw:py-2 tw:text-secondary">{{ r.roles || '—' }}</td>
              <td class="tw:px-3 tw:py-2">
                <RouterLink
                  v-if="r.trainingId"
                  :to="getCompanyPath(`/trainings/${r.trainingId}`)"
                  class="tw:text-primary tw:hover:underline"
                >
                  {{ r.training }}
                </RouterLink>
                <span v-else class="tw:text-on-main">{{ r.training }}</span>
              </td>
              <td class="tw:px-3 tw:py-2">
                <TrainingAssigneeStatusBadgeById :statusId="r.status" />
              </td>
              <td class="tw:px-3 tw:py-2 tw:text-secondary tw:whitespace-nowrap">
                {{ r.completedAt || '—' }}
              </td>
              <td class="tw:px-3 tw:py-2 tw:text-secondary">
                {{ r.type }}
                <span v-if="r.reason" class="tw:text-xs tw:text-secondary/80"> — {{ r.reason }}</span>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="tw:px-3 tw:py-6 tw:text-center tw:text-secondary tw:italic">
                No training records match the filters.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageSection>
  </BasePage>
</template>
