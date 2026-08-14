/**
 * Central tooltip / help-text registry.
 *
 * One place to author reusable help copy so the same wording isn't hard-coded in
 * multiple components. Look up an entry by its `key` via the `useTooltipData`
 * composable, or pass `dataKey="<key>"` to `BaseLabel` (resolves `tooltip` →
 * the label's help icon). Keys are dot-namespaced by area, e.g. `document.*`.
 *
 * Each entry: { key, label?, tooltip?, placeholder?, helplinkkey? }
 *   - tooltip     — the help text shown on hover/focus
 *   - label       — optional default label text
 *   - placeholder — optional default input placeholder
 */
export const TOOLTIPS = [
  {
    key: 'document.collaboration',
    label: 'Collaboration',
    tooltip:
      'Invite co-authors to contribute to this draft. Each collaborator gets a task and email notification, and you can discuss changes in the chat below before submitting for review.',
  },
  {
    key: 'user.additionalSites',
    label: 'Additional Sites',
    tooltip:
      'Sites this person is responsible for beyond their primary site. A role granted "Site" access reaches records at the primary site AND every additional site listed here — use this for regional or corporate roles that span locations without granting company-wide access. Only active sites in this company can be added.',
  },
  {
    key: 'qc.aql',
    label: 'AQL %',
    tooltip:
      'Acceptable Quality Limit — the worst percent-defective you are willing to treat as acceptable for that defect class. A smaller AQL tolerates fewer defects for the same sample size (stricter accept/reject numbers). Tighter AQLs are conventionally paired with more serious defect classes: Critical ≈ 0.40–0.65, Major ≈ 1.0–1.5, Minor ≈ 2.5–4.0.',
  },
  {
    key: 'qc.acceptReject',
    label: 'Ac / Re',
    tooltip:
      'Accept and Reject numbers. Inspect the sample and count defects of that class: accept the lot when the count is ≤ Ac; reject when it is ≥ Re. Reduced-inspection plans can have a gap between Ac and Re — per Z1.4 a count in the gap still accepts the lot, but is the signal to switch the plan back to Normal inspection (the switching state is set on the sampling plan).',
  },
  {
    key: 'qc.switchingState',
    label: 'Switching state',
    tooltip:
      'Z1.4 switching rules: start at Normal; switch to Tightened after 2 of 5 consecutive lots are rejected (stricter Ac/Re, same sample size); Reduced (smaller samples) may be used after a sustained run of accepted lots. The state selects which accept/reject table applies.',
  },
  {
    key: 'qc.customPlanTable',
    label: 'Custom plan table',
    tooltip:
      'A fixed plan instead of the AQL lookup. The sample size applies to the WHOLE inspection — the custom analogue of the code letter’s n in the Z1.4 table. Each row then sets the accept/reject numbers for one defect class, all evaluated on that same pulled sample: accept while the class’s defect tally ≤ Ac, reject when it ≥ Re (accept 0 / reject 1 = any defect fails). Remove a class’s row if you don’t want a limit for it.',
  },
  {
    key: 'qc.planArrowCell',
    label: 'Arrow cell',
    tooltip:
      'In the Z1.4 master tables some code letter × AQL combinations have no plan of their own — an arrow points to the plan to use instead (a neighbouring code letter, adopting BOTH its sample size and its Ac/Re). The system follows these arrows automatically when computing a plan.',
  },
  {
    key: 'site.isActive',
    label: 'Accepting new user assignments',
    tooltip:
      'Controls whether this site can be chosen when assigning someone a primary or additional site. Turning it off does NOT remove anyone or hide the site: existing assignments are kept so a location being wound down does not silently revoke access mid-closeout, and the site still appears in filters and on existing records. It only stops appearing as an option for new assignments.',
  },
  {
    key: 'workflow.scheduleTask',
    label: 'Schedule Task',
    tooltip:
      'A follow-up task that activates on a schedule instead of immediately: the step waits a set number of days (or until a date) after the previous step completes, then assigns its task. Example — an Effectiveness check that fires 90 days later to verify a corrective action actually worked. The record owner can adjust or skip the schedule on each record.',
  },
]

export default TOOLTIPS
