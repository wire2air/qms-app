<script setup>
/**
 * Inspection lot detail + result capture — the inspector's working surface.
 * Reads the lot + results live from the SyncEngine; capture / transitions /
 * disposition go through the qcInspection REST service. Results auto-evaluate
 * server-side against the spec limits; capture is blocked when the instrument's
 * calibration has lapsed (CALIBRATION_EXPIRED).
 */
import { IconArrowLeft, IconExternalLink } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const toast = useToast()
const saving = ref(false)
const acting = ref(false)
const showSubmit = ref(false)

const canExecute = computed(() => isAllowed(['qcInspection:lot:execute']))
const canDispose = computed(() => isAllowed(['qcInspection:lot:dispose']))

const lot = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.InspectionLot.findByPk(id))
const results = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.InspectionResult.where('inspectionLotId', id).exec(),
  { initial: [] },
)

const characteristics = computed(() => lot.value?.specSnapshot?.characteristics ?? [])
const resultByChar = computed(() => {
  const m = new Map()
  for (const r of results.value) m.set(r.characteristicId, r)
  return m
})

// Local capture entries seeded from saved results.
const entries = ref({})
watch(
  [characteristics, results],
  () => {
    const next = {}
    for (const c of characteristics.value) {
      const r = resultByChar.value.get(c.id)
      next[c.id] = {
        valueNumeric: r?.valueNumeric ?? null,
        valueText: r?.valueText ?? '',
        valueBool: r?.valueBool ?? null,
      }
    }
    entries.value = next
  },
  { immediate: true },
)

const isLocked = computed(() => ['APPROVED', 'REJECTED', 'CLOSED', 'UNDER_REVIEW'].includes(lot.value?.statusId))

function limitText(c) {
  if (c.testType !== 'NUMERIC') return ''
  const parts = []
  if (c.lsl != null) parts.push(`≥ ${c.lsl}`)
  if (c.usl != null) parts.push(`≤ ${c.usl}`)
  if (c.targetValue != null) parts.unshift(`target ${c.targetValue}`)
  return [parts.join(', '), c.uom].filter(Boolean).join(' ')
}

async function saveResults() {
  if (saving.value) return
  saving.value = true
  try {
    const payload = characteristics.value.map((c) => ({
      characteristicId: c.id,
      sampleIndex: 1,
      valueNumeric: c.testType === 'NUMERIC' ? entries.value[c.id]?.valueNumeric ?? null : null,
      valueText: c.testType === 'TEXT' ? entries.value[c.id]?.valueText || null : null,
      valueBool: c.testType === 'PASS_FAIL' ? entries.value[c.id]?.valueBool ?? null : null,
    }))
    await post(`/v1/services/qcInspection/lots/${props.id}/results`, { results: payload })
    toast.success('Results saved')
  } catch (err) {
    toast.error(err?.message || 'Failed to save results')
  } finally {
    saving.value = false
  }
}

