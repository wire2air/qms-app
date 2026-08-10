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
  IconClockHour4,
} from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useRecordTrail } from '@/composables/useRecordTrail.js'
import { buildInspectionLotActions } from './inspectionLotDetailConfig.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()

const { visit: visitTrail } = useRecordTrail()
const saving = ref(false)
const acting = ref(false)
const showSubmit = ref(false)
const showReopen = ref(false)
const showEdit = ref(false)

const canExecute = computed(() => isAllowed(['inspection_qc:execute']))
const canDispose = computed(() => isAllowed(['inspection_qc:dispose']))
const canCreateNc = computed(() => isAllowed(['ncr:create']))
const canCreateEvent = computed(() => isAllowed(['quality_events:create']))

const lot = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.InspectionLot.findByPk(id),
  { models: ['InspectionLot'] },
)
const lotUom = useLiveQueryWithDeps(
  [() => lot.value?.uomId],
  async (db, [id]) => (id ? db.Uom.findByPk(id) : null),
  { models: ['Uom'] },
)
// Sampling basis, in the plan's own terms: formula lots sample CONTAINERS
// (√N + 1), everything else samples units of the lot quantity. Built in JS so
// spacing is explicit (template whitespace condensing ate the unit gap).
const isFormulaLot = computed(() => lot.value?.samplingSnapshot?.planType === 'FORMULA')
const uomShort = computed(() => (lotUom.value?.code ? lotUom.value.code.toLowerCase() : ''))
const quantityDisplay = computed(() => {
  const q = lot.value?.quantity
  if (q == null) return null
  return uomShort.value ? `${q} ${uomShort.value}` : `${q}`
})
const sampleSummary = computed(() => {
  const l = lot.value
  if (!l) return ''
  const n = l.sampleSize ?? '—'
  if (isFormulaLot.value && l.containerCount) {
    return `sample ${n} of ${l.containerCount} containers${quantityDisplay.value ? ` · ${quantityDisplay.value}` : ''}`
  }
  return `sample ${n}${quantityDisplay.value ? ` of ${quantityDisplay.value}` : ''}`
})
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

// Mirrors the backend calibration gate (inspectionResultService): capture is
// blocked when a calibration-tracked instrument is out of calibration OR has no
// recorded calibration at all.
const calibrationBlocked = computed(() => {
  const eq = equipment.value
  if (!eq?.requiresCalibration) return false
  const due = eq.nextCalibrationDue
  return !due || due.toMillis() < Date.now()
})
const calibrationReason = computed(() => {
  const due = equipment.value?.nextCalibrationDue
  if (!due) return 'has no recorded calibration'
  return `is out of calibration (due ${due.formatDate('date')})`
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

// In-process (IPQC) progressive collection: samples are pulled off the line over
// the shift; the grid rows come from the collected samples (not a fixed range).
const isInProcess = computed(() => lot.value?.inspectionPoint === 'IN_PROCESS')
const collectedSamples = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) =>
    db.InspectionSample.where('inspectionLotId', id).orderBy('sampleNo', 'asc').exec(),
  { models: ['InspectionSample'], initial: [] },
)
const samplingPlan = useLiveQueryWithDeps(
  [() => lot.value?.samplingPlanId],
  async (db, [id]) => (id ? db.SamplingPlan.findByPk(id) : null),
  { models: ['SamplingPlan'] },
)
const showCollect = ref(false)

