<script setup>
/**
 * Inspection lot detail + result capture — the inspector's working surface.
 * Reads the lot + results live from the SyncEngine; capture / transitions /
 * disposition go through the qcInspection REST service. Results auto-evaluate
 * server-side against the spec limits; capture is blocked when the instrument's
 * calibration has lapsed (CALIBRATION_EXPIRED).
 */
import {
  IconExternalLink,
  IconAlertTriangle,
  IconChevronRight,
  IconChevronDown,
} from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useRecordTrail } from '@/composables/useRecordTrail.js'
import {
  buildInspectionLotSections,
  buildInspectionLotActions,
} from './inspectionLotDetailConfig.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const route = useRoute()
const toast = useToast()

const { visit: visitTrail } = useRecordTrail()
const saving = ref(false)
const acting = ref(false)
const showSubmit = ref(false)
const showEdit = ref(false)

const canExecute = computed(() => isAllowed(['qcInspection:lot:execute']))
const canDispose = computed(() => isAllowed(['qcInspection:lot:dispose']))
const canCreateNc = computed(() => isAllowed(['nonconformances:create']))
const canCreateEvent = computed(() => isAllowed(['qualityEvents:create']))

const lot = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.InspectionLot.findByPk(id),
  { models: ['InspectionLot'] },
)
watch(
  lot,
  (l) => {
    if (l?.id) visitTrail({ type: 'Lot', id: l.id, label: l.lotNumber, path: route.path })
  },
  { immediate: true },
)

// Module breadcrumb (replaces the ad-hoc "Back to QC Inspection" button).
const moduleCrumbs = computed(() => [
  { label: 'QC Inspection', to: getCompanyPath('/qc-inspection') },
  { label: lot.value?.lotNumber || 'Lot' },
])
const results = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.InspectionResult.where('inspectionLotId', id).exec(),

  { models: ['InspectionResult'], initial: [] },
)

const product = useLiveQueryWithDeps(
  [() => lot.value?.productId],

  async (db, [productId]) => (productId ? db.Product.findByPk(productId) : null),
  { models: ['Product'] },
)
const supplier = useLiveQueryWithDeps(
  [() => lot.value?.supplierId],

  async (db, [supplierId]) => (supplierId ? db.Supplier.findByPk(supplierId) : null),
  { models: ['Supplier'] },
)
const equipment = useLiveQueryWithDeps(
  [() => lot.value?.equipmentId],

  async (db, [equipmentId]) => (equipmentId ? db.Equipment.findByPk(equipmentId) : null),
  { models: ['Equipment'] },
)

// Mirrors the backend calibration gate (inspectionResultService.assertCalibrationOk):
// capture is blocked when the assigned instrument's calibration has lapsed.
const calibrationOverdue = computed(() => {
  const due = equipment.value?.nextCalibrationDue
  return Boolean(due && due.toMillis() < Date.now())
})

const POINT_LABELS = {
  INCOMING: 'Incoming',
  IN_PROCESS: 'In-process',
  FINAL: 'Final',
  OUTGOING: 'Outgoing',
}

const characteristics = computed(() => lot.value?.specSnapshot?.characteristics ?? [])
// Single-result (LOT) mode is the sampleIndex=1 row. Prefer it so that a lot
// which also has per-sample rows (mode was toggled) doesn't pick an arbitrary
// sample's value — that caused saved values to "flip back" on re-sync.
const resultByChar = computed(() => {
  const m = new Map()
  for (const r of results.value) {
    const existing = m.get(r.characteristicId)
    if (!existing || r.sampleIndex === 1) m.set(r.characteristicId, r)
  }
  return m
})

// Local capture entries seeded from saved results. equipmentId is the
// per-row instrument: a saved value wins, else the test's preferred
// instrument (from the spec snapshot), else null = the lot-level default.
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
        equipmentId: r?.equipmentId ?? c.preferredEquipmentId ?? null,
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

// Adverse outcomes that may warrant a nonconformance.
const ADVERSE_STATUSES = ['REWORK', 'RETURN_TO_SUPPLIER', 'REJECTED', 'HOLD']
const isUnderReview = computed(() => lot.value?.statusId === 'UNDER_REVIEW')
const isAdverse = computed(() => ADVERSE_STATUSES.includes(lot.value?.statusId))

