import { computed, unref } from 'vue'

/**
 * Generic form scoring engine (frontend half).
 *
 * A module form can carry per-field scoring metadata (`field.scoring`) authored
 * in the form builder, plus module-level rating bands
 * (`form_templates.module_config.scoring.bands`). This composable computes a
 * weighted 0–100 score from a filled payload and resolves it to a rating band —
 * used for the live preview while filling and the sealed readonly view.
 *
 * The exact same algorithm runs authoritatively on the backend in
 * `backend/api/services/moduleScoringService.js`; keep the two in sync. The
 * frontend value is advisory (a live preview); the backend value written on
 * workflow-complete is authoritative.
 *
 * Per-field `scoring` shape (all optional):
 *   { enabled, weight, yesScore, noScore, optionScores, scaleMin, scaleMax,
 *     riskFactor, aiEvaluation, aiPrompt, aiExtract, verifyExpiry }
 *
 * AI contributions live on a companion payload key `"<fieldName>__ai"`:
 *   narrative → { score, rationale, ... }; file → { status, expiryDate, ... }.
 */

const CONTAINER_TYPES = new Set(['section', 'row', 'column'])
const BOOLEAN_TYPES = new Set(['checkbox', 'toggle'])
const OPTION_TYPES = new Set(['select', 'radio', 'optionGroup'])
const NUMERIC_TYPES = new Set(['number', 'slider', 'rating'])
const NARRATIVE_TYPES = new Set(['textarea', 'textEditor'])

const EXPIRY_SCORE = { VALID: 100, EXPIRING_SOON: 50, EXPIRED: 0, UNDETERMINED: null }

function num(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clamp(n) {
  if (n == null || !Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, n))
}

/** Collect the input fields that carry `scoring.enabled`, in document order. */
export function collectScoredFields(schema) {
  const out = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (CONTAINER_TYPES.has(node.type) && Array.isArray(node.children)) {
      node.children.forEach(visit)
      return
    }
    if (node.name && node.scoring && node.scoring.enabled) out.push(node)
  }
  ;(Array.isArray(schema) ? schema : []).forEach(visit)
  return out
}

/**
 * Resolve a single field's contribution to a normalized 0–100 score, or `null`
 * when the field is unanswered / not yet AI-evaluated (excluded from the average
 * so a half-filled form isn't unfairly penalised).
 */
export function resolveFieldScore(field, payload) {
  const s = field.scoring || {}
  const value = payload?.[field.name]
  const ai = payload?.[`${field.name}__ai`]

  if (BOOLEAN_TYPES.has(field.type)) {
    const truthy = value === true || value === 'true' || value === 1 || value === 'yes'
    return clamp(truthy ? num(s.yesScore, 100) : num(s.noScore, 0))
  }

  if (OPTION_TYPES.has(field.type)) {
    const map = s.optionScores || {}
    if (Array.isArray(value)) {
      const scores = value.map((v) => map[v]).filter((x) => x != null)
      if (!scores.length) return null
      return clamp(scores.reduce((a, b) => a + Number(b), 0) / scores.length)
    }
    if (value == null || value === '') return null
    return map[value] == null ? null : clamp(Number(map[value]))
  }

  if (NUMERIC_TYPES.has(field.type)) {
    if (value == null || value === '') return null
    const lo = num(s.scaleMin, num(field.min, 0))
    const hi = num(s.scaleMax, num(field.max, field.type === 'rating' ? 5 : 100))
    if (hi === lo) return null
    return clamp(((Number(value) - lo) / (hi - lo)) * 100)
  }

  if (NARRATIVE_TYPES.has(field.type)) {
    return ai && ai.score != null ? clamp(Number(ai.score)) : null
  }

  if (field.type === 'file') {
    if (ai && ai.status && ai.status in EXPIRY_SCORE) return EXPIRY_SCORE[ai.status]
    if (ai && ai.score != null) return clamp(Number(ai.score))
    return null
  }

  return null
}

/**
 * Pure weighted-average computation. Returns the full scoring result minus the
 * `computedAt` stamp (the caller sealing the result adds that). `total` is null
 * when nothing scorable was answered.
 */
export function computeFormScore(schema, payload, moduleScoring) {
  const fields = collectScoredFields(schema)
  const breakdown = []
  let weightedSum = 0
  let weightTotal = 0

  for (const f of fields) {
    const weight = num(f.scoring?.weight, 1)
    const score = resolveFieldScore(f, payload)
    const entry = {
      name: f.name,
      label: f.label || f.name,
      type: f.type,
      weight,
      value: payload?.[f.name] ?? null,
      score,
      riskFactor: f.scoring?.riskFactor || null,
      contribution: null,
    }
    if (score != null && weight > 0) {
      weightedSum += score * weight
      weightTotal += weight
      entry.contribution = Math.round(score * weight * 10) / 10
    }
    breakdown.push(entry)
  }

  const total = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : null
  const bands = Array.isArray(moduleScoring?.bands) ? moduleScoring.bands : []
  const band =
    total == null
      ? null
      : bands.find((b) => total >= num(b.min, 0) && total <= num(b.max, 100)) || null

  return {
    total,
    rating: band?.id || null,
    ratingLabel: band?.label || null,
    ratingColor: band?.color || null,
    outcome: band?.outcome || null,
    breakdown,
    scoredCount: breakdown.filter((e) => e.score != null).length,
    fieldCount: breakdown.length,
    bandsSnapshot: bands,
  }
}

/** Is scoring configured on this template at all (any scored field)? */
export function templateHasScoring(schema) {
  return collectScoredFields(schema).length > 0
}

/**
 * Reactive live-preview wrapper. Pass getters/refs for the schema, the current
 * payload, and the module scoring config; get back a computed scoring result.
 */
export function useModuleScoring(schema, payload, moduleScoring) {
  const scoring = computed(() =>
    computeFormScore(unref(schema) || [], unref(payload) || {}, unref(moduleScoring) || null),
  )
  const enabled = computed(() => collectScoredFields(unref(schema) || []).length > 0)
  return { scoring, enabled }
}