async function act(path, okMsg) {
  if (acting.value) return
  acting.value = true
  try {
    await post(`/v1/services/qcInspection/lots/${props.id}/${path}`, {})
    toast.success(okMsg)
  } catch (err) {
    toast.error(err?.message || 'Action failed')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div v-if="lot" class="tw:p-5 tw:max-w-5xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
    <button
      type="button"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer tw:self-start"
      @click="router.push(getCompanyPath('/qc-inspection'))"
    >
      <IconArrowLeft :size="16" /> Back to QC Inspection
    </button>

    <!-- Header -->
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
      <div>
        <div class="tw:flex tw:items-center tw:gap-3">
          <h1 class="tw:text-2xl tw:font-bold tw:font-mono tw:text-on-main">{{ lot.lotNumber }}</h1>
          <InspectionLotStatusBadgeById :statusId="lot.statusId" />
        </div>
        <div class="tw:text-sm tw:text-secondary tw:mt-1">
          {{ lot.inspectionPoint }} · sample {{ lot.sampleSize ?? '—' }}<span v-if="lot.quantity"> of {{ lot.quantity }}</span>
          <span v-if="lot.qualityState"> · {{ lot.qualityState }}</span>
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="canExecute && lot.statusId === 'PENDING'"
          variant="outline"
          size="sm"
          :loading="acting"
          @click="act('start', 'Inspection started')"
        >
          Start
        </BaseButton>
        <BaseButton
          v-if="canExecute && lot.statusId === 'IN_PROGRESS'"
          variant="outline"
          size="sm"
          :loading="acting"
          @click="act('complete', 'Lot completed')"
        >
          Complete
        </BaseButton>
        <BaseButton
          v-if="canDispose && lot.statusId === 'COMPLETED'"
          variant="primary"
          size="sm"
          @click="showSubmit = true"
        >
          Submit for QA Disposition
        </BaseButton>
      </div>
    </div>

    <!-- Linked NC (on reject) -->
    <div v-if="lot.ncId" class="tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-lg tw:px-4 tw:py-2 tw:text-sm">
      <RouterLink :to="getCompanyPath(`/nonconformances/${lot.ncId}`)" class="tw:text-red-700 tw:inline-flex tw:items-center tw:gap-1">
        <IconExternalLink :size="14" /> A nonconformance was raised for this rejected lot
      </RouterLink>
    </div>

    <!-- Capture grid -->
    <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
      <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between">
        <h3 class="tw:font-bold tw:text-on-main">Results</h3>
        <BaseButton
          v-if="canExecute && !isLocked"
          variant="primary"
          size="sm"
          :loading="saving"
          :disabled="!characteristics.length"
          @click="saveResults"
        >
          Save results
        </BaseButton>
      </div>
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-5 tw:py-2">Test</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Spec</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Result</th>
            <th class="tw:text-left tw:px-5 tw:py-2">Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in characteristics" :key="c.id" class="tw:border-t tw:border-divider">
            <td class="tw:px-5 tw:py-2.5 tw:font-medium tw:text-on-main">
              {{ c.name }}
              <span v-if="c.isCritical" class="tw:text-[10px] tw:text-red-600 tw:font-semibold">CRITICAL</span>
            </td>
            <td class="tw:px-5 tw:py-2.5 tw:text-secondary tw:text-xs">{{ limitText(c) || '—' }}</td>
            <td class="tw:px-5 tw:py-2.5">
              <BaseTextInput
                v-if="c.testType === 'NUMERIC'"
                v-model.number="entries[c.id].valueNumeric"
                type="number"
                size="sm"
                class="tw:w-32"
                :disabled="isLocked || !canExecute"
              />
              <BaseInlineSelect
                v-else-if="c.testType === 'PASS_FAIL'"
                :modelValue="entries[c.id].valueBool"
                :items="[{ id: true, name: 'Pass' }, { id: false, name: 'Fail' }]"
                :required="true"
                class="tw:w-28"
                @update:modelValue="(v) => (entries[c.id].valueBool = v)"
              />
              <BaseTextInput
                v-else
                v-model="entries[c.id].valueText"
                size="sm"
                placeholder="observation"
                :disabled="isLocked || !canExecute"
              />
            </td>
            <td class="tw:px-5 tw:py-2.5">
              <InspectionOutcomeBadgeById :outcome="resultByChar.get(c.id)?.outcome" />
            </td>
          </tr>
          <tr v-if="!characteristics.length">
            <td colspan="4" class="tw:px-5 tw:py-6 tw:text-center tw:text-secondary">
              <p class="tw:font-medium tw:text-on-main tw:mb-1">No specification linked to this lot.</p>
              <p class="tw:text-xs">
                Options:
                <strong>A)</strong> Create a new lot and pick a Specification directly in the "Specification &amp; Sampling Plan" section,
                or <strong>B)</strong> set up an <em>Inspection Plan</em> (QC Inspection → Inspection Plans) that binds a Specification + Sampling Plan to this product + inspection point — future lots auto-resolve it.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <InspectionLotSubmitDialog v-model="showSubmit" :lotId="props.id" />
  </div>

  <div v-else class="tw:p-10 tw:text-center tw:text-secondary">Loading…</div>
</template>