// Capture mode: 'LOT' (one value per characteristic) or 'SAMPLE' (a value per
// sampled unit). SAMPLE needs a resolved sample size (from a sampling plan).
// The mode is only switchable while actively capturing (pre-COMPLETED), since
// updateLot freezes reference fields once the lot leaves DRAFT/PENDING/IN_PROGRESS.
const isSampleMode = computed(() => lot.value?.captureMode === 'SAMPLE')
// Per-sample data was actually captured (any result on a unit beyond #1).
const hasPerSampleResults = computed(() => results.value.some((r) => (r.sampleIndex ?? 1) > 1))
// Render the per-sample data sheet when in SAMPLE mode OR when per-sample
// results exist — so a completed/dispositioned lot keeps showing its data sheet
// (read-only) regardless of how captureMode reads back after the transition.
const showSampleGrid = computed(() => isSampleMode.value || hasPerSampleResults.value)
const canSampleCapture = computed(() => (lot.value?.sampleSize ?? 0) > 1)
const isCapturing = computed(() => ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(lot.value?.statusId))
// Results are editable/saveable only while the lot is actively being captured
// (DRAFT/PENDING/IN_PROGRESS). Once COMPLETED — and through review/disposition —
// they're frozen: no Save button, inputs read-only.
const canEditResults = computed(() => canExecute.value && isCapturing.value)
const sampleGridRef = ref(null)
const savingMode = ref(false)
async function setCaptureMode(mode) {
  if (savingMode.value || lot.value?.captureMode === mode) return
  if (mode === 'SAMPLE' && !canSampleCapture.value) return
  savingMode.value = true
  try {
    await patch(`/v1/services/qcInspection/lots/${props.id}`, { captureMode: mode })
  } catch (err) {
    toast.error(err?.message || 'Failed to switch capture mode')
  } finally {
    savingMode.value = false
  }
}

// Characteristics that carry a test method — shown as a read-only instructions
// reference above the per-sample grid (instructions are per-characteristic).
const charsWithInstructions = computed(() => characteristics.value.filter((c) => c.testMethod))

// ── Collapsible detail (default collapsed) ──────────────────────────────────
// Per-sample mode: the whole "Test instructions" block above the grid.
const showSampleInstructions = ref(false)

