/**
 * The shape of a document version's `trainingConfig`, in one place.
 *
 * It was in two: DocumentsCreate's DEFAULT_TRAINING_CONFIG and the Training
 * tab's ensureConfig(). Identical field for field except `enabled` — which is
 * correct, they mean different things (a new document opts in, an existing
 * version materialising a config does not) — but a shape copied twice is a
 * shape that drifts, and adding a third copy for the rail toggle is how the
 * next field gets added to two of the three.
 *
 * `enabled` is therefore a PARAMETER, not part of the default: the only thing
 * the call sites legitimately disagree about is the one thing they pass in.
 *
 * ── trainingConfig LIVES ON THE VERSION ──────────────────────────────────
 * Not the document. Training is per-revision: a new version clones the
 * previous config (DocumentsPageId) so a revised SOP re-trains its audience
 * against the revision they will actually follow. Anything here is scoped to
 * one version and frozen with it.
 */

/** Everything except `enabled`, which every call site supplies. */
const SHAPE = {
  autoLaunch: true,
  managerId: null,
  requireManagerVerification: true,
  completionDueDays: 7,
  passingScore: 80,
  maxAttempts: 1,
  curriculumIds: [],
  userIds: [],
  assessment: [],
}

/**
 * A fresh config. Arrays are rebuilt per call — returning a shared literal
 * would let one document's audience push into another's.
 */
export function defaultTrainingConfig(enabled = false) {
  return {
    enabled,
    ...SHAPE,
    curriculumIds: [],
    userIds: [],
    assessment: [],
  }
}

/**
 * Turn training on or off, preserving everything already configured.
 *
 * The preserving matters more than it looks. Turning training off used to be a
 * one-way door in practice: the submit-for-review reminder offered "disable
 * training and continue", wrote `enabled: false`, and saved — so an author who
 * then cancelled the submit had lost the toggle with no way to set it back.
 * Re-enabling has to find the audience, the pass mark and the assessment still
 * there, or the reminder's shortcut quietly destroys work.
 *
 * A null config (how a document created with training off is stored) is
 * materialised rather than mutated.
 *
 * @param {object|null} config  the version's current trainingConfig
 * @param {boolean} enabled
 */
export function setTrainingEnabled(config, enabled) {
  if (!config) return defaultTrainingConfig(enabled)
  return { ...config, enabled }
}

/** Is training on for this version? Tolerates a null/absent config. */
export function isTrainingEnabled(config) {
  return !!config?.enabled
}
