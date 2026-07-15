<script setup>
/**
 * Sampling plans — a tenant's chosen sampling rules. Main list shows only
 * ACTIVE + DRAFT (non-superseded) plans. Expand a row to see AQL details and
 * version history. DRAFT plans show an Edit button that opens the plan form
 * pre-populated. ACTIVE plans show a "New Version" button.
 */
import { IconPlus } from '@tabler/icons-vue'
import { post, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

defineProps({ canManage: { type: Boolean, default: false } })

const toast = useToast()
const showCreate = ref(false)
const showEsign = ref(false)
const showEdit = ref(false)
const approvingId = ref(null)
const revisingId = ref(null)
const deletingId = ref(null)
const editingPlan = ref(null)

// One gate per backend check, same action string — see samplingPlans.js:
// createPlan/revisePlan/deletePlan → :create, updatePlan → :edit_draft,
// approvePlan → :approve. `inspection_standards:write` used to widen :create
// here, which only ever surfaced buttons that the API then 403'd.
const canApprove = computed(() => isAllowed(['inspection_plan:approve']))
const canCreate = computed(() => isAllowed(['inspection_plan:create']))
const canEditDraft = computed(() => isAllowed(['inspection_plan:edit_draft']))

const POINT_LABELS = {
  INCOMING: 'Incoming',
  IN_PROCESS: 'In-process',
  FINAL: 'Final',
  OUTGOING: 'Outgoing',
}
const POINT_OPTIONS = Object.entries(POINT_LABELS).map(([value, label]) => ({ value, label }))
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
]

const columns = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  {
    name: 'point',
    label: 'Point',
    field: 'inspectionPoint',
    align: 'left',
    filterType: 'select',
    filterOptions: POINT_OPTIONS,
  },
  { name: 'standard', label: 'Standard / Level', field: 'standardCode', align: 'left' },
  {
    name: 'status',
    label: 'Status',
    field: 'statusId',
    align: 'left',
    filterType: 'select',
    filterOptions: STATUS_OPTIONS,
  },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

// Main list: only ACTIVE + DRAFT (hide SUPERSEDED / ARCHIVED)
const plans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows
      .filter((p) => p.statusId === 'ACTIVE' || p.statusId === 'DRAFT')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },

  { models: ['SamplingPlan'], initial: [] },
)

// All superseded plans — used to build per-plan version histories in the expanded row
const supersededPlans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows.filter((p) => p.statusId === 'SUPERSEDED' || p.statusId === 'ARCHIVED')
  },

  { models: ['SamplingPlan'], initial: [] },
)

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), {
  models: ['SamplingStandard'],
  initial: [],
})
const standardName = (code) => standards.value.find((s) => s.id === code)?.name || code || '—'

// Walk parentPlanId chain upward from a given plan to find its superseded predecessors
function getPredecessors(plan) {
  const result = []
  let currentId = plan.parentPlanId
  while (currentId) {
    const found = supersededPlans.value.find((p) => p.id === currentId)
    if (!found) break
    result.push(found)
    currentId = found.parentPlanId
  }
  return result
}

function startApprove(plan) {
  approvingId.value = plan.id
  showEsign.value = true
}

function startEdit(plan) {
  editingPlan.value = plan
  showEdit.value = true
}

async function deletePlan(id) {
  if (deletingId.value !== id) { deletingId.value = id; return }
  try {
    await del(`/v1/services/qcInspection/samplingPlans/${id}`)
    toast.success('Sampling plan deleted')
  } catch (err) {
    toast.error(err?.message || 'Delete failed')
  } finally {
    deletingId.value = null
  }
}

async function onEsignVerified({ method, token }) {
  if (!approvingId.value) return
  try {
    await post(`/v1/services/qcInspection/samplingPlans/${approvingId.value}/approve`, {
      esign: { method, token },
    })
    toast.success('Sampling plan approved and now active')
  } catch (err) {
    toast.error(err?.message || 'Approval failed')
  } finally {
    approvingId.value = null
  }
}