// Production lots (batches) within this QC inspection + per-sample lookups.
const batches = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.InspectionBatch.where('inspectionLotId', id).orderBy('createdAt', 'asc').exec(),
  { models: ['InspectionBatch'], initial: [] },
)
const batchLots = computed(() => {
  const map = {}
  for (const b of batches.value) map[b.id] = b.lotNumber || 'Lot'
  return map
})
const samplesByNo = computed(() => {
  const map = {}
  for (const s of collectedSamples.value) map[s.sampleNo] = s
  return map
})
const showAddLot = ref(false)
const showEvidence = ref(false)
const evidenceSampleNo = ref(null)
const evidenceSample = computed(() =>
  evidenceSampleNo.value != null ? (samplesByNo.value[evidenceSampleNo.value] ?? null) : null,
)
function openEvidence(sampleNo) {
  evidenceSampleNo.value = sampleNo
  showEvidence.value = true
}
// Open production lots only — used by the Collect / evidence dialogs, which
// can't target a closed lot.
const activeBatchOptions = computed(() =>
  batches.value
    .filter((b) => !b.closedAt)
    .map((b) => ({ id: b.id, label: b.lotNumber || `Lot ${b.id.slice(0, 6)}` })),
)
const activeBatch = computed(() => batches.value.find((b) => b.id === lot.value?.activeBatchId) ?? null)
// Single lot control: pick a production lot (open OR closed) to view its samples,
// or "All lots". Selecting an OPEN lot also makes it the active collection
// target; collecting is guarded when the current lot is closed or "All".
const currentLotId = ref(null)
// "All lots" comes from the select's nullLabel (value null) — don't add it here too.
const viewLotOptions = computed(() =>
  batches.value.map((b) => ({
    id: b.id,
    label: (b.lotNumber || `Lot ${b.id.slice(0, 6)}`) + (b.closedAt ? ' (closed)' : ''),
  })),
)
const currentBatch = computed(() =>
  currentLotId.value ? (batches.value.find((b) => b.id === currentLotId.value) ?? null) : null,
)
const filteredSamples = computed(() =>
  currentLotId.value
    ? collectedSamples.value.filter((s) => s.batchId === currentLotId.value)
    : collectedSamples.value,
)
// Follow the active lot (set on add-lot / check-in / selecting an open lot).
watch(() => lot.value?.activeBatchId, (id) => { currentLotId.value = id ?? null }, { immediate: true })
async function onSelectLot(id) {
  currentLotId.value = id ?? null
  const b = id ? batches.value.find((x) => x.id === id) : null
  // Selecting an open lot makes it the active collection target. Closed lots and
  // "All" are view-only (collection is guarded).
  if (b && !b.closedAt && id !== lot.value?.activeBatchId) {
    try {
      await post(`/v1/services/qcInspection/lots/${props.id}/active-batch`, { batchId: id })
    } catch (err) {
      toast.error(err?.message || 'Failed to select production lot')
    }
  }
}
// Collect is only allowed against a specific OPEN production lot.
const collectBlockedByLot = computed(() => !currentBatch.value || !!currentBatch.value.closedAt)
async function doCloseLot() {
  const b = currentBatch.value
  if (!b || b.closedAt) return
  const label = b.lotNumber || `Lot ${b.id.slice(0, 6)}`
  const ok = await confirm({
    title: 'Close production lot?',
    message: `Close ${label}? Its line run is done — you won't be able to select it or collect more samples against it. Already-collected samples keep their results.`,
    okLabel: 'Close lot',
    danger: true,
  })
  if (!ok) return
  try {
    await post(`/v1/services/qcInspection/lots/${props.id}/batches/${b.id}/close`, {})
    toast.success(`Closed ${label}`)
  } catch (err) {
    toast.error(err?.message || 'Failed to close production lot')
  }
}

// Active inspector (shift check-in): only they may run execute actions.
const currentUserId = computed(() => currentSession.value?.userId || null)
const isActiveInspector = computed(
  () => !!lot.value?.assignedTo && lot.value.assignedTo === currentUserId.value,
)
const hasInspector = computed(() => !!lot.value?.assignedTo)

// Line clearance (in-process): the company's configured checklist + gate flag.
const clearanceTemplate = useLiveQuery(
  async (db) => (await db.FormTemplate.where().exec()).find((t) => t.internalName === 'QC_LINE_CLEARANCE') ?? null,
  { models: ['FormTemplate'], initial: null },
)
const lineClearanceRequired = computed(() => !!clearanceTemplate.value?.config?.lineClearanceRequired)
// Clearance is per PRODUCTION LOT (active batch) — a new lot is a line changeover.
const activeBatchClearanceStatus = computed(() => activeBatch.value?.lineClearanceStatus ?? 'NOT_STARTED')
const lineClearancePassed = computed(() => activeBatchClearanceStatus.value === 'PASSED')
const lineClearanceFailed = computed(() => activeBatchClearanceStatus.value === 'FAILED')
// Show the clearance control while capturing an in-process lot with an active production lot.
const canRecordClearance = computed(
  () => isInProcess.value && canExecute.value && isActiveInspector.value && !!activeBatch.value && isCapturing.value,
)
const needsLineClearance = computed(
  () => canRecordClearance.value && lineClearanceRequired.value && !lineClearancePassed.value,
)
// Collection is blocked until the active lot's line is cleared (when required).
const collectBlockedByClearance = computed(
  () => isInProcess.value && lineClearanceRequired.value && !lineClearancePassed.value,
)
const showLineClearance = ref(false)

