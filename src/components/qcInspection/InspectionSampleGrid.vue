<script setup>
/**
 * Per-sample capture grid (captureMode === 'SAMPLE'). A classic inspection data
 * sheet: one row per sampled unit (1…sampleSize), one column per characteristic
 * with its spec in the header. The inspector enters a value per cell; each cell
 * auto-evaluates against the spec limits (same rule the backend applies), and a
 * footer tallies pass/fail per characteristic.
 *
 * State lives locally in `grid[sampleIndex][charId]`; the parent reads it via
 * the exposed `buildPayload()` when the user clicks Save (one InspectionResult
 * row per non-empty cell, keyed by sampleIndex — the backend upserts).
 *
 * Ergonomics for 80-unit lots: "Fill ↓" copies the first row down a column, and
 * pasting a newline-separated column fills consecutive rows from the cell.
 */
import { IconArrowBarToDown, IconMessagePlus, IconMessage } from '@tabler/icons-vue'

const props = defineProps({
  characteristics: { type: Array, required: true },
  sampleSize: { type: Number, required: true },
  results: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
  // In-process progressive collection: the actual collected sample units
  // ({ sampleNo, collectedAt, collectedBy }). When provided, rows come from
  // these (grown over the shift) instead of a fixed 1..sampleSize range.
  samples: { type: Array, default: null },
  // sampleNo -> InspectionSample record (for the lot#, evidence state) — covers
  // both progressive + batch rows. And batchId -> production lot number.
  samplesByNo: { type: Object, default: () => ({}) },
  batchLots: { type: Object, default: () => ({}) },
})
// Emitted when the inspector opens the per-sample comments/evidence dialog.
const emit = defineEmits(['evidence'])

// The sample numbers that form the grid rows — collected samples in progressive
// mode, else the fixed 1..sampleSize range.
const sampleNos = computed(() =>
  Array.isArray(props.samples)
    ? props.samples.map((s) => s.sampleNo).sort((a, b) => a - b)
    : Array.from({ length: props.sampleSize }, (_, i) => i + 1),
)
const sampleMeta = computed(() => {
  const map = {}
  for (const s of props.samples ?? []) map[s.sampleNo] = s
  return map
})
function sampleHasEvidence(s) {
  const r = props.samplesByNo[s]
  return !!(r && (r.notes || (Array.isArray(r.attachments) && r.attachments.length)))
}
function sampleLotNo(s) {
  const r = props.samplesByNo[s]
  return r?.batchId ? props.batchLots[r.batchId] : null
}

// grid[sampleIndex][charId] = { valueNumeric, valueText, valueBool }
const grid = ref({})

function blankCell() {
  return { valueNumeric: null, valueText: '', valueBool: null }
}

function cellHasValue(cell) {
  return !!(
    cell &&
    ((cell.valueNumeric != null && cell.valueNumeric !== '') ||
      (cell.valueText && String(cell.valueText).trim()) ||
      cell.valueBool != null)
  )
}

function seed() {
  const prev = grid.value || {}
  const next = {}
  for (const s of sampleNos.value) {
    next[s] = {}
    for (const c of props.characteristics) next[s][c.id] = blankCell()
  }
  for (const r of props.results) {
    if (r.sampleIndex == null || !next[r.sampleIndex]) continue
    if (!next[r.sampleIndex][r.characteristicId]) continue
    next[r.sampleIndex][r.characteristicId] = {
      valueNumeric: r.valueNumeric ?? null,
      valueText: r.valueText ?? '',
      valueBool: r.valueBool ?? null,
    }
  }
  // Preserve unsaved local entries: anything typed into the grid beats the
  // seeded (saved) value — local state is newer. Without this, any live-query
  // refresh mid-entry (e.g. saving a per-sample comment updates the sample
  // record → `samples` prop gets a new array) re-seeded the grid and wiped
  // every unsaved cell (user-reported bug 2026-07-24).
  for (const s of Object.keys(prev)) {
    if (!next[s]) continue
    for (const cid of Object.keys(prev[s])) {
      if (!next[s][cid]) continue
      if (cellHasValue(prev[s][cid])) next[s][cid] = { ...prev[s][cid] }
    }
  }
  grid.value = next
}

// Re-seed when the sample set, characteristics, or saved results change.
watch(
  [() => props.sampleSize, () => props.samples, () => props.characteristics, () => props.results],
  seed,
  { immediate: true },
)

const sampleRows = computed(() => sampleNos.value)

