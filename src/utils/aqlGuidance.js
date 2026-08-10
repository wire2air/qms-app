/**
 * AQL severity-pairing guidance (2026-08-10).
 *
 * One place for the "which AQL goes with which defect class" convention so the
 * standards viewer, the sampling-plan dialog and the custom-AQL override all
 * say the same thing. The pairing is CONVENTION, not a rule in Z1.4 — the
 * standard defines the plans; choosing a tighter AQL for more serious defect
 * classes is standard industry practice (and matches our plan defaults:
 * Critical 0.4 / Major 1.0 / Minor 2.5).
 *
 * Lives in utils (NOT src/components) so the component auto-registrar doesn't
 * pick it up as a phantom global component.
 */

/** AQL % columns seeded in the Z1.4 / ISO 2859-1 tables. Offering anything
 *  else fails to resolve a plan cell at compute time. */
export const SEEDED_AQLS = [0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5, 10, 15, 25]

/** Typical defect-class pairing for an AQL % value. Always returns a hint —
 *  values above 4.0 get the neutral "loose" chip. */
export function aqlSeverityHint(aql) {
  const v = Number(aql)
  if (!Number.isFinite(v)) return null
  if (v <= 0.65) return { label: 'typ. Critical', class: 'tw:bg-red-100 tw:text-red-700' }
  if (v <= 1.5) return { label: 'typ. Major', class: 'tw:bg-amber-100 tw:text-amber-700' }
  if (v <= 4.0) return { label: 'typ. Minor', class: 'tw:bg-emerald-100 tw:text-emerald-700' }
  return { label: 'loose', class: 'tw:bg-gray-100 tw:text-gray-600' }
}

/** Select options for AQL pickers: value + "0.4% — typ. Critical" style label. */
export function aqlSelectOptions() {
  return SEEDED_AQLS.map((v) => {
    const hint = aqlSeverityHint(v)
    return { id: v, name: `${v}%${hint ? ` — ${hint.label}` : ''}` }
  })
}

/**
 * Default custom-plan-table rows — one per defect class (the catalog's full
 * Z1.4 scale), tighter Ac/Re for more serious classes. Used to preload the
 * rows editor on the sampling-plan dialog, New Inspection, and lot reopen;
 * users edit the numbers or remove classes they don't want a limit for.
 */
export function defaultCustomPlanRows() {
  return [
    { severityLabel: 'CRITICAL', sampleSize: 8, accept: 0, reject: 1 },
    { severityLabel: 'MAJOR', sampleSize: 8, accept: 1, reject: 2 },
    { severityLabel: 'MINOR', sampleSize: 8, accept: 2, reject: 3 },
  ]
}

/** One-line summary used as a legend across the QC surfaces. */
export const AQL_PAIRING_SUMMARY =
  'Tighter (smaller) AQLs are conventionally used for more serious defect classes — ' +
  'typical pairing: Critical ≈ 0.40–0.65 · Major ≈ 1.0–1.5 · Minor ≈ 2.5–4.0.'
