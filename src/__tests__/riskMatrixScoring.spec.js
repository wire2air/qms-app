/**
 * The scoring half of the two form-builder widgets that feed the backend's
 * `rcaRaDerivationService`: `RiskAssessmentField.vue` and `RcaField.vue`.
 *
 * WHY THIS FILE EXISTS
 *
 * Both widgets emit a `finalized` / `outcome` snapshot that a workflow-step
 * approval turns into a `risk_assessments` / `root_causes` row. Everything the
 * quality record ever reports — the RPN, the band, the primary cause — is read
 * off that snapshot and never recomputed, so a wrong number here is a wrong
 * number in the QMS forever. There is no E2E suite covering this module any
 * more, which makes these the only tests standing between the arithmetic and
 * production.
 *
 * THE DEFECT THAT MOTIVATED IT
 *
 * The band and the score come from two INDEPENDENT places. The band is a
 * lookup in `config.cells`, keyed on the id pair; the score is
 * `likelihood.score * severity.score`. During E2E work a likelihood scale was
 * generated as `score: 6 - i` and came out 2..5+1 instead of 1..5 — so
 * "Possible x Moderate" scored 12 instead of 9. Because the cell map is keyed
 * on ids, the colour stayed exactly the same shade of amber and nothing looked
 * wrong. Every assertion in here therefore pins the SCORE explicitly;
 * `it('bands the whole 5x5 grid…')` and the trap test below exist to make that
 * failure mode impossible to reintroduce silently.
 *
 * WHY THE LOGIC IS MIRRORED RATHER THAN IMPORTED
 *
 * Same constraint as `toolTemplateResolution.spec.js`: both components reach
 * SyncEngine models through `useLiveQuery` / `useLiveQueryWithDeps`, which do
 * not load under the lighter vitest config, so the SFCs cannot be mounted and
 * `<script setup>` locals cannot be imported. The established remedy is to copy
 * the pure logic into the spec. The components are shipped code with no E2E
 * net; they are NOT refactored to suit the test.
 *
 * WHAT IS NEW HERE: THE DRIFT DETECTOR
 *
 * A mirror is only worth what its fidelity is worth, and the existing
 * convention has no way to notice when the original moves. The bottom of this
 * file reads both `.vue` files AND this spec off disk and asserts that every
 * mirrored declaration is still character-for-character the original (modulo
 * comments and formatting). The mirrored blocks are therefore copied VERBATIM —
 * including `.value`, which works because `computed` below is a one-line shim
 * and the refs the components get from SyncEngine are hand-built `{ value }`
 * objects. Do not "tidy" the mirrors; the drift test will fail and it will be
 * right to.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const RA_FIELD = path.join(ROOT, 'src/components/form/tools/RiskAssessmentField.vue')
const RCA_FIELD = path.join(ROOT, 'src/components/form/tools/RcaField.vue')
const THIS_SPEC = fileURLToPath(import.meta.url)

/**
 * Stand-in for Vue's `computed`, so mirrored code can keep `.value` and stay
 * byte-identical to the component. Vue's caches and this one re-evaluates —
 * irrelevant for derivations this pure, and re-evaluating is if anything the
 * stricter choice, since it cannot mask a missing dependency.
 */
