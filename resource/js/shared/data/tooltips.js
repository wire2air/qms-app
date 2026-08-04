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
]

export default TOOLTIPS
