/**
 * Sections for the My Training (trainee-facing) detail page. Pure. This is a
 * stepper-driven training-taking flow with no header actions or rail, so
 * sections is the only builder needed (status/due render in header slots).
 */

/** Anchor-nav sections. The whole training flow (instructions → material →
 *  assessment → result) is a single body section.
 */
export function buildMyTrainingSections(_instance) {
  return [{ id: 'details', label: 'Details' }]
}
