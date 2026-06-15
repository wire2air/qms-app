<script setup>
/**
 * Inspection lot detail + result capture — the inspector's working surface.
 * Reads the lot + results live from the SyncEngine; capture / transitions /
 * disposition go through the qcInspection REST service. Results auto-evaluate
 * server-side against the spec limits; capture is blocked when the instrument's
 * calibration has lapsed (CALIBRATION_EXPIRED).
 */
import { IconArrowLeft, IconExternalLink, IconAlertTriangle } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const toast = useToast()
const saving = ref(false)
const acting = ref(false)
const showSubmit = ref(false)
const showEdit = ref(false)

const canExecute = computed(() => isAllowed(['qcInspection:lot:execute']))
const canDispose = computed(() => isAllowed(['qcInspection:lot:dispose']))
const canCreateNc = computed(() => isAllowed(['nonconformances:create']))

const lot = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.InspectionLot.findByPk(id))
const results = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.InspectionResult.where('inspectionLotId', id).exec(),
  { initial: [] },
)

const creator = useLiveQueryWithDeps(
  [() => lot.value?.createdBy],
  async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
)
const inspector = useLiveQueryWithDeps(
  [() => lot.value?.assignedTo],
  async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
)
const workflowInstance = useLiveQueryWithDeps(
  [() => lot.value?.workflowInstanceId],
  async (db, [wfId]) => (wfId ? db.WorkflowInstance.findByPk(wfId) : null),
)
const product = useLiveQueryWithDeps(
  [() => lot.value?.productId],
  async (db, [productId]) => (productId ? db.Product.findByPk(productId) : null),
)
const supplier = useLiveQueryWithDeps(
  [() => lot.value?.supplierId],
  async (db, [supplierId]) => (supplierId ? db.Supplier.findByPk(supplierId) : null),
)
const equipment = useLiveQueryWithDeps(
  [() => lot.value?.equipmentId],
  async (db, [equipmentId]) => (equipmentId ? db.Equipment.findByPk(equipmentId) : null),
)

// Mirrors the backend calibration gate (inspectionResultService.assertCalibrationOk):
// capture is blocked when the assigned instrument's calibration has lapsed.
const calibrationOverdue = computed(() => {
  const due = equipment.value?.nextCalibrationDue
  return Boolean(due && due.toMillis() < Date.now())
})

function userName(user) {
  if (!user) return '—'
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '—'
}

const POINT_LABELS = { INCOMING: 'Incoming', IN_PROCESS: 'In-process', FINAL: 'Final', OUTGOING: 'Outgoing' }

const characteristics = computed(() => lot.value?.specSnapshot?.characteristics ?? [])
const resultByChar = computed(() => {
  const m = new Map()
  for (const r of results.value) m.set(r.characteristicId, r)
  return m
})

// Local capture entries seeded from saved results. equipmentId is the
// per-row instrument override (only used for requiresInstrument rows);
// null = fall back to the lot-level default instrument.
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
        equipmentId: r?.equipmentId ?? null,
        notes: r?.notes ?? '',
      }
    }
    entries.value = next
  },
  { immediate: true },
)

const anyRequiresInstrument = computed(() =>
  characteristics.value.some((c) => c.requiresInstrument),
)


const isLocked = computed(() => ['APPROVED', 'REJECTED', 'CLOSED', 'UNDER_REVIEW'].includes(lot.value?.statusId))
const isUnderReview = computed(() => lot.value?.statusId === 'UNDER_REVIEW')

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
      equipmentId: c.requiresInstrument ? entries.value[c.id]?.equipmentId ?? null : null,
      notes: entries.value[c.id]?.notes || null,
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

