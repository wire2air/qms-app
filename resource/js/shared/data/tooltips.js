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
    key: 'sso.entityId',
    label: 'Audience / Entity ID',
    tooltip:
      'How your identity provider names this application. Paste it into the field your provider calls Audience URI, Entity ID, or Identifier. It is unique to your workspace, which is what stops a sign-in issued for one company being replayed at another — so it must match exactly, character for character.',
  },
  {
    key: 'sso.acsUrl',
    label: 'Sign-on URL (ACS)',
    tooltip:
      'Where your identity provider sends people after they authenticate. Your provider may call this the Single sign-on URL, Reply URL, or Assertion Consumer Service URL. It must be this exact address, including https.',
  },
  {
    key: 'sso.metadataUrl',
    label: 'Our metadata',
    tooltip:
      'The same details in the standard XML format. If your provider offers to import metadata from a URL, give it this one instead of typing the fields by hand — it is the least error-prone route.',
  },
  {
    key: 'sso.displayName',
    label: 'Name',
    tooltip:
      'What appears on the sign-in button, so make it something your people will recognise — usually your provider’s name, such as “Okta” or “Microsoft”.',
  },
  {
    key: 'sso.metadataXml',
    tooltip:
      'The fastest and most reliable setup. Download or copy the federation metadata your provider publishes, paste it here, and we fill in the entity ID, sign-on URL and signing certificate for you. You can still review and correct every field before saving.',
  },
  {
    key: 'sso.idpEntityId',
    label: 'IdP Entity ID',
    tooltip:
      'How your identity provider names itself. It is an identifier, not a page you can open, so it will not always look like a working web address. Okta calls it the Identity Provider Issuer; Entra calls it the Microsoft Entra Identifier.',
  },
  {
    key: 'sso.idpSsoUrl',
    label: 'IdP sign-on URL',
    tooltip:
      'The address we send people to in order to sign in. Okta calls it the Identity Provider Single Sign-On URL; Entra calls it the Login URL; Google calls it the SSO URL.',
  },
  {
    key: 'sso.certificates',
    label: 'Signing certificate',
    tooltip:
      'The public certificate we use to verify that a sign-in really came from your provider — the trust anchor for the whole connection. Paste more than one during a certificate rollover: we accept any of them, so you can add the new certificate before your provider switches and avoid an outage.',
  },
  {
    key: 'sso.emailDomains',
    label: 'Email domains',
    tooltip:
      'Which email domains this connection serves, such as acme.com. We match on the domain to decide who this provider signs in, and — if you require SSO — who can no longer use a password. Addresses outside these domains are unaffected, which is how contractors and break-glass accounts keep working.',
  },
  {
    key: 'sso.enforced',
    label: 'Require SSO',
    tooltip:
      'Turns your provider into the only way in for these domains: the password form and the Google and Microsoft buttons stop working for them, so access really is governed by your directory, including its MFA and deprovisioning. Company owners can always still sign in with a password — deliberately, so a misconfigured provider cannot lock everyone out of their own quality system. Test the connection before turning this on.',
  },
  {
    key: 'sso.allowIdpInitiated',
    label: 'Allow starting from the identity provider',
    tooltip:
      'Lets people sign in by clicking your app tile in Okta or Entra. Off by default because such a sign-in answers no request of ours, so there is less we can check about it. Leave it off unless your people rely on the tile.',
  },
  {
    key: 'sso.enabled',
    label: 'Enable single sign-on',
    tooltip:
      'The master switch for this workspace. Turning it off stops every SSO connection at once — useful while a misconfigured provider is being fixed — without deleting anything you have set up.',
  },

  {
    key: 'record.notifications',
    label: 'Notifications',
    tooltip:
      'Email and in-app notices about this record. They are sent when the record is OPENED (leaves draft) and when it is CLOSED — not on every step in between, and not when a field changes. The people listed here are cc’d in addition to whoever is already involved; they are not assigned a task. Administrators can add more recipients with notification rules, which are listed on this card when they apply to this record.',
  },
  {
    key: 'record.notifications.external',
    label: 'Notify email addresses',
    tooltip:
      'People outside the company — a customer, a supplier’s quality lead, an auditor. Each one is emailed a secure link to a read-only summary of this record, opened with a code sent to that same address. Access lasts 30 days and can be withdrawn at any time from the Shared externally card.',
  },
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