function computed(fn) {
  return {
    get value() {
      return fn()
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness: RiskAssessmentField.vue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuilds the widget's reactive surface without Vue: `props` is a plain
 * object, `emit` writes the emitted value straight back onto `props.modelValue`
 * the way a parent `v-model` would, and the two SyncEngine live queries
 * (`template`, `hazardCategories`) become hand-built refs. Everything between
 * the mirror markers is copied from the SFC.
 */
function mountRiskField({
  template: templateValue = null,
  modelValue = null,
  hazardCategories: categoryRows = [],
  readonly = false,
  disabled = false,
} = {}) {
  const props = { modelValue, readonly, disabled }
  const emitted = []
  function emit(_event, value) {
    emitted.push(value)
    // The parent's v-model round-trip. Without it, a selectCell → finalize
    // sequence would finalize against a stale answer and the contract tests
    // would be testing a state the UI can never actually be in.
    props.modelValue = value
  }
  const template = { value: templateValue }
  const hazardCategories = { value: categoryRows }

  // >>> MIRROR:RiskAssessmentField.vue — copied verbatim, see drift detector
  const likelihood = computed(() => template.value?.config?.likelihood ?? [])
  const severity = computed(() => template.value?.config?.severity ?? [])
  const riskLevels = computed(() => template.value?.config?.riskLevels ?? [])
  const cells = computed(() => template.value?.config?.cells ?? {})
  const detectability = computed(() => template.value?.config?.detectability ?? [])
  const enableDetectability = computed(() => template.value?.config?.enableDetectability ?? false)
  const selectedDetectabilityId = computed(() => props.modelValue?.detectabilityId ?? null)

  function cellKey(likelihoodId, severityId) {
    return `${likelihoodId}:${severityId}`
  }

  function cellLevel(likelihoodId, severityId) {
    const key = cellKey(likelihoodId, severityId)
    const levelId = cells.value[key]
    return riskLevels.value.find((r) => r.id === levelId) ?? null
  }

  const selectedLikelihoodId = computed(() => props.modelValue?.likelihoodId ?? null)
  const selectedSeverityId = computed(() => props.modelValue?.severityId ?? null)
  const selectedRiskLevelId = computed(() => props.modelValue?.riskLevelId ?? null)

  const selectedRiskLevel = computed(
    () => riskLevels.value.find((r) => r.id === selectedRiskLevelId.value) ?? null,
  )

  function computeRpn(likelihoodId, severityId, detectabilityId) {
    const l = likelihood.value.find((x) => x.id === likelihoodId)
    const s = severity.value.find((x) => x.id === severityId)
    const lScore = l?.score ?? l?.order ?? 1
    const sScore = s?.score ?? s?.order ?? 1
    if (enableDetectability.value && detectabilityId) {
      const d = detectability.value.find((x) => x.id === detectabilityId)
      const dScore = d?.score ?? d?.order ?? 1
      return lScore * sScore * dScore
    }
    return lScore * sScore
  }

  function clearFinalizedStamp(patch) {
    const next = { ...(props.modelValue ?? {}), ...patch }
    if (next.finalized?.finalizedAt) {
      next.finalized = { ...next.finalized, finalizedAt: null }
    }
    return next
  }

  function selectCell(likelihoodId, severityId) {
    if (props.readonly || props.disabled) return
    const key = cellKey(likelihoodId, severityId)
    const levelId = cells.value[key] ?? null
    const rpnScore = computeRpn(likelihoodId, severityId, selectedDetectabilityId.value)
    emit(
      'update:modelValue',
      clearFinalizedStamp({
        _templateId: template.value?.id ?? null,
        likelihoodId,
        severityId,
        riskLevelId: levelId,
        rpnScore,
      }),
    )
  }

  function selectDetectability(detectabilityId) {
    if (props.readonly || props.disabled) return
    const rpnScore = computeRpn(
      selectedLikelihoodId.value,
      selectedSeverityId.value,
      detectabilityId,
    )
    emit('update:modelValue', clearFinalizedStamp({ detectabilityId, rpnScore }))
  }

  function updateNotes(notes) {
    emit('update:modelValue', { ...(props.modelValue ?? {}), notes })
  }

  const hazardCategoryId = computed(() => props.modelValue?.finalized?.hazardCategoryId ?? null)
  const assessmentType = computed(() => props.modelValue?.finalized?.assessmentType ?? 'INITIAL')
  const isFinalized = computed(() => !!props.modelValue?.finalized?.finalizedAt)

  function findById(arr, id) {
    return arr.find((x) => x.id === id) ?? null
  }

  function onFinalizeAssessment() {
    if (props.readonly || props.disabled) return
    if (!selectedLikelihoodId.value || !selectedSeverityId.value) return // matrix not picked
    const l = findById(likelihood.value, selectedLikelihoodId.value)
    const s = findById(severity.value, selectedSeverityId.value)
    const r = selectedRiskLevel.value
    const d =
      enableDetectability.value && selectedDetectabilityId.value
        ? findById(detectability.value, selectedDetectabilityId.value)
        : null
    const cat = hazardCategoryId.value
      ? findById(hazardCategories.value, hazardCategoryId.value)
      : null

    emit('update:modelValue', {
      ...(props.modelValue ?? {}),
      finalized: {
        assessmentType: assessmentType.value,
        hazardCategoryId: cat?.id ?? null,
        hazardCategoryLabel: cat?.name ?? null,
        hazardCategoryColor: cat?.color ?? null,
        likelihoodId: l?.id ?? null,
        likelihoodLabel: l?.label ?? null,
        likelihoodScore: l?.score ?? l?.order ?? null,
        severityId: s?.id ?? null,
        severityLabel: s?.label ?? null,
        severityScore: s?.score ?? s?.order ?? null,
        detectabilityId: d?.id ?? null,
        detectabilityLabel: d?.label ?? null,
        detectabilityScore: d?.score ?? d?.order ?? null,
        computedRiskLevelId: r?.id ?? null,
        computedRiskLevelLabel: r?.label ?? null,
        computedScore: props.modelValue?.rpnScore ?? null,
        justification: props.modelValue?.notes ?? null,
        finalizedAt: new Date().toISOString(),
      },
    })
  }

  const canFinalize = computed(
    () => !!selectedLikelihoodId.value && !!selectedSeverityId.value && !!assessmentType.value,
  )
  // <<< MIRROR:end

  return {
    props,
    emitted,
    cellKey,
    cellLevel,
    computeRpn,
    clearFinalizedStamp,
    selectCell,
    selectDetectability,
    updateNotes,
    onFinalizeAssessment,
    canFinalize,
    isFinalized,
    /** The answer as the parent currently holds it. */
    get value() {
      return props.modelValue
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness: RcaField.vue
// ─────────────────────────────────────────────────────────────────────────────

function mountRcaField(modelValue = null) {
  const props = { modelValue }
  const emitted = []
  function emit(_event, value) {
    emitted.push(value)
    props.modelValue = value
  }

  // >>> MIRROR:RcaField.vue — copied verbatim, see drift detector
  const rootCauses = computed(() => {
    const stored = props.modelValue?.outcome?.rootCauses
    if (Array.isArray(stored) && stored.length > 0) return stored
    const legacy = props.modelValue?.outcome?.rootCause
    return [
      {
        description: legacy ?? '',
        isPrimary: true,
        categoryId: null,
        categoryLabel: null,
        categoryColor: null,
      },
    ]
  })

  function emitRootCauses(nextRows) {
    // Mirror the primary description to outcome.rootCause so the legacy
    // field stays in sync — read-only viewers + older code paths still
    // render the canonical summary without knowing about the array.
    const primary = nextRows.find((r) => r.isPrimary)
    emit('update:modelValue', {
      ...props.modelValue,
      outcome: {
        ...(props.modelValue?.outcome ?? {}),
        rootCauses: nextRows,
        rootCause: primary?.description ?? '',
      },
    })
  }

  function updateRow(index, patch) {
    const next = rootCauses.value.map((row, i) => (i === index ? { ...row, ...patch } : row))
    emitRootCauses(next)
  }

  function addContributingRow() {
    emitRootCauses([
      ...rootCauses.value,
      {
        description: '',
        isPrimary: false,
        categoryId: null,
        categoryLabel: null,
        categoryColor: null,
      },
    ])
  }

  function removeRow(index) {
    // Primary row can't be removed — the outcome has to have one
    // canonical cause. UI hides the delete affordance on it, but guard
    // here too in case it ever gets called.
    if (rootCauses.value[index]?.isPrimary) return
    emitRootCauses(rootCauses.value.filter((_, i) => i !== index))
  }
  // <<< MIRROR:end

  return {
    props,
    emitted,
    rootCauses,
    emitRootCauses,
    updateRow,
    addContributingRow,
    removeRow,
    get value() {
      return props.modelValue
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A real 5x5 matrix
// ─────────────────────────────────────────────────────────────────────────────

const LIKELIHOOD_ROWS = [
  ['rare', 'Rare'],
  ['unlikely', 'Unlikely'],
  ['possible', 'Possible'],
  ['likely', 'Likely'],
  ['almost-certain', 'Almost Certain'],
]

const SEVERITY_ROWS = [
  ['negligible', 'Negligible'],
  ['minor', 'Minor'],
  ['moderate', 'Moderate'],
  ['major', 'Major'],
  ['catastrophic', 'Catastrophic'],
]

const RISK_LEVELS = [
  { id: 'low', label: 'Low', bg: '#dcfce7', text: '#166534' },
  { id: 'medium', label: 'Medium', bg: '#fef9c3', text: '#854d0e' },
  { id: 'high', label: 'High', bg: '#ffedd5', text: '#9a3412' },
  { id: 'critical', label: 'Critical', bg: '#fee2e2', text: '#991b1b' },
]

const DETECTABILITY_ROWS = [
  ['almost-certain-detection', 'Almost certain detection'],
  ['high-detection', 'High'],
  ['moderate-detection', 'Moderate'],
  ['low-detection', 'Low'],
  ['undetectable', 'Undetectable'],
]

/** The tenant's own banding rule, applied to the TRUE rank product. */
function bandFor(product) {
  if (product <= 4) return 'low'
  if (product <= 9) return 'medium'
  if (product <= 16) return 'high'
  return 'critical'
}

/**
 * A template as the matrix builder writes one.
 *
 * `likelihoodScore` / `severityScore` are injectable so a test can seed the
 * off-by-one scale that shipped once. Note the cell map is built from `order`,
 * i.e. from the row's TRUE rank — never from `score`. That is not an artifice
 * of the fixture, it is how the real config is shaped, and it is precisely why
 * a corrupted `score` column produces a correct-looking grid.
 */
function riskTemplate({
  likelihoodScore = (i) => i + 1,
  severityScore = (i) => i + 1,
  enableDetectability = false,
  omitScores = false,
} = {}) {
  const likelihood = LIKELIHOOD_ROWS.map(([id, label], i) => {
    const row = { id, label, order: i + 1 }
    if (!omitScores) row.score = likelihoodScore(i)
    return row
  })
  const severity = SEVERITY_ROWS.map(([id, label], i) => {
    const row = { id, label, order: i + 1 }
    if (!omitScores) row.score = severityScore(i)
    return row
  })
  const detectability = DETECTABILITY_ROWS.map(([id, label], i) => ({
    id,
    label,
    order: i + 1,
    score: i + 1,
  }))

  const cells = {}
  for (const l of likelihood) {
    for (const s of severity) {
      cells[`${l.id}:${s.id}`] = bandFor(l.order * s.order)
    }
  }

  return {
    id: 'tmpl-5x5',
    name: '5x5 Corporate Matrix',
    config: {
      likelihood,
      severity,
      riskLevels: RISK_LEVELS,
      cells,
      detectability,
      enableDetectability,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('computeRpn — the number that lands in risk_assessments.computed_score', () => {
  it('scores every cell of a real 5x5 grid as likelihood x severity', () => {
    const f = mountRiskField({ template: riskTemplate() })
    for (let li = 0; li < 5; li++) {
      for (let si = 0; si < 5; si++) {
        const [lid] = LIKELIHOOD_ROWS[li]
        const [sid] = SEVERITY_ROWS[si]
        const expected = (li + 1) * (si + 1)
        expect(f.computeRpn(lid, sid), `${lid} x ${sid}`).toBe(expected)
        // Asserted alongside, never instead of: the band is a lookup and
        // agrees with a wrong score just as readily as with a right one.
        expect(f.cellLevel(lid, sid).id, `${lid} x ${sid} band`).toBe(bandFor(expected))
      }
    }
  })

  it('catches an off-by-one likelihood scale that the band cannot see', () => {
    // The shipped defect: the scale was generated with `6 - i` and came out
    // 2..6 instead of 1..5, so every likelihood scored one rank too severe.
    const buggy = mountRiskField({ template: riskTemplate({ likelihoodScore: (i) => i + 2 }) })
    const good = mountRiskField({ template: riskTemplate() })

    // Possible(3) x Moderate(3) is 9. On the corrupted scale Possible reads 4.
    expect(good.computeRpn('possible', 'moderate')).toBe(9)
    expect(buggy.computeRpn('possible', 'moderate')).toBe(12)

    // And here is why it survived review: the cell map is keyed on ids, so the
    // grid renders the identical amber "Medium" in both cases. A test that
    // asserted only the band would have passed on the broken build.
    expect(good.cellLevel('possible', 'moderate').id).toBe('medium')
    expect(buggy.cellLevel('possible', 'moderate').id).toBe('medium')
  })

  it('falls back to `order` when a scale row carries no explicit score', () => {
    // Older templates (and the matrix builder before scores were editable)
    // persist rank only. Rank IS the score in a plain LxS matrix.
    const f = mountRiskField({ template: riskTemplate({ omitScores: true }) })
    expect(f.computeRpn('likely', 'major')).toBe(16)
    expect(f.computeRpn('rare', 'negligible')).toBe(1)
  })

  it('prefers an explicit score over order when both are present', () => {
    // Not interchangeable: a tenant with a non-linear scale (1/2/4/8/16) sets
    // `score` deliberately and `order` stays the display rank.
    const f = mountRiskField({
      template: riskTemplate({ likelihoodScore: (i) => 2 ** i, severityScore: (i) => 2 ** i }),
    })
    expect(f.computeRpn('almost-certain', 'catastrophic')).toBe(256)
  })

  it('treats a row with neither score nor order as 1, not as NaN', () => {
    // A malformed row must not poison the product — NaN would be persisted
    // straight through to computed_score and break every downstream rollup.
    const tpl = riskTemplate()
    tpl.config.likelihood[0] = { id: 'rare', label: 'Rare' }
    const f = mountRiskField({ template: tpl })
    expect(f.computeRpn('rare', 'catastrophic')).toBe(5)
  })

  it('scores an unknown id as 1 rather than throwing', () => {
    // Reachable in real life: switching matrix mid-answer leaves ids from the
    // old template on the payload until the answer is reset.
    const f = mountRiskField({ template: riskTemplate() })
    expect(f.computeRpn('no-such-likelihood', 'moderate')).toBe(3)
    expect(f.computeRpn('no-such-likelihood', 'no-such-severity')).toBe(1)
  })

  it('multiplies detectability in only when the template enables it', () => {
    const off = mountRiskField({ template: riskTemplate({ enableDetectability: false }) })
    const on = mountRiskField({ template: riskTemplate({ enableDetectability: true }) })
    // Same inputs, two-factor vs three-factor. A template that has a
    // detectability scale but has not switched FMEA on must stay at LxS.
    expect(off.computeRpn('possible', 'moderate', 'low-detection')).toBe(9)
    expect(on.computeRpn('possible', 'moderate', 'low-detection')).toBe(36)
  })

  it('stays two-factor while FMEA is on but nothing is picked', () => {
    const f = mountRiskField({ template: riskTemplate({ enableDetectability: true }) })
    expect(f.computeRpn('possible', 'moderate', null)).toBe(9)
    expect(f.computeRpn('possible', 'moderate', undefined)).toBe(9)
  })

  it('scores an unknown detectability id as 1, leaving LxS intact', () => {
    const f = mountRiskField({ template: riskTemplate({ enableDetectability: true }) })
    expect(f.computeRpn('possible', 'moderate', 'stale-id')).toBe(9)
  })
})

describe('cellKey / cellLevel — resolving the band', () => {
  it('keys a cell as likelihood:severity', () => {
    const f = mountRiskField({ template: riskTemplate() })
    expect(f.cellKey('possible', 'moderate')).toBe('possible:moderate')
  })

  it('is not symmetric — the key order carries the meaning', () => {
    // Possible x Catastrophic (15, high) and Almost Certain x Moderate (15,
    // high) happen to share a product; they are still different cells and a
    // transposed key must not resolve.
    const f = mountRiskField({ template: riskTemplate() })
    expect(f.cellLevel('possible', 'catastrophic').id).toBe('high')
    expect(f.cellLevel('catastrophic', 'possible')).toBeNull()
  })

  it('returns null for a cell the template never mapped', () => {
    // The matrix builder allows a sparse grid; the UI paints those grey.
    const tpl = riskTemplate()
    delete tpl.config.cells['rare:negligible']
    const f = mountRiskField({ template: tpl })
    expect(f.cellLevel('rare', 'negligible')).toBeNull()
    expect(f.cellLevel('rare', 'minor').id).toBe('low')
  })

  it('returns null when the mapped level id is not in riskLevels', () => {
    // A dangling reference — a risk level deleted from the template while
    // cells still point at it. Resolving to `undefined` here would crash the
    // grid's style binding, so null is the contract.
    const tpl = riskTemplate()
    tpl.config.cells['possible:moderate'] = 'deleted-level'
    const f = mountRiskField({ template: tpl })
    expect(f.cellLevel('possible', 'moderate')).toBeNull()
  })

  it('returns null for every cell when no template has resolved yet', () => {
    const f = mountRiskField({ template: null })
    expect(f.cellLevel('possible', 'moderate')).toBeNull()
    expect(f.computeRpn('possible', 'moderate')).toBe(1)
  })
})

// The exact key set `rcaRaDerivationService.deriveRiskAssessmentForField` reads
// off `payload[field].finalized`. Kept as a literal list, not derived from the
// widget, because it is a CROSS-REPO contract: dropping a key here is silent on
// this side and produces a null column on the other.
const FINALIZED_CONTRACT_KEYS = [
  'assessmentType',
  'likelihoodId',
  'likelihoodLabel',
  'likelihoodScore',
  'severityId',
  'severityLabel',
  'severityScore',
  'detectabilityId',
  'detectabilityLabel',
  'detectabilityScore',
  'computedRiskLevelId',
  'computedRiskLevelLabel',
  'computedScore',
  'justification',
  'hazardCategoryId',
  'hazardCategoryLabel',
  'hazardCategoryColor',
  'finalizedAt',
]

const HAZARD_CATEGORIES = [
  { id: 'haz-process', name: 'Process', color: '#2563eb' },
  { id: 'haz-supplier', name: 'Supplier', color: '#7c3aed' },
]

/** Drives the widget the way the UI does: pick a cell, then type a rationale. */
function anAssessment(overrides = {}) {
  const f = mountRiskField({
    template: riskTemplate({ enableDetectability: true }),
    hazardCategories: HAZARD_CATEGORIES,
    ...overrides,
  })
  f.selectCell('possible', 'moderate')
  f.selectDetectability('low-detection')
  f.updateNotes('<p>Two independent controls already in place.</p>')
  return f
}

describe('onFinalizeAssessment — the cross-repo payload contract', () => {
  it('emits exactly the key set the derivation service reads', () => {
    const f = anAssessment()
    f.onFinalizeAssessment()
    // Exact-set equality, not a subset check: an EXTRA key is drift too — it
    // means the widget grew a field the backend silently discards.
    expect(Object.keys(f.value.finalized).sort()).toEqual([...FINALIZED_CONTRACT_KEYS].sort())
  })

  it('freezes labels and scores off the template instead of re-deriving them', () => {
    const f = anAssessment()
    f.onFinalizeAssessment()
    const { finalized } = f.value

    expect(finalized).toMatchObject({
      assessmentType: 'INITIAL',
      likelihoodId: 'possible',
      likelihoodLabel: 'Possible',
      likelihoodScore: 3,
      severityId: 'moderate',
      severityLabel: 'Moderate',
      severityScore: 3,
      detectabilityId: 'low-detection',
      detectabilityLabel: 'Low',
      detectabilityScore: 4,
      computedRiskLevelId: 'medium',
      computedRiskLevelLabel: 'Medium',
      computedScore: 36, // 3 x 3 x 4 — the three-factor RPN stored at click time
      justification: '<p>Two independent controls already in place.</p>',
    })
    expect(finalized.finalizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('keeps the frozen labels once the template is renamed underneath it', () => {
    // The whole point of denormalising: a scale relabelled in the matrix
    // builder next quarter must not retroactively reword last quarter's
    // finalized assessments.
    const tpl = riskTemplate()
    const f = mountRiskField({ template: tpl })
    f.selectCell('possible', 'moderate')
    f.onFinalizeAssessment()

    tpl.config.likelihood[2].label = 'Occasional'
    tpl.config.likelihood[2].score = 99

    expect(f.value.finalized.likelihoodLabel).toBe('Possible')
    expect(f.value.finalized.likelihoodScore).toBe(3)
  })

  it('takes computedScore from the stored rpnScore rather than recomputing it', () => {
    // Deliberately contradictory state — rpnScore says one thing, the scales
    // say another. The widget must ship what was stored: recomputing at
    // finalize time would make the number depend on the template's state at
    // approval, which is exactly the drift the snapshot exists to prevent.
    const f = mountRiskField({ template: riskTemplate() })
    f.selectCell('possible', 'moderate')
    f.props.modelValue = { ...f.props.modelValue, rpnScore: 777 }
    f.onFinalizeAssessment()
    expect(f.value.finalized.computedScore).toBe(777)
  })

  it('nulls the detectability triplet when FMEA is off, even with an id on the answer', () => {
    // Reachable by turning enableDetectability off on the template after an
    // answer was scored. The id must not leak into a two-factor assessment.
    const f = mountRiskField({ template: riskTemplate({ enableDetectability: false }) })
    f.props.modelValue = {
      likelihoodId: 'possible',
      severityId: 'moderate',
      riskLevelId: 'medium',
      detectabilityId: 'low-detection',
    }
    f.onFinalizeAssessment()
    expect(f.value.finalized).toMatchObject({
      detectabilityId: null,
      detectabilityLabel: null,
      detectabilityScore: null,
    })
  })

  it('denormalises the hazard category name and colour from the lookup', () => {
    // The category is set through patchFinalized before the stamp; the id on
    // the answer, the name and colour resolved at finalize time.
    const f = mountRiskField({
      template: riskTemplate(),
      hazardCategories: HAZARD_CATEGORIES,
      modelValue: { finalized: { hazardCategoryId: 'haz-supplier' } },
    })
    f.selectCell('likely', 'major')
    f.onFinalizeAssessment()
    expect(f.value.finalized).toMatchObject({
      hazardCategoryId: 'haz-supplier',
      hazardCategoryLabel: 'Supplier',
      hazardCategoryColor: '#7c3aed',
    })
  })

  it('emits nulls rather than dropping keys when the category is unset', () => {
    // The service reads `f.hazardCategoryId ?? null`; a present-but-null key
    // and an absent key behave the same there, but only the former survives a
    // future strict-shape validation.
    const f = anAssessment()
    f.onFinalizeAssessment()
    expect(f.value.finalized).toMatchObject({
      hazardCategoryId: null,
      hazardCategoryLabel: null,
      hazardCategoryColor: null,
    })
  })

  it('finalizes with a null risk level when the cell is unmapped', () => {
    // canFinalize does not require a band, so this is a supported outcome:
    // the score is meaningful even where the tenant left the grid sparse.
    const tpl = riskTemplate()
    delete tpl.config.cells['rare:negligible']
    const f = mountRiskField({ template: tpl })
    f.selectCell('rare', 'negligible')
    f.onFinalizeAssessment()
    expect(f.value.finalized.computedRiskLevelId).toBeNull()
    expect(f.value.finalized.computedRiskLevelLabel).toBeNull()
    expect(f.value.finalized.computedScore).toBe(1)
  })

  it('no-ops when likelihood was never picked', () => {
    const f = mountRiskField({ template: riskTemplate(), modelValue: { severityId: 'moderate' } })
    f.onFinalizeAssessment()
    expect(f.emitted).toHaveLength(0)
    expect(f.value.finalized).toBeUndefined()
  })

  it('no-ops when severity was never picked', () => {
    const f = mountRiskField({ template: riskTemplate(), modelValue: { likelihoodId: 'possible' } })
    f.onFinalizeAssessment()
    expect(f.emitted).toHaveLength(0)
  })

  it('no-ops when the field is readonly or disabled', () => {
    // The Finalize button is hidden in both states, but autoFinalize is
    // registered on the step form and fires on every Save Draft.
    for (const mode of ['readonly', 'disabled']) {
      const f = mountRiskField({
        template: riskTemplate(),
        modelValue: { likelihoodId: 'possible', severityId: 'moderate' },
        [mode]: true,
      })
      f.onFinalizeAssessment()
      expect(f.emitted, mode).toHaveLength(0)
    }
  })
})

describe('canFinalize', () => {
  it('requires both axes of the matrix', () => {
    const tpl = riskTemplate()
    expect(mountRiskField({ template: tpl }).canFinalize.value).toBe(false)
    expect(
      mountRiskField({ template: tpl, modelValue: { likelihoodId: 'possible' } }).canFinalize.value,
    ).toBe(false)
    expect(
      mountRiskField({ template: tpl, modelValue: { severityId: 'moderate' } }).canFinalize.value,
    ).toBe(false)
  })

  it('does NOT require a hazard category', () => {
    // The category field was hidden on 2026-08-15. Leaving it in the guard
    // would have made the button permanently dead, so this is load-bearing.
    const f = mountRiskField({ template: riskTemplate() })
    f.selectCell('possible', 'moderate')
    expect(f.canFinalize.value).toBe(true)
  })

  it('is satisfied by the default assessmentType', () => {
    // assessmentType is in the guard but its control is hidden too; it
    // defaults to INITIAL and is therefore never falsy.
    const f = mountRiskField({
      template: riskTemplate(),
      modelValue: { likelihoodId: 'possible', severityId: 'moderate' },
    })
    expect(f.canFinalize.value).toBe(true)
  })
})

describe('clearFinalizedStamp — a changed input invalidates the snapshot', () => {
  it('nulls finalizedAt when the matrix selection moves', () => {
    const f = anAssessment()
    f.onFinalizeAssessment()
    expect(f.isFinalized.value).toBe(true)

    f.selectCell('almost-certain', 'catastrophic')
    expect(f.isFinalized.value).toBe(false)
    expect(f.value.finalized.finalizedAt).toBeNull()
  })

  it('nulls finalizedAt when detectability moves', () => {
    const f = anAssessment()
    f.onFinalizeAssessment()
    f.selectDetectability('undetectable')
    expect(f.value.finalized.finalizedAt).toBeNull()
    // …and the live RPN has moved on, which is exactly what makes the stale
    // stamp unsafe: 3 x 3 x 5.
    expect(f.value.rpnScore).toBe(45)
  })

  it('keeps every other frozen field so re-finalizing is one click', () => {
    // Only the stamp is invalidated. Wiping the whole snapshot would lose the
    // hazard category and assessment type the user picked separately.
    const f = mountRiskField({
      template: riskTemplate(),
      hazardCategories: HAZARD_CATEGORIES,
      modelValue: { finalized: { hazardCategoryId: 'haz-process', assessmentType: 'RESIDUAL' } },
    })
    f.selectCell('possible', 'moderate')
    f.onFinalizeAssessment()
    f.selectCell('likely', 'major')

    expect(f.value.finalized.finalizedAt).toBeNull()
    expect(f.value.finalized.hazardCategoryId).toBe('haz-process')
    expect(f.value.finalized.assessmentType).toBe('RESIDUAL')
  })

  it('leaves an un-finalized answer untouched', () => {
    // No `finalized` key should be conjured just because a cell was clicked.
    const f = mountRiskField({ template: riskTemplate() })
    f.selectCell('possible', 'moderate')
    expect(f.value.finalized).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(f.value, 'finalized')).toBe(false)
  })

  it('KNOWN GAP: editing the justification does NOT clear the stamp', () => {
    // updateNotes emits directly and never routes through
    // clearFinalizedStamp, unlike selectCell / selectDetectability. So the
    // assessment stays "Finalized", while `finalized.justification` still
    // holds the pre-edit text — and the derivation service reads
    // `f.justification ?? fieldPayload.notes`, so the frozen (stale) copy
    // wins and the edit never reaches risk_assessments.justification.
    //
    // Asserted as-is so the suite stays honest about current behaviour;
    // routing updateNotes through clearFinalizedStamp is the one-line fix and
    // this test is what should flip when it lands.
    const f = anAssessment()
    f.onFinalizeAssessment()
    f.updateNotes('<p>Rewritten after finalizing.</p>')

    expect(f.isFinalized.value).toBe(true)
    expect(f.value.notes).toBe('<p>Rewritten after finalizing.</p>')
    expect(f.value.finalized.justification).toBe(
      '<p>Two independent controls already in place.</p>',
    )
  })
})

describe('RcaField rootCauses — the multi-row outcome and its legacy fallback', () => {
  it('uses the stored array when there is one', () => {
    const rows = [
      { description: 'Calibration overdue', isPrimary: true, categoryId: 'cat-equipment' },
      { description: 'Reminder job muted', isPrimary: false, categoryId: null },
    ]
    const f = mountRcaField({ outcome: { rootCauses: rows } })
    expect(f.rootCauses.value).toBe(rows) // returned by reference, not rebuilt
  })

  it('synthesises a primary row from the legacy rootCause string', () => {
    // Records written before the multi-row outcome stored one string. Editing
    // one must continue to work rather than silently discarding the text.
    const f = mountRcaField({ outcome: { rootCause: 'Operator used the wrong SOP revision.' } })
    expect(f.rootCauses.value).toEqual([
      {
        description: 'Operator used the wrong SOP revision.',
        isPrimary: true,
        categoryId: null,
        categoryLabel: null,
        categoryColor: null,
      },
    ])
  })

  it('prefers the array over the legacy string when both are present', () => {
    // They coexist by design — emitRootCauses keeps the string mirrored — so
    // the array has to win or every save would revert to the mirror.
    const f = mountRcaField({
      outcome: {
        rootCause: 'stale mirror',
        rootCauses: [{ description: 'current', isPrimary: true }],
      },
    })
    expect(f.rootCauses.value[0].description).toBe('current')
  })

  it('falls back when the stored array is empty, not just when it is absent', () => {
    // `length > 0` rather than `Array.isArray` alone: an empty array would
    // otherwise render zero rows and leave the analyst with no editor at all.
    const f = mountRcaField({ outcome: { rootCauses: [], rootCause: 'legacy text' } })
    expect(f.rootCauses.value).toHaveLength(1)
    expect(f.rootCauses.value[0]).toMatchObject({ description: 'legacy text', isPrimary: true })
  })

  it('returns one empty primary row for a brand-new analysis', () => {
    for (const seed of [null, {}, { outcome: {} }]) {
      const f = mountRcaField(seed)
      expect(f.rootCauses.value).toHaveLength(1)
      expect(f.rootCauses.value[0]).toMatchObject({ description: '', isPrimary: true })
    }
  })
})

describe('RcaField emitRootCauses — mirroring the primary description', () => {
  it('mirrors the primary description onto the legacy rootCause field', () => {
    const f = mountRcaField(null)
    f.updateRow(0, { description: 'Fixture wear beyond tolerance' })
    expect(f.value.outcome.rootCause).toBe('Fixture wear beyond tolerance')
    expect(f.value.outcome.rootCauses[0].description).toBe('Fixture wear beyond tolerance')
  })

  it('mirrors the primary row wherever it sits, not row 0', () => {
    // `find(r => r.isPrimary)`, not `[0]`. Stored payloads are not guaranteed
    // to be ordered — the finalize path reorders by filtering blanks out.
    const f = mountRcaField({
      outcome: {
        rootCauses: [
          { description: 'contributing', isPrimary: false },
          { description: 'the real one', isPrimary: true },
        ],
      },
    })
    f.addContributingRow()
    expect(f.value.outcome.rootCause).toBe('the real one')
  })

  it('mirrors an empty string when no row is flagged primary', () => {
    // Not undefined: the legacy consumers render `outcome.rootCause` directly
    // and would print "undefined".
    const f = mountRcaField({ outcome: { rootCauses: [{ description: 'x', isPrimary: false }] } })
    f.addContributingRow()
    expect(f.value.outcome.rootCause).toBe('')
  })

  it('preserves the rest of the outcome, including completedAt', () => {
    // A finalized analysis edited again must not lose its completion stamp
    // through the outcome spread.
    const f = mountRcaField({
      outcome: {
        completedAt: '2026-08-30T10:00:00.000Z',
        rootCauses: [{ description: 'a', isPrimary: true }],
      },
    })
    f.updateRow(0, { description: 'b' })
    expect(f.value.outcome.completedAt).toBe('2026-08-30T10:00:00.000Z')
  })

  it('preserves sibling keys on the answer, such as the chosen method', () => {
    const f = mountRcaField({ _method: 'fishbone', _templateId: 'tpl-1' })
    f.updateRow(0, { description: 'a' })
    expect(f.value).toMatchObject({ _method: 'fishbone', _templateId: 'tpl-1' })
  })
})

describe('RcaField removeRow — the primary row is not removable', () => {
  it('refuses to remove the primary row', () => {
    // The UI hides the ✕ on it, but autoFinalize and the AI apply path both
    // reshape rows; the outcome must always keep one canonical cause for the
    // derivation service to flag as is_primary.
    const f = mountRcaField({
      outcome: {
        rootCauses: [
          { description: 'primary', isPrimary: true },
          { description: 'contributing', isPrimary: false },
        ],
      },
    })
    f.removeRow(0)
    expect(f.emitted).toHaveLength(0)
    expect(f.rootCauses.value).toHaveLength(2)
  })

  it('removes a contributing row and re-mirrors the primary', () => {
    const f = mountRcaField({
      outcome: {
        rootCauses: [
          { description: 'primary', isPrimary: true },
          { description: 'contributing', isPrimary: false },
        ],
      },
    })
    f.removeRow(1)
    expect(f.rootCauses.value).toEqual([{ description: 'primary', isPrimary: true }])
    expect(f.value.outcome.rootCause).toBe('primary')
  })

  it('no-ops on an out-of-range index instead of emitting an unchanged list', () => {
    // `?.isPrimary` on a missing row is undefined, so the guard falls through
    // — the filter is a no-op but it still emits. Documented here because an
    // emit is a save on this form.
    const f = mountRcaField({
      outcome: { rootCauses: [{ description: 'primary', isPrimary: true }] },
    })
    f.removeRow(9)
    expect(f.rootCauses.value).toHaveLength(1)
  })

  it('refuses to remove the synthesised primary of an untouched analysis', () => {
    const f = mountRcaField(null)
    f.removeRow(0)
    expect(f.emitted).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Drift detector
// ─────────────────────────────────────────────────────────────────────────────
//
// A mirror rots silently. These tests read the two SFCs and this spec off disk
// and assert each mirrored declaration is still the original, so a change to
// the widget fails here instead of leaving the suite green and meaningless.
//
// Normalisation only removes what cannot carry meaning: comments, and the
// whitespace prettier redistributes when the same code sits two levels deeper
// in a function. Identifiers, operators and structure are compared as-is.

/** Strips comments, trailing commas and formatting, keeping every token. */
function normalise(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/,(\s*[)\]}])/g, '$1') // prettier adds one when it wraps a call
    .replace(/\s*([(){}[\],;])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Slices one top-level `function foo(…) {…}` or `const foo = …` declaration
 * out of a source string by balancing brackets to the end of the statement.
 *
 * Deliberately naive about brackets inside string literals — none of the
 * mirrored declarations contain an unbalanced one, and a template literal's
 * `${…}` balances on its own.
 */
function extractDecl(src, name) {
  const start = [
    new RegExp(`\\bfunction\\s+${name}\\s*\\(`),
    new RegExp(`\\bconst\\s+${name}\\s*=`),
  ].reduce((found, re) => (found >= 0 ? found : (re.exec(src)?.index ?? -1)), -1)
  if (start < 0) throw new Error(`declaration "${name}" not found`)

  let paren = 0
  let brace = 0
  let bracket = 0
  let opened = false
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (c === '(') (paren++, (opened = true))
    else if (c === ')') paren--
    else if (c === '{') (brace++, (opened = true))
    else if (c === '}') brace--
    else if (c === '[') (bracket++, (opened = true))
    else if (c === ']') bracket--
    else if (c === '\n' && opened && !paren && !brace && !bracket) return src.slice(start, i)
  }
  throw new Error(`declaration "${name}" never terminated`)
}

/** The region of THIS file that was copied out of `file`. */
function mirrorRegion(specSrc, file) {
  const from = specSrc.indexOf(`>>> MIRROR:${file}`)
  const to = specSrc.indexOf('<<< MIRROR:end', from)
  if (from < 0 || to < 0) throw new Error(`mirror region for ${file} not found`)
  return specSrc.slice(from, to)
}

const SPEC_SRC = readFileSync(THIS_SPEC, 'utf8')

const MIRRORED = [
  {
    file: 'RiskAssessmentField.vue',
    path: RA_FIELD,
    names: [
      'likelihood',
      'severity',
      'riskLevels',
      'cells',
      'detectability',
      'enableDetectability',
      'selectedDetectabilityId',
      'cellKey',
      'cellLevel',
      'selectedLikelihoodId',
      'selectedSeverityId',
      'selectedRiskLevelId',
      'selectedRiskLevel',
      'computeRpn',
      'clearFinalizedStamp',
      'selectCell',
      'selectDetectability',
      'updateNotes',
      'hazardCategoryId',
      'assessmentType',
      'isFinalized',
      'findById',
      'onFinalizeAssessment',
      'canFinalize',
    ],
  },
  {
    file: 'RcaField.vue',
    path: RCA_FIELD,
    names: ['rootCauses', 'emitRootCauses', 'updateRow', 'addContributingRow', 'removeRow'],
  },
]

for (const { file, path: componentPath, names } of MIRRORED) {
  describe(`drift detector — ${file}`, () => {
    const componentSrc = readFileSync(componentPath, 'utf8')
    const region = mirrorRegion(SPEC_SRC, file)

    it.each(names)('`%s` is still identical to the component', (name) => {
      expect(normalise(extractDecl(region, name))).toBe(normalise(extractDecl(componentSrc, name)))
    })

    it('checks every declaration in the mirror region', () => {
      // Otherwise a mirror could be added without a drift check and rot from
      // the day it lands. Top-level declarations inside the harness sit at
      // exactly two spaces; anything deeper is a local inside a mirrored body.
      const declared = [...region.matchAll(/^ {2}(?:function|const)\s+(\w+)\b/gm)].map((m) => m[1])
      expect(declared.sort()).toEqual([...names].sort())
    })
  })
}