const canCollect = computed(
  () =>
    isInProcess.value &&
    canExecute.value &&
    isActiveInspector.value &&
    lot.value?.statusId === 'IN_PROGRESS',
)

// Collection cadence — drive off the plan's interval + the last collected time.
// Collect is blocked until 5 min before the next due; a banner flashes as it
// approaches / falls due.
const nowClock = useNow({ interval: 15000 })
const nowDt = computed(() => DateTime.fromJSDate(nowClock.value))
const intervalMin = computed(() => samplingPlan.value?.collectionIntervalMinutes || null)
const lastCollectedAt = computed(() => {
  const times = collectedSamples.value.map((s) => s.collectedAt).filter(Boolean)
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null
})
const nextDueAt = computed(() =>
  lastCollectedAt.value && intervalMin.value
    ? lastCollectedAt.value.plus({ minutes: intervalMin.value })
    : null,
)
const collectAllowedAt = computed(() =>
  nextDueAt.value ? nextDueAt.value.minus({ minutes: 5 }) : null,
)
// Too early to collect the next window (before the 5-min grace).
const collectTooEarly = computed(
  () => !!nextDueAt.value && nowDt.value < collectAllowedAt.value,
)
const collectionDue = computed(() => !!nextDueAt.value && nowDt.value >= nextDueAt.value)
const collectionApproaching = computed(
  () => !!nextDueAt.value && !collectionDue.value && nowDt.value >= collectAllowedAt.value,
)
// Always-on cadence status shown while collecting: green until the window opens,
// amber in the −5 min grace, red (pulsing) once overdue.
const CADENCE_CLASS = {
  green: 'tw:bg-green-50 tw:border-green-300 tw:text-green-800',
  amber: 'tw:bg-amber-50 tw:border-amber-300 tw:text-amber-900',
  red: 'tw:bg-red-50 tw:border-red-300 tw:text-red-800',
}
const cadence = computed(() => {
  // First sample: nothing collected yet, so it's due now — collect to start the cadence.
  if (!lastCollectedAt.value)
    return { color: 'amber', pulse: false, text: 'Sample collection is due now — collect the first sample.' }
  // Samples exist but no interval configured — no scheduled next time.
  if (!intervalMin.value || !nextDueAt.value)
    return { color: 'green', pulse: false, text: 'Collect the next sample when ready — no fixed interval set.' }
  const at = nextDueAt.value.formatDate('time')
  if (collectionDue.value) return { color: 'red', pulse: true, text: `Sample collection is due now — was due ${at}.` }
  if (collectionApproaching.value) return { color: 'amber', pulse: false, text: `Next sample collection due soon — ${at}.` }
  return { color: 'green', pulse: false, text: `Next sample collection at ${at}.` }
})
// Per-sample data was actually captured (any result on a unit beyond #1).
const hasPerSampleResults = computed(() => results.value.some((r) => (r.sampleIndex ?? 1) > 1))
const canSampleCapture = computed(() => (lot.value?.sampleSize ?? 0) > 1)
const isCapturing = computed(() => ['DRAFT', 'PENDING', 'IN_PROGRESS'].includes(lot.value?.statusId))
// Render the per-sample data sheet when in SAMPLE mode; a FROZEN lot with
// per-sample results also keeps its data sheet (read-only) regardless of how
// captureMode reads back. While actively capturing, the toggle drives the view
// strictly — the old `hasPerSampleResults` override kept the sheet on screen
// after switching to Single result, so the toggle looked dead (user-reported;
// the backend now clears unit rows on that transition, after a confirm).
const showSampleGrid = computed(
  () =>
    isInProcess.value ||
    isSampleMode.value ||
    (hasPerSampleResults.value && !isCapturing.value),
)
// Results are editable/saveable only while the lot is actively being captured
// (DRAFT/PENDING/IN_PROGRESS). Once COMPLETED — and through review/disposition —
// they're frozen: no Save button, inputs read-only.
const canEditResults = computed(
  () => canExecute.value && isCapturing.value && isActiveInspector.value,
)
const sampleGridRef = ref(null)
const savingMode = ref(false)
async function setCaptureMode(mode) {
  if (savingMode.value || lot.value?.captureMode === mode) return
  if (mode === 'SAMPLE' && !canSampleCapture.value) return
  // Dropping to Single result discards the per-unit data sheet — warn first
  // (the backend deletes unit rows #2+ on this transition; #1 rows double as
  // the single-result values and are kept).
  if (mode === 'LOT' && hasPerSampleResults.value) {
    const ok = await confirm({
      title: 'Switch to Single result?',
      message:
        'Per-sample results have already been recorded. Switching to Single result deletes the entries for sample #2 and up (sample #1 becomes the single result). This cannot be undone.',
      okLabel: 'Switch & delete',
      danger: true,
    })
    if (!ok) return
  }
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
  // A failed sample unit needs its documented reason — per-sample comments
  // via the row's evidence dialog (user rule 2026-07-24).
  if (showSampleGrid.value) {
    const missing = sampleGridRef.value?.failedSamplesMissingComment?.() ?? []
    if (missing.length) {
      toast.error(
        `Add a comment for each failed sample (use the comment icon on the row): #${missing.join(', #')}`,
      )
      return
    }
  }
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

const showCheckIn = ref(false)
function doCheckIn() {
  showCheckIn.value = true
}
async function doCheckOut() {
  const incomplete = isInProcess.value && lot.value?.sampleSize && collectedSamples.value.length < lot.value.sampleSize
  const ok = await confirm({
    title: 'End your shift?',
    message: incomplete
      ? `You've collected ${collectedSamples.value.length} of ${lot.value.sampleSize} planned samples. Check out and release the inspection so another QC user can take over?`
      : 'Check out and release the active-inspector role? Another QC user can then take over.',
    okLabel: 'Check out',
  })
  if (!ok) return
  await act('check-out', 'Checked out — shift ended')
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
      isActiveInspector: isActiveInspector.value,
      hasInspector: hasInspector.value,
    },
    {
      checkIn: doCheckIn,
      checkOut: doCheckOut,
      edit() {
        showEdit.value = true
      },
      async complete() {
        // In-process: warn if fewer than the planned samples were collected.
        if (
          isInProcess.value &&
          lot.value?.sampleSize &&
          collectedSamples.value.length < lot.value.sampleSize
        ) {
          const ok = await confirm({
            title: 'Complete with fewer samples?',
            message: `Collected ${collectedSamples.value.length} of ${lot.value.sampleSize} planned samples. Complete the inspection anyway?`,
            okLabel: 'Complete',
          })
          if (!ok) return
        }
        await act('complete', 'Lot completed')
      },
      submit() {
        showSubmit.value = true
      },
      reopen() {
        showReopen.value = true
      },
      createEvent() {
        openCreateEvent()
      },
      print() {
        const params = new URLSearchParams({ module: 'InspectionLot', id: props.id })
        window.open(getCompanyPath(`/print?${params.toString()}`), '_blank', 'noopener,noreferrer')
      },
    },
  ),
)
const inspectionLotDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'wide',
    breadcrumbs: moduleCrumbs.value,
    actions: inspectionLotActions.value,
    sections: [{ id: 'details', label: 'Details' }],
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
    :rail="true"
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
        · {{ sampleSummary }}
      </span>
      <span v-if="lot.qualityState"> · {{ lot.qualityState }}</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="inspectionLotActions" :maxVisible="4" />
    </template>

    <template v-if="lot" #section-details>
      <div class="tw:flex tw:flex-col tw:gap-5">
        <RecordTrailBreadcrumb />

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
      v-if="calibrationBlocked && anyRequiresInstrument"
      class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-2.5 tw:text-sm tw:flex tw:items-center tw:gap-2 tw:flex-wrap"
    >
      <IconAlertTriangle :size="16" class="tw:text-amber-600 tw:shrink-0" />
      <span class="tw:text-amber-900">
        <span class="tw:font-semibold">{{ equipment?.name || 'The default instrument' }}</span>
        {{ calibrationReason }} — instrument-based tests using it will be blocked. Pick a different
        instrument on those rows, or record a calibration.
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

        <!-- Line clearance (in-process, before the inspection starts). -->
        <div
          v-if="canRecordClearance"
          class="tw:rounded-lg tw:border tw:px-4 tw:py-3 tw:flex tw:items-center tw:justify-between tw:gap-3"
          :class="
            lineClearancePassed
              ? 'tw:border-green-300 tw:bg-green-50'
              : lineClearanceFailed
                ? 'tw:border-red-300 tw:bg-red-50'
                : needsLineClearance
                  ? 'tw:border-amber-300 tw:bg-amber-50'
                  : 'tw:border-divider tw:bg-sidebar'
          "
        >
          <div class="tw:text-sm tw:min-w-0">
            <div class="tw:font-medium tw:text-on-main">
              Line clearance<span v-if="activeBatch" class="tw:text-secondary tw:font-normal"> — Lot {{ activeBatch.lotNumber || '—' }}</span>
            </div>
            <div class="tw:text-xs tw:mt-0.5 tw:text-secondary">
              <span v-if="lineClearancePassed">Line released — cleared to collect against this lot.</span>
              <span v-else-if="lineClearanceFailed">Line on hold — clearance failed. Re-clear before collecting.</span>
              <span v-else-if="needsLineClearance">Required before collecting samples against this lot.</span>
              <span v-else>Optional — record the line sanitation / clearance for this lot.</span>
            </div>
          </div>
          <BaseButton
            :variant="needsLineClearance || lineClearanceFailed ? 'primary' : 'outline'"
            size="sm"
            class="tw:shrink-0"
            @click="showLineClearance = true"
          >
            {{ lineClearancePassed || lineClearanceFailed ? 'Review clearance' : 'Record clearance' }}
          </BaseButton>
        </div>

        <!-- In-process collection cadence — always shown while collecting: green
             until due, amber in the −5 min grace, red (pulsing) when overdue. -->
        <div
          v-if="canCollect"
          class="tw:rounded-lg tw:border tw:px-4 tw:py-2.5 tw:text-sm tw:flex tw:items-center tw:gap-2"
          :class="[CADENCE_CLASS[cadence.color], cadence.pulse ? 'tw:animate-pulse' : '']"
        >
          <IconAlertTriangle v-if="cadence.color !== 'green'" :size="16" class="tw:shrink-0" />
          <IconClockHour4 v-else :size="16" class="tw:shrink-0" />
          <span>{{ cadence.text }}</span>
          <BaseButton
            :variant="collectionDue ? 'danger' : 'secondary'"
            size="sm"
            class="tw:ml-auto tw:shrink-0"
            :disabled="collectTooEarly || collectBlockedByLot || collectBlockedByClearance"
            :title="
              collectBlockedByLot
                ? 'Select an open production lot to collect samples'
                : collectBlockedByClearance
                  ? 'Line clearance required for this lot before collecting'
                  : ''
            "
            @click="showCollect = true"
          >
            Collect sample(s)
          </BaseButton>
        </div>

        <!-- Not the active inspector — read-only until you check in. -->
        <div
          v-if="isCapturing && canExecute && !isActiveInspector"
          class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:px-4 tw:py-2.5 tw:text-sm tw:text-amber-900"
        >
          <span v-if="hasInspector">
            This inspection is checked out to another inspector — use
            <strong>Take over (check in)</strong> above to edit.
          </span>
          <span v-else>
            No inspector is checked in. Use <strong>Check in</strong> above to start / edit this
            inspection.
          </span>
        </div>

      <!-- Results capture grid -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div class="tw:px-5 tw:py-3 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
          <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
            <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">Results</h3>
            <!-- Batch (incoming/final): Single vs Per-sample. Hidden for in-process,
                 which is always progressive per-sample collection. -->
            <div
              v-if="canExecute && isCapturing && !isInProcess"
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
            <!-- In-process: progress + collection guidance. -->
            <span
              v-if="isInProcess"
              class="tw:text-xs tw:rounded-full tw:bg-main-hover tw:px-2.5 tw:py-1 tw:text-secondary"
            >
              Collected
              <strong class="tw:text-on-main">{{ collectedSamples.length }}</strong>
              <span v-if="lot.sampleSize"> / {{ lot.sampleSize }} planned</span>
              <span v-if="samplingPlan?.perCollectionSize || samplingPlan?.collectionIntervalMinutes">
                · guide {{ samplingPlan.perCollectionSize || '—' }}
                <span v-if="samplingPlan.collectionIntervalMinutes">
                  every {{ samplingPlan.collectionIntervalMinutes }}m</span
                >
              </span>
            </span>
            <!-- In-process: single production-lot control — pick a lot (open OR
                 closed) to view its samples, or "All lots". Selecting an open lot
                 also targets it for collection; Add / Close when collecting. -->
            <div
              v-if="isInProcess && (batches.length || canCollect)"
              class="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-primary/40 tw:bg-primary/5 tw:px-2.5 tw:py-1.5"
            >
              <span class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-primary">Lot#</span>
              <BaseSelect
                :modelValue="currentLotId"
                :options="viewLotOptions"
                optionLabel="label"
                optionValue="id"
                nullLabel="All lots"
                size="md"
                class="tw:min-w-40 tw:font-semibold"
                @update:modelValue="onSelectLot"
              />
              <BaseButton v-if="canCollect" variant="ghost" size="sm" @click="showAddLot = true">+ Add Lot</BaseButton>
              <BaseButton
                v-if="canCollect && currentBatch && !currentBatch.closedAt"
                variant="ghost"
                size="sm"
                class="tw:text-bad"
                title="Close this production lot — done with its line run"
                @click="doCloseLot"
              >
                Close lot
              </BaseButton>
            </div>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseButton
              v-if="canCollect"
              :variant="collectionDue ? 'danger' : 'secondary'"
              size="sm"
              :class="collectionDue ? 'tw:animate-pulse' : ''"
              :disabled="collectTooEarly || collectBlockedByLot || collectBlockedByClearance"
              :title="
                collectBlockedByLot
                  ? 'Select an open production lot to collect samples'
                  : collectBlockedByClearance
                    ? 'Line clearance required for this lot before collecting'
                    : collectTooEarly && nextDueAt
                      ? `Next collection at ${nextDueAt.formatDate('time')}`
                      : ''
              "
              @click="showCollect = true"
            >
              Collect sample(s)
            </BaseButton>
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
                <div class="tw:text-caption tw:font-semibold tw:text-blue-600 tw:uppercase tw:tracking-wider tw:mb-1.5">
                  {{ c.name }} — Instructions
                </div>
                <RichTextAttachments :modelValue="c.testMethod" :readonly="true" />
              </div>
            </div>
          </div>
          <!-- In-process, nothing collected yet — prompt to collect. -->
          <p
            v-if="characteristics.length && isInProcess && !collectedSamples.length"
            class="tw:text-center tw:text-secondary tw:py-6"
          >
            <span v-if="canCollect">No samples collected yet — click <strong>Collect sample(s)</strong> to record units pulled from the line.</span>
            <span v-else>No samples collected. Check in to start the inspection and begin collecting samples.</span>
          </p>
          <InspectionSampleGrid
            v-else-if="characteristics.length"
            ref="sampleGridRef"
            :characteristics="characteristics"
            :sampleSize="lot.sampleSize"
            :samples="isInProcess ? filteredSamples : null"
            :samplesByNo="samplesByNo"
            :batchLots="batchLots"
            :results="results"
            :readonly="!canEditResults"
            @evidence="openEvidence"
          />
          <p v-else class="tw:text-center tw:text-secondary tw:py-6">
            No specification linked to this lot — switch to Single result and pick a Specification via Edit.
          </p>
        </div>

        <div v-else class="tw:overflow-x-auto">
        <table class="tw:w-full tw:min-w-[640px] tw:text-sm">
          <thead class="tw:text-secondary tw:text-table-header tw:uppercase tw:tracking-wider">
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
                  <PassFailRadio
                    v-else-if="c.testType === 'PASS_FAIL'"
                    v-model="entries[c.id].valueBool"
                    :disabled="!canEditResults"
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
                  <div class="tw:text-caption tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mb-1.5">Evidence &amp; Comments</div>
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
                  <div class="tw:text-caption tw:font-semibold tw:text-blue-600 tw:uppercase tw:tracking-wider tw:mb-1.5">Instructions</div>
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
    </template>

    <!-- Persistent right rail — all lot metadata (mirrors NC/CAPA) + read-only COA. -->
    <template v-if="lot" #rail>
      <InspectionLotRail :lotId="props.id" />
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
    <InspectionLotReopenDialog v-model="showReopen" :lotId="props.id" />
    <InspectionCheckInDialog v-model="showCheckIn" :lotId="props.id" :lot="lot" />
    <InspectionLineClearanceDialog
      v-model="showLineClearance"
      :lotId="props.id"
      :batchId="lot?.activeBatchId"
      :batch="activeBatch"
    />
    <InspectionAddLotDialog
      v-model="showAddLot"
      :lotId="props.id"
      :defaultShiftId="lot?.shiftId || null"
    />
    <InspectionSampleEvidenceDialog
      v-model="showEvidence"
      :lotId="props.id"
      :sampleNo="evidenceSampleNo"
      :sample="evidenceSample"
      :batchOptions="isInProcess ? activeBatchOptions : []"
      :readonly="!canEditResults"
    />
    <InspectionCollectSamplesDialog
      v-model="showCollect"
      :lotId="props.id"
      :defaultCount="samplingPlan?.perCollectionSize || null"
      :activeBatchId="lot?.activeBatchId"
      :batchOptions="activeBatchOptions"
      @addLot="showCollect = false; showAddLot = true"
    />
    <InspectionLotCreateDialog v-model="showEdit" :editLot="lot" />
  </div>
</template>