async function createNewVersion(plan) {
  if (revisingId.value) return
  revisingId.value = plan.id
  try {
    await post(`/v1/services/qcInspection/samplingPlans/${plan.id}/revise`, {})
    toast.success('Draft revision created — edit it, then approve to activate')
  } catch (err) {
    toast.error(err?.message || 'Failed to create revision')
  } finally {
    revisingId.value = null
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <DataTable
      :rows="plans"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      :expandable="true"
      searchable
      filterable
      densitySelector
      columnManager
      exportManager
      exportFilename="sampling-plans.csv"
      persistKey="qcInspection:samplingPlans"
      noDataLabel="No sampling plans yet."
    >
      <template #toolbar-left>
        <span class="tw:text-sm tw:text-secondary">{{ plans.length }} sampling plan(s)</span>
        <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
          <template #icon><IconPlus :size="16" /></template>
          New Sampling Plan
        </BaseButton>
      </template>

      <template #body-cell-name="{ row }">
        <span class="tw:font-medium tw:text-on-main">{{ row.name }}</span>
        <span
          v-if="row.version > 1"
          class="tw:text-micro tw:text-secondary tw:font-normal tw:ml-1"
          >v{{ row.version }}</span
        >
      </template>

      <template #body-cell-point="{ row }">
        <span class="tw:text-secondary">
          {{ POINT_LABELS[row.inspectionPoint] || row.inspectionPoint }}
        </span>
      </template>

      <template #body-cell-standard="{ row }">
        <span class="tw:text-secondary">
          <template v-if="row.planType === 'STANDARD'"
            >{{ standardName(row.standardCode) }} · {{ row.inspectionLevel }}</template
          >
          <template v-else>Custom table</template>
        </span>
      </template>

      <template #body-cell-status="{ row }">
        <span
          class="tw:text-caption tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
          :class="{
            'tw:bg-amber-100 tw:text-amber-700': row.statusId === 'DRAFT',
            'tw:bg-green-100 tw:text-green-700': row.statusId === 'ACTIVE',
          }"
          >{{ row.statusId }}</span
        >
      </template>

      <template #body-cell-actions="{ row }">
        <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
          <BaseButton
            v-if="canEditDraft && row.statusId === 'DRAFT'"
            variant="outline"
            size="sm"
            @click="startEdit(row)"
          >
            Edit
          </BaseButton>
          <BaseButton
            v-if="canApprove && row.statusId === 'DRAFT'"
            variant="primary"
            size="sm"
            @click="startApprove(row)"
          >
            Approve
          </BaseButton>
          <BaseButton
            v-if="canCreate && row.statusId === 'DRAFT'"
            :variant="deletingId === row.id ? 'danger' : 'outline'"
            size="sm"
            @click="deletePlan(row.id)"
          >
            {{ deletingId === row.id ? 'Confirm Delete?' : 'Delete' }}
          </BaseButton>
          <BaseButton
            v-if="canCreate && row.statusId === 'ACTIVE'"
            variant="outline"
            size="sm"
            :loading="revisingId === row.id"
            @click="createNewVersion(row)"
          >
            New Version
          </BaseButton>
        </div>
      </template>

      <template #row-detail="{ row: p }">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <!-- AQL table (STANDARD plans) -->
          <div v-if="p.planType === 'STANDARD' && p.severityAqls?.length">
            <BaseText variant="overline" class="tw:block tw:mb-2"> AQL by Severity </BaseText>
            <div class="tw:flex tw:flex-wrap tw:gap-2">
              <div
                v-for="sa in p.severityAqls"
                :key="sa.severity"
                class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-1.5 tw:text-center"
              >
                <div class="tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider">
                  {{ sa.severity }}
                </div>
                <div class="tw:font-semibold tw:text-on-main tw:text-sm">AQL {{ sa.aql }}%</div>
              </div>
            </div>
          </div>

          <!-- Custom table rows -->
          <div v-if="p.planType === 'CUSTOM' && p.customPlanTable?.rows?.length">
            <BaseText variant="overline" class="tw:block tw:mb-2"> Custom Plan Table </BaseText>
            <div class="tw:overflow-x-auto">
            <table class="tw:text-xs tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
              <thead class="tw:bg-white tw:text-secondary tw:uppercase">
                <tr>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Severity</th>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Sample Size</th>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Accept</th>
                  <th class="tw:text-left tw:px-3 tw:py-1.5">Reject</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="cr in p.customPlanTable.rows"
                  :key="cr.severityLabel"
                  class="tw:border-t tw:border-divider"
                >
                  <td class="tw:px-3 tw:py-1.5 tw:font-medium tw:text-on-main">
                    {{ cr.severityLabel }}
                  </td>
                  <td class="tw:px-3 tw:py-1.5">{{ cr.sampleSize }}</td>
                  <td class="tw:px-3 tw:py-1.5 tw:text-green-700">≤ {{ cr.accept }}</td>
                  <td class="tw:px-3 tw:py-1.5 tw:text-red-700">≥ {{ cr.reject }}</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          <!-- Metadata -->
          <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3 tw:text-sm">
            <div v-if="p.description">
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Description</div>
              <div class="tw:text-on-main">{{ p.description }}</div>
            </div>
            <div v-if="p.effectiveFrom">
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Effective From</div>
              <div class="tw:text-on-main">{{ p.effectiveFrom?.formatDate('date') }}</div>
            </div>
            <div v-if="p.effectiveUntil">
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Effective Until</div>
              <div class="tw:text-on-main">{{ p.effectiveUntil?.formatDate('date') }}</div>
            </div>
            <div v-if="p.notes">
              <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Notes</div>
              <div class="tw:text-on-main">{{ p.notes }}</div>
            </div>
          </div>

          <!-- Version history (predecessors via parentPlanId chain) -->
          <div v-if="getPredecessors(p).length">
            <BaseText variant="overline" class="tw:block tw:mb-2"> Version History </BaseText>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div
                v-for="prev in getPredecessors(p)"
                :key="prev.id"
                class="tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-secondary tw:py-1 tw:border-b tw:border-divider tw:last:border-0"
              >
                <span class="tw:font-medium tw:text-on-main">v{{ prev.version }}</span>
                <span>{{ prev.name }}</span>
                <span v-if="prev.planType === 'STANDARD'"
                  >· {{ standardName(prev.standardCode) }} {{ prev.inspectionLevel }}</span
                >
                <span class="tw:ml-auto tw:text-micro"
                  >superseded {{ prev.effectiveUntil?.formatDate('date') }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </template>
    </DataTable>

    <SamplingPlanCreateDialog v-model="showCreate" />
    <SamplingPlanCreateDialog v-model="showEdit" :editPlan="editingPlan" />
    <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
  </div>
</template>
