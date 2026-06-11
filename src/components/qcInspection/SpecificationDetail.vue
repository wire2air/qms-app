<script setup>
/**
 * Specification detail — characteristics + lifecycle (approve a DRAFT, or open a
 * new DRAFT version of an EFFECTIVE spec). Reads live; actions via the
 * qcInspection REST service. Approving honours the Change-Control gate.
 */
import { IconArrowLeft } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const toast = useToast()
const acting = ref(false)

const canManage = computed(() => isAllowed(['qcInspection:spec:write']))

const spec = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.Specification.findByPk(id))
const characteristics = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const rows = await db.SpecificationCharacteristic.where('specificationId', id).exec()
    return rows.sort((a, b) => a.sortOrder - b.sortOrder)
  },
  { initial: [] },
)

const MATERIAL_LABELS = { RAW: 'Raw material', PACKAGING: 'Packaging', BULK: 'Bulk', FINISHED: 'Finished good' }

function limitText(c) {
  if (c.testType !== 'NUMERIC') return c.testType === 'PASS_FAIL' ? 'Pass / Fail' : c.testType
  const parts = []
  if (c.targetValue != null) parts.push(`target ${c.targetValue}`)
  if (c.lsl != null) parts.push(`≥ ${c.lsl}`)
  if (c.usl != null) parts.push(`≤ ${c.usl}`)
  return [parts.join(', '), c.uom].filter(Boolean).join(' ') || '—'
}

async function approve() {
  if (acting.value) return
  acting.value = true
  try {
    await post(`/v1/services/qcInspection/specifications/${props.id}/approve`, {})
    toast.success('Specification approved — now effective')
  } catch (err) {
    toast.error(err?.message || 'Approval failed')
  } finally {
    acting.value = false
  }
}

async function newVersion() {
  if (acting.value) return
  acting.value = true
  try {
    const { specification } = await post(`/v1/services/qcInspection/specifications/${props.id}/version`, {})
    toast.success(`Draft v${specification.version} created`)
    router.push(getCompanyPath(`/qc-inspection/specifications/${specification.id}`))
  } catch (err) {
    toast.error(err?.message || 'Could not create a new version')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div v-if="spec" class="tw:p-5 tw:max-w-4xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
    <button
      type="button"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer tw:self-start"
      @click="router.push(getCompanyPath('/qc-inspection?tab=specifications'))"
    >
      <IconArrowLeft :size="16" /> Back to Specifications
    </button>

    <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
      <div>
        <div class="tw:flex tw:items-center tw:gap-3">
          <h1 class="tw:text-2xl tw:font-bold tw:text-on-main">{{ spec.name }}</h1>
          <SpecificationStatusBadgeById :statusId="spec.statusId" />
        </div>
        <div class="tw:text-sm tw:text-secondary tw:mt-1">
          {{ MATERIAL_LABELS[spec.materialKind] || spec.materialKind }} · v{{ spec.version }}
          <span v-if="spec.code"> · {{ spec.code }}</span>
        </div>
      </div>
      <div v-if="canManage" class="tw:flex tw:items-center tw:gap-2">
        <BaseButton v-if="spec.statusId === 'DRAFT'" variant="primary" size="sm" :loading="acting" @click="approve">
          Approve
        </BaseButton>
        <BaseButton v-if="spec.statusId === 'EFFECTIVE'" variant="outline" size="sm" :loading="acting" @click="newVersion">
          New version
        </BaseButton>
      </div>
    </div>

    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover">
        <h3 class="tw:font-bold tw:text-on-main">Characteristics</h3>
      </div>
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-5 tw:py-2">Test</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Type</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Spec</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in characteristics" :key="c.id" class="tw:border-t tw:border-divider">
            <td class="tw:px-5 tw:py-2.5 tw:font-medium tw:text-on-main">
              {{ c.name }}
              <span v-if="c.isCritical" class="tw:text-[10px] tw:text-red-600 tw:font-semibold">CRITICAL</span>
            </td>
            <td class="tw:px-5 tw:py-2.5 tw:text-secondary">{{ c.testType }}</td>
            <td class="tw:px-5 tw:py-2.5 tw:text-secondary">{{ limitText(c) }}</td>
          </tr>
          <tr v-if="!characteristics.length">
            <td colspan="3" class="tw:px-5 tw:py-6 tw:text-center tw:text-secondary tw:italic">No characteristics.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-else class="tw:p-10 tw:text-center tw:text-secondary">Loading…</div>
</template>