function limitText(c) {
  if (c.testType !== 'NUMERIC') return c.testType === 'PASS_FAIL' ? 'Pass / Fail' : ''
  const parts = []
  if (c.targetValue != null) parts.push(`target ${c.targetValue}`)
  if (c.lsl != null) parts.push(`≥ ${c.lsl}`)
  if (c.usl != null) parts.push(`≤ ${c.usl}`)
  return [parts.join(', '), c.uom].filter(Boolean).join(' ')
}

// Mirror of inspectionResultService.evaluateOutcome.
function cellOutcome(c, cell) {
  if (!cell) return 'NA'
  if (c.testType === 'NUMERIC') {
    if (cell.valueNumeric == null || cell.valueNumeric === '') return 'NA'
    const v = Number(cell.valueNumeric)
    if (Number.isNaN(v)) return 'NA'
    if (c.lsl != null && v < Number(c.lsl)) return 'FAIL'
    if (c.usl != null && v > Number(c.usl)) return 'FAIL'
    return 'PASS'
  }
  if (c.testType === 'PASS_FAIL') {
    if (cell.valueBool == null) return 'NA'
    return cell.valueBool ? 'PASS' : 'FAIL'
  }
  return cell.valueText?.trim() ? 'PASS' : 'NA'
}

const tallies = computed(() => {
  const out = {}
  for (const c of props.characteristics) {
    let pass = 0
    let fail = 0
    for (const s of sampleNos.value) {
      const o = cellOutcome(c, grid.value[s]?.[c.id])
      if (o === 'PASS') pass += 1
      else if (o === 'FAIL') fail += 1
    }
    out[c.id] = { pass, fail }
  }
  return out
})

// Per-sample-unit verdict: a unit is defective (FAIL) if ANY of its
// characteristics fail; PASS once at least one cell is evaluated and none fail.
// This is the unit-level pass/fail that the AQL acceptance aggregates.
function sampleOutcome(s) {
  let anyFail = false
  let anyEval = false
  for (const c of props.characteristics) {
    const o = cellOutcome(c, grid.value[s]?.[c.id])
    if (o === 'FAIL') anyFail = true
    if (o !== 'NA') anyEval = true
  }
  if (anyFail) return 'FAIL'
  return anyEval ? 'PASS' : 'NA'
}
function unitBadgeClass(o) {
  if (o === 'FAIL') return 'tw:bg-red-100 tw:text-red-700'
  if (o === 'PASS') return 'tw:bg-green-100 tw:text-green-700'
  return 'tw:bg-gray-100 tw:text-gray-500'
}
const defectiveUnits = computed(
  () => sampleRows.value.filter((s) => sampleOutcome(s) === 'FAIL').length,
)

function cellClass(c, s) {
  const o = cellOutcome(c, grid.value[s]?.[c.id])
  if (o === 'PASS') return 'tw:border-green-300 tw:bg-green-50/40'
  if (o === 'FAIL') return 'tw:border-red-300 tw:bg-red-50/50'
  return 'tw:border-divider'
}

// Fill the first row's value down the whole column. Pass/Fail columns only —
// numeric measurements (and text observations) are per-unit readings and must
// be entered individually (user decision 2026-07-24). Shown whenever the grid
// actually has multiple rows (fixed 1..sampleSize AND in-process progressive
// samples — the old `sampleSize > 1` check hid it for IPQC lots).
function canFillDown(c) {
  return !props.readonly && sampleNos.value.length > 1 && c.testType === 'PASS_FAIL'
}
function fillDown(c) {
  if (!canFillDown(c)) return
  const nos = sampleNos.value
  const first = grid.value[nos[0]]?.[c.id]
  if (!first) return
  for (let i = 1; i < nos.length; i += 1) {
    grid.value[nos[i]][c.id] = { ...first }
  }
}

// Paste a newline-separated column → fill consecutive rows from this cell.
function onPaste(e, c, startSample) {
  const text = e.clipboardData?.getData('text') ?? ''
  if (!text.includes('\n')) return // single value — let the input handle it
  e.preventDefault()
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const nos = sampleNos.value
  const startIdx = nos.indexOf(startSample)
  if (startIdx < 0) return
  lines.forEach((line, i) => {
    const s = nos[startIdx + i]
    if (s == null || !grid.value[s]?.[c.id]) return
    if (c.testType === 'NUMERIC') grid.value[s][c.id].valueNumeric = line === '' ? null : Number(line)
    else if (c.testType === 'PASS_FAIL')
      grid.value[s][c.id].valueBool = /^(p|pass|y|yes|1|true)$/i.test(line)
    else grid.value[s][c.id].valueText = line
  })
}

