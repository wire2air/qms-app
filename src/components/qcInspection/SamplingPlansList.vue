<script setup>
/**
 * Sampling plans — a tenant's chosen sampling rules (standard + level +
 * severity→AQL). The standard dropdown includes the tenant's custom (cloned)
 * standards, so "custom AQL" = pick your clone here. Reads live; create via the
 * qcInspection REST service.
 */
import { IconPlus } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

defineProps({ canManage: { type: Boolean, default: false } })

const toast = useToast()
const showCreate = ref(false)
const showEsign = ref(false)
const approvingId = ref(null)

const canApprove = computed(() => isAllowed(['qcInspection:plan:approve']))

const POINT_LABELS = { INCOMING: 'Incoming', IN_PROCESS: 'In-process', FINAL: 'Final', OUTGOING: 'Outgoing' }

const plans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },
  { initial: [] },
)
const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), { initial: [] })
const standardName = (code) => standards.value.find((s) => s.id === code)?.name || code || '—'

function startApprove(plan) {
  approvingId.value = plan.id
  showEsign.value = true
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
            <th class="tw:text-left tw:px-4 tw:py-2.5">Name</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Point</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Standard / Level</th>
            <th class="tw:text-left tw:px-4 tw:py-2.5">Status</th>
            <th class="tw:px-4 tw:py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in plans" :key="p.id" class="tw:border-t tw:border-divider">
            <td class="tw:px-4 tw:py-2.5 tw:font-medium tw:text-on-main">{{ p.name }}</td>
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
                  'tw:bg-gray-200 tw:text-gray-600': p.statusId === 'SUPERSEDED',
                }"
              >{{ p.statusId }}</span>
            </td>
            <td class="tw:px-4 tw:py-2.5 tw:text-right">
              <BaseButton
                v-if="canApprove && p.statusId === 'DRAFT'"
                variant="outline"
                size="sm"
                @click="startApprove(p)"
              >
                Approve
              </BaseButton>
            </td>
          </tr>
          <tr v-if="!plans.length">
            <td colspan="4" class="tw:px-4 tw:py-8 tw:text-center tw:text-secondary tw:italic">No sampling plans yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <SamplingPlanCreateDialog v-model="showCreate" />
    <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
  </div>
</template>