// Single-result table: per-characteristic Evidence & Instructions detail rows.
const expandedDetail = ref(new Set())
function toggleDetail(id) {
  const s = new Set(expandedDetail.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedDetail.value = s
}
function isDetailOpen(id) {
  return expandedDetail.value.has(id)
}
function canCaptureEvidence(c) {
  return canEditResults.value || !!entries.value[c.id]?.notes
}
function rowHasDetail(c) {
  return canCaptureEvidence(c) || !!c.testMethod
}
function detailLabel(c) {
  const ev = canCaptureEvidence(c)
  const instr = !!c.testMethod
  if (ev && instr) return 'Evidence & instructions'
  if (ev) return 'Evidence & comments'
  if (instr) return 'Instructions'
  return 'Details'
}

// Per-severity accept/reject (Ac/Re) from the lot's sampling snapshot — drives
// the attributes/defects panel. Empty unless a STANDARD sampling plan resolved it.
const lotPerSeverity = computed(() => lot.value?.samplingSnapshot?.perSeverity ?? [])

// Defective UNITS per defect class — drives the AQL Acceptance panel.
//
// Per the percent-defective AQL model (ANSI/ASQ Z1.4 · ISO 2859-1), acceptance
// counts nonconforming UNITS, not individual nonconformities.
//
//  • PER-SAMPLE capture: a sampled unit is ONE defective for a class if ANY of
//    its characteristics of that class fail. A unit failing six Major tests is
//    still ONE Major defective. Classes are tallied independently.
//
//  • SINGLE-RESULT capture: the one judgment APPLIES TO THE WHOLE SAMPLE — there
//    are no per-unit readings. A failing characteristic therefore means every
//    inspected unit is defective for that class, so the count is the full sample
//    size (n), which trips the class's reject number → REJECT. (A pass leaves
//    the class at 0 → ACCEPT.)
const defectiveUnitsByClass = computed(() => {
  const classById = new Map(
    characteristics.value.map((c) => [c.id, c.defectClass || (c.isCritical ? 'CRITICAL' : 'MAJOR')]),
  )
  const byClass = {}

  if (hasPerSampleResults.value) {
    const unitsByClass = {} // class -> Set<sampleIndex>
    for (const r of results.value) {
      if (r.outcome !== 'FAIL') continue
      const cls = classById.get(r.characteristicId) || 'MAJOR'
      if (!unitsByClass[cls]) unitsByClass[cls] = new Set()
      unitsByClass[cls].add(r.sampleIndex ?? 1)
    }
    for (const [cls, set] of Object.entries(unitsByClass)) byClass[cls] = set.size
    return byClass
  }

  // Single-result mode: a class fails the whole sample → n defectives.
  const n = Math.max(lot.value?.sampleSize ?? 0, 1)
  for (const r of results.value) {
    if (r.outcome !== 'FAIL') continue
    const cls = classById.get(r.characteristicId) || 'MAJOR'
    byClass[cls] = n
  }
  return byClass
})

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
    // SAMPLE mode: one row per (characteristic, sample) from the grid. LOT
    // mode: one row per characteristic at sampleIndex 1 (the simplified model).
    const payload = showSampleGrid.value
      ? sampleGridRef.value?.buildPayload() ?? []
      : characteristics.value.map((c) => ({
          characteristicId: c.id,
          sampleIndex: 1,
          valueNumeric: c.testType === 'NUMERIC' ? entries.value[c.id]?.valueNumeric ?? null : null,
          valueText: c.testType === 'TEXT' ? entries.value[c.id]?.valueText || null : null,
          valueBool: c.testType === 'PASS_FAIL' ? entries.value[c.id]?.valueBool ?? null : null,
          equipmentId: c.requiresInstrument ? entries.value[c.id]?.equipmentId ?? null : null,
          notes: entries.value[c.id]?.notes || null,
        }))
    if (!payload.length) {
      toast.error('Enter at least one value before saving')
      return
    }
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
const creatingEvent = ref(false)
const showCreateEvent = ref(false)
async function createNcFromLot() {
  if (creatingNc.value) return
  creatingNc.value = true
  try {
    const { nonconformance } = await post(
      `/v1/services/qcInspection/lots/${props.id}/create-nc`,
      {},
    )
    toast.success(`Draft ${nonconformance.ncNumber} created — complete it and pick a workflow`)
    router.push(getCompanyPath(`/nonconformances/${nonconformance.id}`))
  } catch (err) {
    toast.error(err?.message || 'Failed to create NC')
  } finally {
    creatingNc.value = false
  }
}

function openCreateEvent() {
  showCreateEvent.value = true
}

function onEventCreated() {
  showCreateEvent.value = false
  creatingEvent.value = false
  toast.success('Event created from this inspection lot')
}

const qcEventInitialValues = computed(() => {
  const lotNumber = lot.value?.lotNumber || '—'
  const batchNumber = lot.value?.batchNumber || '—'
  const poNumber = lot.value?.poNumber || '—'
  const supplierName = supplier.value?.name || '—'
  const productName = product.value?.name || '—'
  const inspectionPoint = POINT_LABELS[lot.value?.inspectionPoint] || lot.value?.inspectionPoint || '—'
  return {
    title: `QC Observation — Lot ${lotNumber}`,
    description:
      `Captured from QC inspection.\n` +
      `- Lot: ${lotNumber}\n` +
      `- Batch: ${batchNumber}\n` +
      `- PO: ${poNumber}\n` +
      `- Supplier: ${supplierName}\n` +
      `- Product: ${productName}\n` +
      `- Inspection point: ${inspectionPoint}`,
    assignedToUserId: lot.value?.assignedTo || null,
    supplierId: lot.value?.supplierId || null,
    sourceType: 'QC_INSPECTION',
    inspectionLotId: lot.value?.id || null,
  }
})

// Disposition notes stay editable after disposition — the QA approver may
// want to refine the reasoning recorded at disposition time.
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

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const loading = computed(() => lot.value === undefined)
const inspectionLotActions = computed(() =>
  buildInspectionLotActions(
    {
      canExecute: canExecute.value,
      canDispose: canDispose.value,
      canCreateEvent: canCreateEvent.value,
      statusId: lot.value?.statusId,
      acting: acting.value,
      creatingEvent: creatingEvent.value,
    },
    {
      edit() {
        showEdit.value = true
      },
      start: () => act('start', 'Inspection started'),
      complete: () => act('complete', 'Lot completed'),
      submit() {
        showSubmit.value = true
      },
      createEvent() {
        openCreateEvent()
      },
    },
  ),
)
const inspectionLotDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: moduleCrumbs.value,
    actions: inspectionLotActions.value,
    sections: buildInspectionLotSections(lot.value),
  }),
)
</script>