function buildPayload() {
  const payload = []
  for (const s of sampleNos.value) {
    for (const c of props.characteristics) {
      const cell = grid.value[s]?.[c.id]
      if (!cell) continue
      const hasValue =
        (c.testType === 'NUMERIC' && cell.valueNumeric != null && cell.valueNumeric !== '') ||
        (c.testType === 'PASS_FAIL' && cell.valueBool != null) ||
        (c.testType === 'TEXT' && cell.valueText?.trim())
      if (!hasValue) continue
      payload.push({
        characteristicId: c.id,
        sampleIndex: s,
        valueNumeric: c.testType === 'NUMERIC' ? Number(cell.valueNumeric) : null,
        valueText: c.testType === 'TEXT' ? cell.valueText.trim() : null,
        valueBool: c.testType === 'PASS_FAIL' ? cell.valueBool : null,
      })
    }
  }
  return payload
}

// Pass/Fail is stored as valueBool (true/false, null = not answered). The select
// uses string ids so an unset cell stays truly empty — a boolean `false` reads
// as falsy in the select and gets confused with null/empty (auto-picks Pass).
const PF_ITEMS = [
  { id: 'PASS', name: 'Pass' },
  { id: 'FAIL', name: 'Fail' },
]
const pfStr = (b) => (b === true ? 'PASS' : b === false ? 'FAIL' : null)
const pfBool = (v) => (v === 'PASS' ? true : v === 'FAIL' ? false : null)

// Sample units with a FAILED outcome that have no per-sample comment (notes
// via the evidence dialog). Failing units must carry the documented reason —
// the parent blocks Save while any are missing.
function failedSamplesMissingComment() {
  return sampleNos.value.filter((s) => {
    if (sampleOutcome(s) !== 'FAIL') return false
    const rec = props.samplesByNo[s]
    return !(rec && rec.notes && String(rec.notes).trim())
  })
}

defineExpose({ buildPayload, failedSamplesMissingComment })
</script>

