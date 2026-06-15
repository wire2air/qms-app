<script setup>
/**
 * Sampling plans — a tenant's chosen sampling rules. Main list shows only
 * ACTIVE + DRAFT (non-superseded) plans. Expand a row to see AQL details and
 * version history. DRAFT plans show an Edit button that opens the plan form
 * pre-populated. ACTIVE plans show a "New Version" button.
 */
import { IconPlus, IconChevronDown, IconChevronRight } from '@tabler/icons-vue'
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
const expandedId = ref(null)

const canApprove = computed(() => isAllowed(['qcInspection:plan:approve']))
const canCreate = computed(() => isAllowed(['qcInspection:standards:write']) || isAllowed(['qcInspection:plan:create']))

const POINT_LABELS = { INCOMING: 'Incoming', IN_PROCESS: 'In-process', FINAL: 'Final', OUTGOING: 'Outgoing' }

// Main list: only ACTIVE + DRAFT (hide SUPERSEDED / ARCHIVED)
const plans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows
      .filter((p) => p.statusId === 'ACTIVE' || p.statusId === 'DRAFT')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },
  { initial: [] },
)

// All superseded plans — used to build per-plan version histories in the expanded row
const supersededPlans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows.filter((p) => p.statusId === 'SUPERSEDED' || p.statusId === 'ARCHIVED')
  },
  { initial: [] },
)

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), { initial: [] })
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

function toggleExpand(planId) {
  expandedId.value = expandedId.value === planId ? null : planId
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
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:text-sm tw:text-secondary">{{ plans.length }} sampling plan(s)</div>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="showCreate = true">
        <template #icon><IconPlus :size="16" /></template>
        New Sampling Plan
      </BaseButton>
    </div>

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-4 tw:py-2.5 tw:w-6"></th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Name</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Point</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Standard / Level</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Status</th>
            <th class="tw:px-4 tw:py-2.5"></th>
          </tr>
        </thead>

        <tbody v-for="p in plans" :key="p.id">
          <!-- Main row -->
          <tr
            class="tw:border-t tw:border-divider tw:cursor-pointer tw:hover:bg-main-hover tw:transition-colors"
            @click="toggleExpand(p.id)"
          >
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              <component :is="expandedId === p.id ? IconChevronDown : IconChevronRight" :size="14" />
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:font-medium tw:text-on-main">
              {{ p.name }}
              <span v-if="p.version > 1" class="tw:text-[10px] tw:text-secondary tw:font-normal tw:ml-1">v{{ p.version }}</span>
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">{{ POINT_LABELS[p.inspectionPoint] || p.inspectionPoint }}</td>
            <td class="tw:px-4 tw:py-2.5 tw:text-secondary">
              <template v-if="p.planType === 'STANDARD'">{{ standardName(p.standardCode) }} · {{ p.inspectionLevel }}</template>
              <template v-else>Custom table</template>
            </td>
            <td class="tw:px-4 tw:py-2.5">
              <span
                class="tw:text-[11px] tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
                :class="{
                  'tw:bg-amber-100 tw:text-amber-700': p.statusId === 'DRAFT',
                  'tw:bg-green-100 tw:text-green-700': p.statusId === 'ACTIVE',
                }"
              >{{ p.statusId }}</span>
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-right" @click.stop>
              <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
                <BaseButton
                  v-if="canCreate && p.statusId === 'DRAFT'"
                  variant="outline"
                  size="sm"
                  @click="startEdit(p)"
                >
                  Edit
                </BaseButton>
                <BaseButton
                  v-if="canApprove && p.statusId === 'DRAFT'"
                  variant="primary"
                  size="sm"
                  @click="startApprove(p)"
                >
                  Approve
                </BaseButton>
                <BaseButton
                  v-if="canCreate && p.statusId === 'DRAFT'"
                  :variant="deletingId === p.id ? 'danger' : 'outline'"
                  size="sm"
                  @click="deletePlan(p.id)"
                >
                  {{ deletingId === p.id ? 'Confirm Delete?' : 'Delete' }}
                </BaseButton>
                <BaseButton
                  v-if="canCreate && p.statusId === 'ACTIVE'"
                  variant="outline"
                  size="sm"
                  :loading="revisingId === p.id"
                  @click="createNewVersion(p)"
                >
                  New Version
                </BaseButton>
              </div>
            </td>
          </tr>

          <!-- Expanded detail row -->
          <tr v-if="expandedId === p.id" class="tw:border-t tw:border-divider tw:bg-main-hover">
            <td colspan="6" class="tw:px-6 tw:py-4">
              <div class="tw:flex tw:flex-col tw:gap-4">

                <!-- AQL table (STANDARD plans) -->
                <div v-if="p.planType === 'STANDARD' && p.severityAqls?.length">
                  <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold tw:mb-2">AQL by Severity</div>
                  <div class="tw:flex tw:flex-wrap tw:gap-2">
                    <div
                      v-for="sa in p.severityAqls"
                      :key="sa.severity"
                      class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-1.5 tw:text-center"
                    >
                      <div class="tw:text-[10px] tw:text-secondary tw:uppercase">{{ sa.severity }}</div>
                      <div class="tw:font-semibold tw:text-on-main tw:text-sm">AQL {{ sa.aql }}%</div>
                    </div>
                  </div>
                </div>

                <!-- Custom table rows -->
                <div v-if="p.planType === 'CUSTOM' && p.customPlanTable?.rows?.length">
                  <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold tw:mb-2">Custom Plan Table</div>
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
                      <tr v-for="row in p.customPlanTable.rows" :key="row.severityLabel" class="tw:border-t tw:border-divider">
                        <td class="tw:px-3 tw:py-1.5 tw:font-medium tw:text-on-main">{{ row.severityLabel }}</td>
                        <td class="tw:px-3 tw:py-1.5">{{ row.sampleSize }}</td>
                        <td class="tw:px-3 tw:py-1.5 tw:text-green-700">≤ {{ row.accept }}</td>
                        <td class="tw:px-3 tw:py-1.5 tw:text-red-700">≥ {{ row.reject }}</td>
                      </tr>
                    </tbody>
                  </table>
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
                  <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold tw:mb-2">Version History</div>
                  <div class="tw:flex tw:flex-col tw:gap-1">
                    <div
                      v-for="prev in getPredecessors(p)"
                      :key="prev.id"
                      class="tw:flex tw:items-center tw:gap-3 tw:text-xs tw:text-secondary tw:py-1 tw:border-b tw:border-divider tw:last:border-0"
                    >
                      <span class="tw:font-mono tw:font-medium tw:text-on-main">v{{ prev.version }}</span>
                      <span>{{ prev.name }}</span>
                      <span v-if="prev.planType === 'STANDARD'">· {{ standardName(prev.standardCode) }} {{ prev.inspectionLevel }}</span>
                      <span class="tw:ml-auto tw:text-[10px]">superseded {{ prev.effectiveUntil?.formatDate('date') }}</span>
                    </div>
                  </div>
                </div>

              </div>
            </td>
          </tr>
        </tbody>

        <tbody v-if="!plans.length">
          <tr>
            <td colspan="6" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">No sampling plans yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <SamplingPlanCreateDialog v-model="showCreate" />
    <SamplingPlanCreateDialog v-model="showEdit" :editPlan="editingPlan" />
    <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
  </div>
</template>