// User-initiated NC from a rejected lot — the backend pre-fills a DRAFT NC
// from everything the lot knows (product, supplier, lot/batch/PO, failed
// characteristics) and we land the user on the NC page to pick the
// workflow (supplier-facing or not) and complete it.
const creatingNc = ref(false)
async function createNcFromLot() {
  if (creatingNc.value) return
  creatingNc.value = true
  try {
    const { nonconformance } = await post(`/v1/services/qcInspection/lots/${props.id}/create-nc`, {})
    toast.success(`Draft ${nonconformance.ncNumber} created — complete it and pick a workflow`)
    router.push(getCompanyPath(`/nonconformances/${nonconformance.id}`))
  } catch (err) {
    toast.error(err?.message || 'Failed to create NC')
  } finally {
    creatingNc.value = false
  }
}

// QA reviewer picks the intended disposition while the lot is UNDER_REVIEW,
// before clicking Approve / Reject. The handler reads the pre-set value.
const APPROVE_DISPOSITIONS = [
  { id: 'RELEASE', name: 'Release' },
  { id: 'USE_AS_IS', name: 'Use as-is (with deviation)' },
]
const REJECT_DISPOSITIONS = [
  { id: 'REWORK', name: 'Rework required' },
  { id: 'RETURN_TO_VENDOR', name: 'Return to vendor (RTV)' },
  { id: 'REJECT', name: 'Reject / Scrap' },
]
const ALL_DISPOSITIONS = [...APPROVE_DISPOSITIONS, ...REJECT_DISPOSITIONS]
const savingDisposition = ref(false)
async function setDisposition(value) {
  if (savingDisposition.value) return
  savingDisposition.value = true
  try {
    await patch(`/v1/services/qcInspection/lots/${props.id}`, { disposition: value })
  } catch (err) {
    toast.error(err?.message || 'Failed to set disposition')
  } finally {
    savingDisposition.value = false
  }
}

// Disposition notes stay editable after disposition — the QA approver may
// not have left a comment in the workflow action.
const editingNotes = ref(false)
const notesDraft = ref('')
const savingNotes = ref(false)
function startEditNotes() {
  notesDraft.value = lot.value?.dispositionNotes ?? ''
  editingNotes.value = true
}
async function saveDispositionNotes() {
  if (savingNotes.value) return
  savingNotes.value = true
  try {
    await patch(`/v1/services/qcInspection/lots/${props.id}`, {
      dispositionNotes: notesDraft.value.trim() || null,
    })
    toast.success('Disposition notes saved')
    editingNotes.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to save notes')
  } finally {
    savingNotes.value = false
  }
}
</script>

