<script setup>
/**
 * Training Matrix report print module.
 *
 * Self-contained: reads the same filters the report page uses from the route
 * (?module=TrainingMatrix&site=&department=&role=&user=&from=&to=&status=&search=),
 * builds the rows via the shared useTrainingMatrixReport composable, and renders
 * an audit-ready table inside PrintLayout. Auto-fires window.print() once loaded.
 */
import { useTrainingMatrixReport } from '@/composables/useTrainingMatrixReport.js'

const props = defineProps({
  site: { type: String, default: '' },
  department: { type: String, default: '' },
  role: { type: String, default: '' },
  user: { type: String, default: '' },
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  status: { type: String, default: '' },
  search: { type: String, default: '' },
})

const getFilters = () => ({
  search: props.search,
  status: props.status,
  siteId: props.site || null,
  departmentId: props.department || null,
  roleId: props.role || null,
  userId: props.user || null,
  from: props.from,
  to: props.to,
})
const { rows } = useTrainingMatrixReport(getFilters)

// Local IDB queries resolve fast; give them a beat, then fire the print dialog.
onMounted(() => {
  setTimeout(() => window.print(), 600)
})
</script>

<template>
  <PrintLayout identifier="Training Matrix Report" :showAudit="false">
    <template #title>
      <h1 class="tw:text-xl tw:font-bold">Training Matrix Report</h1>
      <p class="tw:text-sm tw:text-secondary tw:mt-1">
        {{ rows.length }} record{{ rows.length === 1 ? '' : 's' }}
        <template v-if="from || to">
          · Completed {{ from || '…' }} → {{ to || '…' }}
        </template>
        <template v-if="status"> · Status: {{ status }}</template>
      </p>
    </template>

    <table class="tw:w-full tw:border-collapse tw:text-xs">
      <thead>
        <tr class="tw:text-left tw:border-b tw:border-black/40">
          <th class="tw:py-1.5 tw:pr-3 tw:font-semibold">Employee</th>
          <th class="tw:py-1.5 tw:pr-3 tw:font-semibold">Roles</th>
          <th class="tw:py-1.5 tw:pr-3 tw:font-semibold">Training</th>
          <th class="tw:py-1.5 tw:pr-3 tw:font-semibold">Status</th>
          <th class="tw:py-1.5 tw:pr-3 tw:font-semibold">Completed</th>
          <th class="tw:py-1.5 tw:font-semibold">Type</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.id" class="tw:border-b tw:border-black/10 tw:align-top">
          <td class="tw:py-1.5 tw:pr-3">{{ r.employee }}</td>
          <td class="tw:py-1.5 tw:pr-3">{{ r.roles || '—' }}</td>
          <td class="tw:py-1.5 tw:pr-3">{{ r.training }}</td>
          <td class="tw:py-1.5 tw:pr-3">{{ r.status }}</td>
          <td class="tw:py-1.5 tw:pr-3 tw:whitespace-nowrap">{{ r.completedAt || '—' }}</td>
          <td class="tw:py-1.5">
            {{ r.type }}<span v-if="r.reason"> — {{ r.reason }}</span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="6" class="tw:py-4 tw:text-center tw:italic">No training records.</td>
        </tr>
      </tbody>
    </table>
  </PrintLayout>
</template>