<template>
  <div class="tw:overflow-auto tw:max-h-[32rem] tw:border tw:border-divider tw:rounded-lg">
    <table class="tw:text-sm tw:border-collapse tw:w-full">
      <thead class="tw:sticky tw:top-0 tw:z-raised tw:bg-main-hover">
        <tr>
          <th
            class="tw:sticky tw:left-0 tw:z-dropdown tw:bg-main-hover tw:px-3 tw:py-2 tw:text-left tw:text-xs tw:text-secondary tw:uppercase tw:border-b tw:border-r tw:border-divider tw:w-48 tw:min-w-44"
          >
            Sample
          </th>
          <th
            v-for="c in characteristics"
            :key="c.id"
            class="tw:px-3 tw:py-2 tw:text-left tw:border-b tw:border-r tw:border-divider tw:min-w-36 tw:align-top"
          >
            <div class="tw:flex tw:flex-col tw:gap-1">
              <div class="tw:font-semibold tw:text-on-main">
                {{ c.name }}
                <DefectSeverityBadgeById
                  :severityId="c.defectClass || (c.isCritical ? 'CRITICAL' : 'MAJOR')"
                  class="tw:ml-1 tw:text-micro"
                />
              </div>
              <div class="tw:text-caption tw:text-secondary tw:font-normal">
                {{ limitText(c) || '—' }}
              </div>
              <button
                v-if="canFillDown(c)"
                type="button"
                class="tw:mt-0.5 tw:inline-flex tw:items-center tw:gap-1 tw:self-start tw:text-micro tw:font-medium tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
                @click="fillDown(c)"
              >
                <IconArrowBarToDown :size="13" /> Fill ↓
              </button>
            </div>
          </th>
          <th
            class="tw:px-3 tw:py-2 tw:text-left tw:text-caption tw:text-secondary tw:uppercase tw:tracking-wider tw:border-b tw:border-divider tw:w-20"
          >
            Unit
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in sampleRows" :key="s" class="tw:border-b tw:border-divider/60">
          <td
            class="tw:sticky tw:left-0 tw:z-raised tw:bg-sidebar tw:px-3 tw:py-1.5 tw:text-xs tw:text-secondary tw:border-r tw:border-divider"
            :class="sampleMeta[s] ? 'tw:text-left' : 'tw:text-center'"
          >
            <div class="tw:flex tw:items-center tw:justify-between tw:gap-1.5">
              <div class="tw:flex tw:items-center tw:gap-1.5">
                <span class="tw:font-semibold tw:text-on-main tw:text-sm">#{{ s }}</span>
                <span
                  v-if="sampleLotNo(s)"
                  class="tw:text-micro tw:rounded tw:bg-main-hover tw:px-1.5 tw:py-0.5 tw:text-on-main tw:font-medium"
                  :title="`Production lot ${sampleLotNo(s)}`"
                >
                  {{ sampleLotNo(s) }}
                </span>
              </div>
              <button
                type="button"
                class="tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:shrink-0"
                :class="sampleHasEvidence(s) ? 'tw:text-primary' : 'tw:text-secondary tw:hover:text-primary'"
                :title="sampleHasEvidence(s) ? 'Comments / evidence added' : 'Add comments / evidence'"
                @click="emit('evidence', s)"
              >
                <IconMessage v-if="sampleHasEvidence(s)" :size="15" />
                <IconMessagePlus v-else :size="15" />
              </button>
            </div>
            <div
              v-if="sampleMeta[s] || samplesByNo[s]?.shiftId"
              class="tw:mt-0.5 tw:flex tw:flex-wrap tw:items-center tw:gap-x-2 tw:gap-y-0.5 tw:text-micro tw:text-secondary"
            >
              <span v-if="sampleMeta[s]?.collectedAt">{{ sampleMeta[s].collectedAt.formatDate('time') }}</span>
              <UserBadgeById v-if="sampleMeta[s]?.collectedBy" :userId="sampleMeta[s].collectedBy" class="tw:text-micro" />
              <ShiftBadgeById v-if="samplesByNo[s]?.shiftId" :shiftId="samplesByNo[s].shiftId" />
            </div>
          </td>
          <td v-for="c in characteristics" :key="c.id" class="tw:px-2 tw:py-1 tw:border-r tw:border-divider/60">
            <input
              v-if="c.testType === 'NUMERIC'"
              v-model.number="grid[s][c.id].valueNumeric"
              type="number"
              :disabled="readonly"
              class="tw:w-24 tw:px-2 tw:py-1 tw:rounded tw:border tw:bg-white tw:text-on-main tw:outline-none focus:tw:border-primary"
              :class="cellClass(c, s)"
              @paste="(e) => onPaste(e, c, s)"
            />
            <BaseInlineSelect
              v-else-if="c.testType === 'PASS_FAIL'"
              :modelValue="pfStr(grid[s][c.id].valueBool)"
              :items="PF_ITEMS"
              :required="false"
              :disabled="readonly"
              placeholder="—"
              nullLabel="—"
              class="tw:w-24"
              @update:modelValue="(v) => (grid[s][c.id].valueBool = pfBool(v))"
            />
            <input
              v-else
              v-model="grid[s][c.id].valueText"
              type="text"
              :disabled="readonly"
              placeholder="observation"
              class="tw:w-36 tw:px-2 tw:py-1 tw:rounded tw:border tw:bg-white tw:text-on-main tw:outline-none focus:tw:border-primary"
              :class="cellClass(c, s)"
              @paste="(e) => onPaste(e, c, s)"
            />
          </td>
          <td class="tw:px-3 tw:py-1.5 tw:border-r tw:border-divider/60 tw:text-center">
            <span
              v-if="sampleOutcome(s) !== 'NA'"
              class="tw:text-micro tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full"
              :class="unitBadgeClass(sampleOutcome(s))"
            >
              {{ sampleOutcome(s) === 'FAIL' ? 'FAIL' : 'PASS' }}
            </span>
            <span v-else class="tw:text-xs tw:text-secondary">—</span>
          </td>
        </tr>
      </tbody>
      <tfoot class="tw:sticky tw:bottom-0 tw:bg-main-hover">
        <tr>
          <td
            class="tw:sticky tw:left-0 tw:z-raised tw:bg-main-hover tw:px-3 tw:py-2 tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:border-t tw:border-r tw:border-divider"
          >
            Result
          </td>
          <td
            v-for="c in characteristics"
            :key="c.id"
            class="tw:px-3 tw:py-2 tw:border-t tw:border-r tw:border-divider tw:text-xs"
          >
            <span class="tw:text-green-700 tw:font-semibold">{{ tallies[c.id].pass }}✓</span>
            <span class="tw:mx-1 tw:text-secondary">/</span>
            <span :class="tallies[c.id].fail ? 'tw:text-red-700 tw:font-semibold' : 'tw:text-secondary'"
              >{{ tallies[c.id].fail }}✗</span
            >
          </td>
          <td class="tw:px-3 tw:py-2 tw:border-t tw:border-r tw:border-divider tw:text-xs tw:text-center">
            <span :class="defectiveUnits ? 'tw:text-red-700 tw:font-semibold' : 'tw:text-secondary'">
              {{ defectiveUnits }} def.
            </span>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</template>