<template>
  <div v-if="lot" class="tw:p-5 tw:max-w-7xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
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
          {{ POINT_LABELS[lot.inspectionPoint] || lot.inspectionPoint }} · sample {{ lot.sampleSize ?? '—' }}<span v-if="lot.quantity"> of {{ lot.quantity }}</span>
          <span v-if="lot.qualityState"> · {{ lot.qualityState }}</span>
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="canExecute && ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(lot.statusId)"
          variant="outline"
          size="sm"
          @click="showEdit = true"
        >
          Edit
        </BaseButton>
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

    <!-- Rejected lot — disposition recorded; NC creation is the user's call -->
    <div
      v-if="lot.statusId === 'REJECTED'"
      class="tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:flex tw:flex-col tw:gap-2"
    >
      <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
        <span class="tw:font-semibold tw:text-red-800">This lot was rejected.</span>
        <RouterLink
          v-if="lot.ncId"
          :to="getCompanyPath(`/nonconformances/${lot.ncId}`)"
          class="tw:text-red-700 tw:inline-flex tw:items-center tw:gap-1 tw:underline"
        >
          <IconExternalLink :size="14" /> View linked nonconformance
        </RouterLink>
        <template v-else>
          <BaseButton
            v-if="canCreateNc"
            variant="primary"
            size="sm"
            :loading="creatingNc"
            @click="createNcFromLot"
          >
            Create Nonconformance
          </BaseButton>
          <BaseButton variant="outline" size="sm" @click="startEditNotes">
            {{ lot.dispositionNotes ? 'Edit disposition notes' : 'Enter disposition notes' }}
          </BaseButton>
        </template>
      </div>
      <div v-if="lot.dispositionNotes && !editingNotes" class="tw:text-red-900 tw:whitespace-pre-wrap">
        {{ lot.dispositionNotes }}
      </div>
      <div v-if="editingNotes" class="tw:flex tw:flex-col tw:gap-2">
        <BaseTextarea v-model="notesDraft" :rows="3" placeholder="Why was this lot rejected? Disposition reasoning…" />
        <div class="tw:flex tw:gap-2">
          <BaseButton variant="primary" size="sm" :loading="savingNotes" @click="saveDispositionNotes">Save</BaseButton>
          <BaseButton variant="outline" size="sm" @click="editingNotes = false">Cancel</BaseButton>
        </div>
      </div>
    </div>

    <!-- Calibration warning — instrument-requiring rows that fall back to the
         lot default will be blocked by the backend's per-row gate. Visual /
         sensory rows are unaffected. -->
    <div
      v-if="calibrationOverdue && anyRequiresInstrument"
      class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-2.5 tw:text-sm tw:flex tw:items-center tw:gap-2 tw:flex-wrap"
    >
      <IconAlertTriangle :size="16" class="tw:text-amber-600 tw:shrink-0" />
      <span class="tw:text-amber-900">
        <span class="tw:font-semibold">{{ equipment?.name || 'The default instrument' }}</span>
        is out of calibration (due {{ equipment?.nextCalibrationDue?.formatDate('date') }}) —
        instrument-based tests using it will be blocked. Pick a different instrument on those rows, or recalibrate.
      </span>
      <RouterLink
        :to="getCompanyPath('/equipment')"
        class="tw:text-amber-700 tw:font-medium tw:underline tw:inline-flex tw:items-center tw:gap-1"
      >
        Open Equipment <IconExternalLink :size="12" />
      </RouterLink>
    </div>

    <!-- Approval banner when UNDER_REVIEW -->
    <div
      v-if="isUnderReview"
      class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-3 tw:flex tw:flex-col tw:gap-3"
    >
      <span class="tw:text-sm tw:font-semibold tw:text-amber-900">
        This lot is pending QA disposition approval
      </span>
      <!-- Disposition picker: QA reviewer selects the outcome label before
           clicking Approve or Reject. The handler reads the pre-set value. -->
      <div v-if="canDispose" class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
        <span class="tw:text-sm tw:text-amber-800 tw:shrink-0">Disposition:</span>
        <BaseInlineSelect
          :modelValue="lot.disposition || 'RELEASE'"
          :items="ALL_DISPOSITIONS"
          :required="true"
          class="tw:w-60"
          @update:modelValue="setDisposition"
        />
        <TaskActionBar entityType="InspectionLot" :entityId="lot.id" />
      </div>
      <div v-else class="tw:flex tw:items-center tw:gap-2">
        <TaskActionBar entityType="InspectionLot" :entityId="lot.id" />
      </div>
    </div>

    <!-- Two-column: results on left, overview on right -->
    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[65fr_35fr] tw:gap-5 tw:items-start">
      <!-- Results capture grid -->
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
              <th v-if="anyRequiresInstrument" class="tw:text-left tw:px-5 tw:py-2">Instrument</th>
              <th class="tw:text-left tw:px-5 tw:py-2">Outcome</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="c in characteristics" :key="c.id">
              <!-- ── Row 1: measurement entry ─────────────────────────── -->
              <tr class="tw:border-t tw:border-divider">
                <td class="tw:px-5 tw:py-2.5 tw:font-medium tw:text-on-main tw:align-middle">
                  {{ c.name }}
                  <span v-if="c.isCritical" class="tw:ml-1 tw:text-[10px] tw:text-red-600 tw:font-semibold tw:uppercase">Critical</span>
                </td>
                <td class="tw:px-5 tw:py-2.5 tw:text-secondary tw:text-xs tw:align-middle">{{ limitText(c) || '—' }}</td>
                <td class="tw:px-5 tw:py-2.5 tw:align-middle">
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
                <td v-if="anyRequiresInstrument" class="tw:px-5 tw:py-2.5 tw:align-middle">
                  <EquipmentSelectMenu
                    v-if="c.requiresInstrument"
                    v-model="entries[c.id].equipmentId"
                    :nullLabel="equipment ? `Lot default (${equipment.name})` : 'Select instrument'"
                    :disabled="isLocked || !canExecute"
                    class="tw:w-44"
                  />
                  <span v-else class="tw:text-xs tw:text-secondary">—</span>
                </td>
                <td class="tw:px-5 tw:py-2.5 tw:align-middle">
                  <InspectionOutcomeBadgeById :outcome="resultByChar.get(c.id)?.outcome" />
                </td>
              </tr>

              <!-- ── Row 2: evidence & comments ──────────────────────── -->
              <tr v-if="canExecute && !isLocked || entries[c.id]?.notes" :key="`e-${c.id}`" class="tw:border-t tw:border-divider/50 tw:bg-sidebar/40">
                <td :colspan="anyRequiresInstrument ? 5 : 4" class="tw:px-5 tw:py-2.5">
                  <div class="tw:text-[10px] tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5">Evidence &amp; Comments</div>
                  <RichTextAttachments
                    v-model="entries[c.id].notes"
                    :readonly="isLocked || !canExecute"
                    placeholder="Add observations, photos, voice notes or attach reference files…"
                  />
                </td>
              </tr>

              <!-- ── Row 3: instructions from spec ───────────────────── -->
              <tr v-if="c.testMethod" :key="`i-${c.id}`" class="tw:border-t tw:border-divider/50 tw:bg-blue-50/40">
                <td :colspan="anyRequiresInstrument ? 5 : 4" class="tw:px-5 tw:py-2.5">
                  <div class="tw:text-[10px] tw:font-semibold tw:text-blue-600 tw:uppercase tw:tracking-wide tw:mb-1.5">Instructions</div>
                  <RichTextAttachments :modelValue="c.testMethod" :readonly="true" />
                </td>
              </tr>
            </template>

            <tr v-if="!characteristics.length">
              <td :colspan="anyRequiresInstrument ? 5 : 4" class="tw:px-5 tw:py-6 tw:text-center tw:text-secondary">
                <p class="tw:font-medium tw:text-on-main tw:mb-1">No specification linked to this lot.</p>
                <p class="tw:text-xs tw:max-w-lg tw:mx-auto">
                  <strong>Quick fix:</strong> click <em>Edit</em> above, scroll to "Specification &amp; Sampling Plan" and pick a Specification — the test table will populate after saving.
                  <br />For future lots: set up an <em>Inspection Plan</em> (QC Inspection → Inspection Plans tab) that binds a Specification to this product + inspection point so new lots auto-resolve it.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Overview panel (1/3 width on desktop) -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:divide-y tw:divide-divider">
        <div class="tw:px-4 tw:py-3">
          <h3 class="tw:font-semibold tw:text-on-main tw:text-sm">Overview</h3>
        </div>
        <div class="tw:px-4 tw:py-3 tw:space-y-3 tw:text-sm">
          <!-- Status -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-1">Status</div>
            <InspectionLotStatusBadgeById :statusId="lot.statusId" />
          </div>
          <!-- Inspection point -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Inspection Point</div>
            <div class="tw:text-on-main tw:font-medium">{{ POINT_LABELS[lot.inspectionPoint] || lot.inspectionPoint }}</div>
          </div>
          <!-- Product -->
          <div v-if="product">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Item</div>
            <div class="tw:text-on-main">
              {{ product.name }}
              <span v-if="product.sku" class="tw:text-xs tw:text-secondary tw:font-mono">· {{ product.sku }}</span>
            </div>
          </div>
          <!-- Supplier -->
          <div v-if="supplier">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Supplier</div>
            <div class="tw:text-on-main">{{ supplier.name }}</div>
          </div>
          <!-- Batch -->
          <div v-if="lot.batchNumber">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Batch #</div>
            <div class="tw:text-on-main tw:font-mono">{{ lot.batchNumber }}</div>
          </div>
          <!-- PO -->
          <div v-if="lot.poNumber">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">PO #</div>
            <div class="tw:text-on-main tw:font-mono">{{ lot.poNumber }}</div>
          </div>
          <!-- Receipt -->
          <div v-if="lot.receiptNumber">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Receipt #</div>
            <div class="tw:text-on-main tw:font-mono">{{ lot.receiptNumber }}</div>
          </div>
          <!-- Work order -->
          <div v-if="lot.workOrder">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Work Order</div>
            <div class="tw:text-on-main tw:font-mono">{{ lot.workOrder }}</div>
          </div>
          <!-- Equipment -->
          <div v-if="equipment">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Equipment</div>
            <div class="tw:text-on-main">
              {{ equipment.name }}
              <span v-if="equipment.code" class="tw:text-xs tw:text-secondary tw:font-mono">· {{ equipment.code }}</span>
            </div>
          </div>
          <!-- Created -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Created</div>
            <div class="tw:text-on-main">{{ lot.createdAt?.formatDate('date') || '—' }}</div>
          </div>
          <!-- Created by -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Created By</div>
            <div class="tw:text-on-main">{{ userName(creator) }}</div>
          </div>
          <!-- Inspector -->
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Inspector</div>
            <div class="tw:text-on-main">{{ userName(inspector) }}</div>
          </div>
          <!-- Quantity / sample -->
          <div v-if="lot.quantity || lot.sampleSize">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Sample Size</div>
            <div class="tw:text-on-main">
              {{ lot.sampleSize ?? '—' }}<span v-if="lot.quantity"> of {{ lot.quantity }}</span>
            </div>
          </div>
          <!-- Workflow -->
          <div v-if="workflowInstance">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Workflow</div>
            <span
              class="tw:text-[11px] tw:font-semibold tw:px-2 tw:py-0.5 tw:rounded-full"
              :class="{
                'tw:bg-amber-100 tw:text-amber-700': workflowInstance.statusId === 'IN_PROGRESS',
                'tw:bg-green-100 tw:text-green-700': workflowInstance.statusId === 'COMPLETED',
                'tw:bg-red-100 tw:text-red-700': workflowInstance.statusId === 'REJECTED',
                'tw:bg-gray-100 tw:text-gray-600': !['IN_PROGRESS','COMPLETED','REJECTED'].includes(workflowInstance.statusId),
              }"
            >{{ workflowInstance.statusId }}</span>
          </div>
          <!-- Quality state -->
          <div v-if="lot.qualityState">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Quality State</div>
            <div class="tw:text-on-main tw:font-medium">{{ lot.qualityState }}</div>
          </div>
          <!-- Disposition -->
          <div v-if="lot.disposition">
            <div class="tw:text-xs tw:text-secondary tw:mb-1">Disposition</div>
            <InspectionLotDispositionBadge :disposition="lot.disposition" />
          </div>
          <div v-if="lot.dispositionNotes">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Disposition Notes</div>
            <div class="tw:text-on-main tw:whitespace-pre-wrap">{{ lot.dispositionNotes }}</div>
          </div>
          <!-- Notes -->
          <div v-if="lot.notes">
            <div class="tw:text-xs tw:text-secondary tw:mb-0.5">Notes</div>
            <div class="tw:text-on-main tw:whitespace-pre-wrap">{{ lot.notes }}</div>
          </div>
        </div>
      </div>
    </div>

    <InspectionLotSubmitDialog v-model="showSubmit" :lotId="props.id" />
    <InspectionLotCreateDialog v-model="showEdit" :editLot="lot" />
    <CameraCaptureDialog v-model="showCamera" @captured="onPhotoCaptured" />
    <input ref="fileInputRef" type="file" class="tw:hidden" accept="image/*,.pdf" @change="onFilePicked" />
  </div>

  <div v-else class="tw:p-10 tw:text-center tw:text-secondary">Loading…</div>
</template>