<template>
  <div class="tw:contents">
    <BaseDetailLayout
    :config="inspectionLotDetailConfig"
    :record="lot"
    :loading="loading"
    :notFound="!loading && !lot"
    notFoundTitle="Lot not found"
    notFoundDescription="This inspection lot could not be found."
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">{{
        lot?.lotNumber
      }}</span>
    </template>

    <template #status>
      <InspectionLotStatusBadgeById v-if="lot" :statusId="lot.statusId" />
    </template>

    <template v-if="lot" #meta>
      <span>{{ POINT_LABELS[lot.inspectionPoint] || lot.inspectionPoint }}</span>
      <span>
        · sample {{ lot.sampleSize ?? '—' }}<span v-if="lot.quantity"> of {{ lot.quantity }}</span>
      </span>
      <span v-if="lot.qualityState"> · {{ lot.qualityState }}</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="inspectionLotActions" />
    </template>

    <template v-if="lot" #section-details>
      <div class="tw:flex tw:flex-col tw:gap-5">
        <RecordTrailBreadcrumb />

        <!-- Key identifiers -->
        <div
          v-if="product || supplier || lot.batchNumber || lot.poNumber || equipment"
          class="tw:text-sm tw:text-secondary tw:flex tw:flex-wrap tw:items-center tw:gap-x-1.5 tw:gap-y-0.5"
        >
          <span v-if="product" class="tw:text-on-main tw:font-medium">
            {{ product.name
            }}<span v-if="product.sku" class="tw:font-normal tw:text-secondary">
              · {{ product.sku }}</span
            >
          </span>
          <span v-if="supplier">· {{ supplier.name }}</span>
          <span v-if="lot.batchNumber">· Batch {{ lot.batchNumber }}</span>
          <span v-if="lot.poNumber">· PO {{ lot.poNumber }}</span>
          <span v-if="equipment">· {{ equipment.name }}</span>
        </div>

    <!-- Adverse disposition (rework / return / reject / hold) — NC creation is
         the user's call. -->
    <div
      v-if="isAdverse"
      class="tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-lg tw:px-4 tw:py-3 tw:text-sm tw:flex tw:flex-col tw:gap-2"
    >
      <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
        <span class="tw:font-semibold tw:text-red-800">Disposition:</span>
        <NcDispositionTypeBadgeById :dispositionTypeId="lot.dispositionTypeId" />
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
      <div
        v-if="lot.dispositionNotes && !editingNotes"
        class="tw:text-red-900 tw:whitespace-pre-wrap"
      >
        {{ lot.dispositionNotes }}
      </div>
      <div v-if="editingNotes" class="tw:flex tw:flex-col tw:gap-2">
        <BaseTextarea v-model="notesDraft" :rows="3" placeholder="Disposition reasoning…" />
        <div class="tw:flex tw:gap-2">
          <BaseButton
            variant="primary"
            size="sm"
            :loading="savingNotes"
            @click="saveDispositionNotes"
            >Save</BaseButton
          >
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
        instrument-based tests using it will be blocked. Pick a different instrument on those rows,
        or recalibrate.
      </span>
      <RouterLink
        :to="getCompanyPath('/equipment')"
        class="tw:text-amber-700 tw:font-medium tw:underline tw:inline-flex tw:items-center tw:gap-1"
      >
        Open Equipment <IconExternalLink :size="12" />
      </RouterLink>
    </div>

    <!-- Disposition banner when UNDER_REVIEW. The assigned reviewer records a
         single disposition (which becomes the lot's terminal status); no
         separate Approve/Reject. Non-reviewers see only the pending notice. -->
    <div
      v-if="isUnderReview"
      class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-3 tw:flex tw:flex-col tw:gap-3"
    >
      <span class="tw:text-sm tw:font-semibold tw:text-amber-900">
        This lot is pending QA disposition
      </span>
      <InspectionLotDispositionAction v-if="canDispose" :lotId="lot.id" />
    </div>

    <!-- Results (variables) + defects (attributes) — full width -->
    <div class="tw:flex tw:flex-col tw:gap-5">
      <!-- Results capture grid -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
          <div class="tw:flex tw:items-center tw:gap-3">
            <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Results</h3>
            <div
              v-if="canExecute && isCapturing"
              class="tw:inline-flex tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden tw:text-xs tw:font-medium"
            >
              <button
                type="button"
                class="tw:px-2.5 tw:py-1 tw:border-0 tw:cursor-pointer"
                :class="!isSampleMode ? 'tw:bg-primary tw:text-white' : 'tw:bg-transparent tw:text-secondary tw:hover:text-on-main'"
                @click="setCaptureMode('LOT')"
              >
                Single result
              </button>
              <button
                type="button"
                class="tw:px-2.5 tw:py-1 tw:border-0 tw:border-l tw:border-divider"
                :class="[
                  isSampleMode ? 'tw:bg-primary tw:text-white' : 'tw:bg-transparent tw:text-secondary tw:hover:text-on-main',
                  canSampleCapture ? 'tw:cursor-pointer' : 'tw:opacity-40 tw:cursor-not-allowed',
                ]"
                :title="canSampleCapture ? '' : 'Add a sampling plan so a sample size is resolved, then per-sample entry unlocks.'"
                @click="setCaptureMode('SAMPLE')"
              >
                Per sample<span v-if="lot.sampleSize"> (n={{ lot.sampleSize }})</span>
              </button>
            </div>
          </div>
          <BaseButton
            v-if="canEditResults"
            variant="primary"
            size="sm"
            :loading="saving"
            :disabled="!characteristics.length"
            @click="saveResults"
          >
            Save results
          </BaseButton>
        </div>

        <!-- Per-sample data sheet -->
        <div v-if="showSampleGrid" class="tw:p-4 tw:flex tw:flex-col tw:gap-4">
          <div v-if="charsWithInstructions.length" class="tw:flex tw:flex-col tw:gap-2">
            <button
              type="button"
              class="tw:inline-flex tw:items-center tw:gap-1.5 tw:self-start tw:text-xs tw:font-semibold tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="showSampleInstructions = !showSampleInstructions"
            >
              <IconChevronDown v-if="showSampleInstructions" :size="14" />
              <IconChevronRight v-else :size="14" />
              Test instructions ({{ charsWithInstructions.length }})
            </button>
            <div v-if="showSampleInstructions" class="tw:flex tw:flex-col tw:gap-2">
              <div
                v-for="c in charsWithInstructions"
                :key="c.id"
                class="tw:bg-blue-50/40 tw:rounded-lg tw:p-3 tw:border tw:border-blue-100"
              >
                <div class="tw:text-micro tw:font-semibold tw:text-blue-600 tw:uppercase tw:tracking-wide tw:mb-1.5">
                  {{ c.name }} — Instructions
                </div>
                <RichTextAttachments :modelValue="c.testMethod" :readonly="true" />
              </div>
            </div>
          </div>
          <InspectionSampleGrid
            v-if="characteristics.length"
            ref="sampleGridRef"
            :characteristics="characteristics"
            :sampleSize="lot.sampleSize"
            :results="results"
            :readonly="!canEditResults"
          />
          <p v-else class="tw:text-center tw:text-secondary tw:py-6">
            No specification linked to this lot — switch to Single result and pick a Specification via Edit.
          </p>
        </div>

        <div v-else class="tw:overflow-x-auto">
        <table class="tw:w-full tw:min-w-[640px] tw:text-sm">
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
                  <div class="tw:flex tw:items-center tw:gap-1.5">
                    {{ c.name }}
                    <DefectSeverityBadgeById :severityId="c.defectClass || (c.isCritical ? 'CRITICAL' : 'MAJOR')" class="tw:text-micro" />
                  </div>
                  <button
                    v-if="rowHasDetail(c)"
                    type="button"
                    class="tw:mt-1 tw:inline-flex tw:items-center tw:gap-1 tw:text-caption tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
                    @click="toggleDetail(c.id)"
                  >
                    <IconChevronDown v-if="isDetailOpen(c.id)" :size="12" />
                    <IconChevronRight v-else :size="12" />
                    {{ detailLabel(c) }}
                    <span
                      v-if="entries[c.id]?.notes"
                      class="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-primary"
                      title="Has captured notes"
                    ></span>
                  </button>
                </td>
                <td class="tw:px-5 tw:py-2.5 tw:text-secondary tw:text-xs tw:align-middle">{{ limitText(c) || '—' }}</td>
                <td class="tw:px-5 tw:py-2.5 tw:align-middle">
                  <BaseTextInput
                    v-if="c.testType === 'NUMERIC'"
                    v-model.number="entries[c.id].valueNumeric"
                    type="number"
                    size="sm"
                    class="tw:w-32"
                    :disabled="!canEditResults"
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
                    :disabled="!canEditResults"
                  />
                </td>
                <td v-if="anyRequiresInstrument" class="tw:px-5 tw:py-2.5 tw:align-middle">
                  <EquipmentSelectMenu
                    v-if="c.requiresInstrument"
                    v-model="entries[c.id].equipmentId"
                    :nullLabel="equipment ? `Lot default (${equipment.name})` : 'Select instrument'"
                    :disabled="!canEditResults"
                    class="tw:w-44"
                  />
                  <span v-else class="tw:text-xs tw:text-secondary">—</span>
                </td>
                <td class="tw:px-5 tw:py-2.5 tw:align-middle">
                  <InspectionOutcomeBadgeById :outcome="resultByChar.get(c.id)?.outcome" />
                </td>
              </tr>

              <!-- ── Row 2: evidence & comments (collapsible) ────────── -->
              <tr v-if="isDetailOpen(c.id) && canCaptureEvidence(c)" :key="`e-${c.id}`" class="tw:border-t tw:border-divider/50 tw:bg-sidebar/40">
                <td :colspan="anyRequiresInstrument ? 5 : 4" class="tw:px-5 tw:py-2.5">
                  <div class="tw:text-micro tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-1.5">Evidence &amp; Comments</div>
                  <RichTextAttachments
                    v-model="entries[c.id].notes"
                    :readonly="!canEditResults"
                    placeholder="Add observations, photos, voice notes or attach reference files…"
                  />
                </td>
              </tr>

              <!-- ── Row 3: instructions from spec (collapsible) ─────── -->
              <tr v-if="isDetailOpen(c.id) && c.testMethod" :key="`i-${c.id}`" class="tw:border-t tw:border-divider/50 tw:bg-blue-50/40">
                <td :colspan="anyRequiresInstrument ? 5 : 4" class="tw:px-5 tw:py-2.5">
                  <div class="tw:text-micro tw:font-semibold tw:text-blue-600 tw:uppercase tw:tracking-wide tw:mb-1.5">Instructions</div>
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
      </div>

      <!-- Attributes (defect) inspection — additive; shown when a standard
           sampling plan resolved per-severity accept/reject numbers. -->
      <InspectionDefectsPanel
        v-if="lotPerSeverity.length"
        :perSeverity="lotPerSeverity"
        :defectiveUnits="defectiveUnitsByClass"
        :sampleSize="lot.sampleSize"
        :singleResult="!hasPerSampleResults"
      />

      <!-- Related records lineage (this lot → NC it caused). Self-hides when none. -->
      <RecordLineagePanel :id="props.id" type="InspectionLot" />
    </div>

    </div>
    </template>
    </BaseDetailLayout>

    <QualityEventCreateDialog
      v-model="showCreateEvent"
      title="Create Event"
      submitLabel="Create Event"
      :initialValues="qcEventInitialValues"
      :lockAssignedTo="true"
      @created="onEventCreated"
    />

    <InspectionLotSubmitDialog v-model="showSubmit" :lotId="props.id" />
    <InspectionLotCreateDialog v-model="showEdit" :editLot="lot" />
  </div>
</template>
