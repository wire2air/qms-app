---
id: oq-security-and-electronic-records
title: OQ-16 Security, Access & Electronic Records
sidebar_position: 16
description: Operational Qualification protocol for the Part 11 controls — authentication, authorisation, audit trail, electronic signature, copy generation and session control.
keywords: [OQ, security, 21 CFR Part 11, audit trail, electronic signature, access control, MFA, session]
---

# OQ-16 — Security, Access Control & Electronic Records

**Document ID:** VAL-OQ-16 · **Version:** 1.0 · **Module:** Cross-cutting

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**System version under test:** ______________  **Environment:** ______________

## 1. Objective

To verify the controls that every other module depends on: that only authorised people can
reach the system, that they can do only what their role permits, that everything they do is
recorded in an audit trail they cannot alter, that electronic signatures are attributable
and permanently bound to the records they sign, and that readable copies can be produced
for an inspector.

**This protocol is always in scope.** If the controls here fail, no other module's
validation stands.

## 2. Requirements verified

URS-SEC-01 … URS-SEC-16 and URS-SEC-21 … 23. Procedural requirements URS-SEC-17 … 20 are verified by inspection
of SOPs, not by this protocol. See the
[Part 11 Assessment](/validation/framework/part-11-assessment) for the clause mapping.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution |  |
| 2 | [IQ](/validation/framework/installation-qualification) executed; security configuration baselined in IQ §7 |  |
| 3 | Test accounts available: **Admin**, **Full-User**, **Read-Only**, **No-Access**, **Leaver**, **Scoped-User** (a role whose scope can be varied), **Approver-User** (holds Approve but is not the assignee) |  |
| 3a | At least two sites and two departments exist, with records owned by different users at each |  |
| 4 | The organisation's password, lockout, session and MFA settings are the ones intended for production |  |
| 5 | At least one signed record exists (for example a CAPA closed in OQ-04) |  |

> Execute against the **production-intended configuration**. Testing a permissive
> configuration and going live with a different one proves nothing.

## 4. Test cases

### TC-16-01 — Authentication and password policy *(URS-SEC-01, URS-SEC-02)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Attempt to reach any application URL without signing in | Redirected to sign-in; no data is shown |  |  |  |
| 2 | Sign in with a valid account | Access granted; the session identifies the correct user |  |  |  |
| 3 | Sign in with a valid user and wrong password | Refused. The message does not disclose whether the account exists |  |  |  |
| 4 | Attempt to set a new password shorter than the configured minimum length | Rejected, stating the requirement |  |  |  |
| 5 | Attempt to set a password missing a required character class | Rejected |  |  |  |
| 6 | Attempt to reuse a password within the configured history depth | Rejected |  |  |  |
| 7 | Attempt to set a known-breached password (for example `Password123!`) | Rejected, if breached-password blocking is enabled — record the configured setting |  |  |  |
| 8 | Confirm a newly invited user is required to change their password at first sign-in | **Expect no forced change.** Record the observed behaviour and read the note below before recording a result |  |  |  |
| 9 | Record the configured password expiry period | Recorded: __________ days |  |  |  |

> **Read this before recording steps 4 to 9.** Four points, and step 8 is the one that
> matters.
>
> **Step 8 — the setting exists but the control does not run.** The organisation's security
> settings include a *Force password change at first login* toggle, and it defaults to on.
> Nothing reads it. An invited user sets their own password when they accept the
> invitation, and that acceptance clears the forced-change flag rather than setting it, so
> no forced change is ever demanded. The only thing that sets the flag is an
> administrator's explicit *Force password reset* action on an existing user — which does
> work, and which you may test instead if your procedure needs evidence of the mechanism.
> Record step 8 as an observation against the configured toggle, and do not record the
> absence of a forced change as a pass on the strength of the setting being enabled.
>
> **Steps 4, 5 and 6 are genuine server-side controls.** Minimum length, the required
> character classes, a password-strength floor and the reuse-history check are all enforced
> on the server, on every password-change, reset and forced-change path. Reuse history is
> deliberately **not** applied when a user sets their first password at invitation accept.
>
> **Step 7 is best-effort by design.** Breached-password blocking calls an external
> reputation service. If that service is unreachable or slow, the check is skipped and the
> password is accepted, with no entry recording that the check did not run. Record the
> configured setting, and do not treat a pass here as proof that every future breached
> password will be refused.
>
> **Step 9 is answerable.** A password expiry period is configured per organisation and is
> enforced at sign-in: past it, the user is sent to a mandatory change instead of a
> session. Record the configured number of days.

### TC-16-02 — Account lockout *(URS-SEC-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Using the **Leaver** test account, submit incorrect passwords up to one less than the configured maximum | Sign-in refused each time; account not yet locked |  |  |  |
| 2 | Submit one further incorrect password, reaching the configured maximum | The account is locked |  |  |  |
| 3 | Attempt to sign in with the **correct** password while locked | Sign-in is refused despite correct credentials |  |  |  |
| 4 | Confirm the lockout and the failed attempts are visible to an administrator or recorded in the trail | The events are recorded — see the note for **where** to look |  |  |  |
| 5 | Confirm the account becomes usable after the configured lockout duration, or after administrator unlock | Access is restored by the expected mechanism only |  |  |  |

> **Read this before recording step 4.** Failed sign-ins and lockouts are recorded, but not
> where an executor usually looks first. They are written to a **security event log**, not
> to the module audit trail, and that log is append-only at the database. Locked state is
> visible on an individual user's security page; **there is no roster or list view showing
> which accounts are locked, and no failed-attempt count is displayed anywhere in the
> application.** So an administrator must open each user in turn. Evidence step 4 from the
> security event log plus the individual user's page, and record the absence of an
> at-a-glance view if your procedure depends on one.
>
> **Step 5 — the lock lifts by itself.** The lockout expires automatically after the
> configured duration; an administrator unlock is the second, independent mechanism and is
> permission-gated. Test whichever your procedure relies on, and record which. Note that an
> administrator unlock is **not tenant-scoped**: unlocking clears the lock for that email
> address across tenants. It can only ever remove a lock, never create one.

### TC-16-03 — Authorisation *(URS-SEC-04, URS-SEC-05)*

The critical test is step 4: hiding a control is not access control.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Sign in as **Read-Only** and open a module they may read | The list loads |  |  |  |
| 2 | Confirm create, edit, approve and delete controls are not offered | No write actions are presented |  |  |  |
| 3 | Sign in as **No-Access** and confirm the module is absent from navigation | Module is not presented |  |  |  |
| 4 | As **No-Access**, paste a direct URL to that module's list and to a specific record | Access is refused in **both** cases; no data is rendered |  |  |  |
| 5 | As **Read-Only**, attempt to act on a workflow step assigned to a different user | The action is refused — Read-Only holds neither the edit nor the approve capability. (Refusal because of the *permission*, not because of the assignment: see TC-16-17) |  |  |  |
| 6 | As **Full-User**, confirm the permitted actions are available | Actions available as granted |  |  |  |
| 7 | Change **Read-Only**'s role to grant write, then confirm the new permission takes effect | Access reflects the updated role |  |  |  |
| 8 | Revoke the permission again and confirm access is withdrawn — **without signing out** | Access is withdrawn immediately |  |  |  |

> **Read this before recording steps 7 and 8.** Permissions are **not** carried in the
> session token. Every authorisation decision is resolved against the live grant tables at
> the moment of the request, so a revocation takes effect immediately and a signed-in user
> does not need to sign out and in again for it to bind. Step 8 is written to prove exactly
> that, and it is the more important of the two: if withdrawing a permission required a
> re-login, a dismissed user's session would retain access until they chose to sign out.
>
> One practical caveat for step 7, in the **widening** direction only: the application holds
> a local copy of the records it has already been allowed to see, so newly permitted records
> may not appear in a list until the page is reloaded. The application detects the permission
> change and prompts for that reload. This is a display refresh, not the enforcement
> boundary — do not record it as a failure of step 7, and do not let it persuade you that
> step 8 needs a re-login.

### TC-16-04 — Tenant isolation *(URS-SEC-06)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | List records in several modules | Only this tenant's records are returned |  |  |  |
| 2 | Attempt to open a record URL with an identifier not belonging to this tenant | Refused or reported as not found; no foreign data is exposed |  |  |  |
| 3 | Review the audit log | Only this tenant's activity is present |  |  |  |
| 4 | Where the API is used, call it with this tenant's key and confirm only this tenant's data is returned | Scope limited to the tenant |  |  |  |

### TC-16-05 — Audit trail capture *(URS-SEC-07)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Create a record in any module; note the time | An audit entry records the creation, with performer and timestamp |  |  |  |
| 2 | Modify two fields of that record | An update entry records the change |  |  |  |
| 3 | Delete a record that may be deleted — **choose the record type using the note**, because the common ones record nothing | A delete entry is recorded; the entry itself persists |  |  |  |
| 4 | Perform a lifecycle action (approve, close, or release) | The action is recorded with its own action type |  |  |  |
| 5 | Confirm entries for **interactive user actions** record the originating IP address | IP address present on sampled user-driven entries; absent on system-generated ones — see the note |  |  |  |
| 6 | Confirm the timestamp is system-generated and matches actual time in the recorded timezone | Timestamp correct; not user-supplied |  |  |  |
| 7 | Confirm entries attributed to automated processing are identified as system actions, not as a person | Automated actions are distinguishable |  |  |  |

> **Where to look, and one known gap.** Execute this test case on the
> system-wide **Audit Logs** page, not a record's own history dialog: for several
> modules the dialog omits the entries written by lifecycle actions — see the
> note on [OQ-04 TC-04-10](/validation/oq/capa). Steps 1 to 4 are all
> observable in full on the Audit Logs page.
>
> For step 7, note that records created by the system's own scheduled generation
> — audit instances raised automatically from a recurring programme — produce
> **no audit entries at all**, rather than entries identified as system actions.
> Where your process relies on scheduled generation, record this against
> [OQ-07 TC-07-08](/validation/oq/audit-management), which documents it in
> detail, and confirm separately how those records' origin is evidenced.
>
> **Read this before recording step 3 — most deletions write no entry, by configuration.**
> An ordinary delete in the application is an archive: the row is retained and its
> `deleted` marker is set. Whether that produces a trail entry depends on whether the
> module's audit configuration tracks that marker as a field of interest, and for the two
> record types an executor is most likely to reach for — **nonconformances and CAPAs — it
> does not**. Deleting either writes **no audit entry at all**. That is the configuration,
> not a control failure, and it is not a contradiction of step 1 and 2, which track other
> fields on the same records.
>
> Choose a record type whose configuration does track deletion — a **user** or a
> **department** both work, and a deleted user is recorded with its own delete action.
> Record which type you used, and record the absence for the types you rely on — if your process depends on
> evidencing deletion of a nonconformance or a CAPA, raise it as a deviation and assess it
> rather than marking step 3 failed. See *Controls this protocol does not test* for why
> this is a module-by-module property.
>
> **Step 5 — the IP address is captured for user actions, not for every entry.** The
> originating address is recorded from the request, on both of the application's write
> paths. It is therefore present on entries a person caused through the application, and
> **absent** on entries written by scheduled or background processing, which has no
> request and no address. Sample several user-driven entries rather than asserting that
> every row carries one, and read step 5 together with step 7.

### TC-16-06 — Audit trail integrity *(URS-SEC-08)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open an update entry from TC-16-05 | Both the previous value and the new value are shown |  |  |  |
| 2 | Confirm the previous value is not overwritten or hidden | Prior information remains visible |  |  |  |
| 3 | Search the interface for any means to edit an audit entry | No edit capability exists for any user, including administrators |  |  |  |
| 4 | Search for any means to delete an audit entry | No delete capability exists |  |  |  |
| 5 | Delete the underlying record and confirm its audit history survives | Audit entries remain after the record is deleted |  |  |  |
| 6 | Record how privileged database access is controlled by the supplier | Documented — reference the supplier assessment |  |  |  |

> Step 6 is documentation, not a test. The application cannot prove the absence of
> privileged back-end access; that is a supplier-assessment question and is called out as
> a limitation in the [Part 11 Assessment](/validation/framework/part-11-assessment) §9.

### TC-16-07 — Audit trail review and export *(URS-SEC-09)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Filter the audit log by module | Only that module's entries are returned |  |  |  |
| 2 | Filter by action type | Only matching entries are returned |  |  |  |
| 3 | Filter by performing user | Only that user's actions are returned |  |  |  |
| 4 | Filter by date range | Only entries within the range are returned |  |  |  |
| 5 | Combine filters | Filters apply together |  |  |  |
| 6 | Export the audit trail — see the note; this is done from a **record's** history dialog, not from the filtered page | An export is produced containing timestamp, action, record type and id, performer, user id, IP, and old/new values |  |  |  |
| 7 | Open the export and confirm the content matches what was displayed | Export is complete and accurate |  |  |  |

> **Read this before executing steps 6 and 7 — the export is not where the steps above
> are.** Steps 1 to 5 are performed on the system-wide **Audit Logs** page. That page has
> **no export control at all.** The only export in the product is the **Export CSV** button
> inside a single record's audit-history dialog, and it exports that one record's entries,
> not a filtered multi-module result.
>
> Execute steps 6 and 7 from a record's history dialog, and record plainly that the
> filtered result from steps 1 to 5 cannot itself be exported. If your procedure requires a
> filtered, multi-module export as an inspection deliverable, raise it as a deviation and
> assess it — note that TC-16-08's own guidance on producing a provably complete history
> assumes this export exists in that form, and it does not.
>
> Two further points for the record. The download is assembled **in the browser** from data
> already delivered to it, so what bounds the export is the audit-trail **read** permission
> and the record filter behind it, not a separate server check at download time. And the
> **Audit Trail export** permission is a distinct grant from read: in a default
> configuration it sits with the administrator-tier roles, and the company owner holds it
> through the owner bypass. A user with read alone sees no Export button — that is designed
> behaviour, not a defect. Confirm which account you used.

### TC-16-08 — Human-readable copies for inspection *(URS-SEC-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print a record from each module in scope | Each produces a paginated, legible document |  |  |  |
| 2 | Confirm each printout identifies the record, its status and its approvals | Identification is unambiguous |  |  |  |
| 3 | Save one as PDF and confirm nothing is truncated | Complete content in the PDF |  |  |  |
| 4 | Confirm attachments referenced by a record are retrievable | Attachments open |  |  |  |
| 5 | Confirm the audit history of a record can be produced alongside it | Audit history available in readable form |  |  |  |

> **Step 5 — two observations to record, neither of them a deviation.**
>
> **The per-record history omits duplicate entries.** For CAPA, Nonconformance,
> Change Request and Quality Event records, the audit history shown on the record
> and included with its printout leaves out a small number of redundant entries —
> a record-scoped copy of an action that is also recorded against the approval
> workflow. The action itself remains visible, attributed and timestamped, and its
> reason text appears in the entry that is shown. Measured on one rejected CAPA:
> 13 entries in the trail, 12 in the record's history.
>
> Nothing is lost from the audit trail: every entry exists and the system-wide
> **Audit Logs** page shows them all, filterable and exportable (TC-16-07). Where
> you must produce a provably complete history — an inspection response, a
> regulatory submission — take it from Audit Logs rather than the record printout,
> and say so in your record. That satisfies URS-SEC-10.
>
> **CAPA and Change Request entries are identified by internal identifier.** In
> any audit view, those two record types appear against a long identifier such as
> `6d2c40a5-56ff-4b88-b878-9645d2573c3d` instead of `CAPA-179` or the change
> request number. Nonconformances, quality events and customer complaints display
> their numbers correctly. The data is intact; the presentation is not
> human-readable in the sense this requirement means, and an inspector reading a
> CAPA's history would have to resolve identifiers by hand. Record it as an
> observation against this step and confirm whether your process relies on the
> record printout for this purpose.
>
> See the note on [OQ-04 TC-04-10](/validation/oq/capa) for the mechanism behind
> the first point and its regression test.

### TC-16-09 — Signature/record linking *(URS-SEC-11)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open a signed record and locate its signature | The signature is displayed on the record it belongs to |  |  |  |
| 2 | Confirm the signature is shown against that record only, and not against any other | Signature appears on exactly one record |  |  |  |
| 3 | Attempt to delete a record that carries a signature | The record is **archived rather than erased** — read the note before recording a result |  |  |  |
| 4 | Confirm no interface allows a signature to be copied, moved or re-pointed to another record | No such capability exists |  |  |  |
| 5 | Confirm the signature appears on the printed copy of the record | Present on the printout |  |  |  |

> **Read this before recording step 3.** What is protected is the signature, not the
> record's visibility. A signature can never be **orphaned**: the database refuses to erase
> a signed record outright, because each signature is bound to its subject by a foreign key
> that blocks the deletion. That is a real, both-paths control.
>
> But an ordinary delete in the application is an **archive**, not an erase: the record is
> hidden from lists while its row and its signatures remain. So if you delete a signed CAPA
> or nonconformance with a user holding the delete permission, expect the action to
> **succeed** and the record to disappear from the register, with the signature still
> stored. Record that as the observed behaviour. It is not a loss of the signed evidence,
> and it is retrievable — but it is not a refusal either, so do not record step 3 as a
> refusal unless you observe one.
>
> Two cases to be aware of when choosing your test record. A signed **document version**
> can be deleted outright by its owner while still in draft or rejected — that path checks
> the version's status, not whether a signature exists. And for two subject types the
> binding is set to cascade rather than block, so erasing the parent would take its
> signatures with it. Prefer a CAPA or a nonconformance for this step, and see *Controls
> this protocol does not test*.

### TC-16-10 — Signing requires re-authentication *(URS-SEC-12)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | While signed in, perform an action requiring signature | A credential prompt appears — being signed in is not sufficient by itself |  |  |  |
| 2 | Enter an incorrect credential | The signature is refused **and the underlying action does not occur** |  |  |  |
| 3 | Confirm the record is unchanged after the failed attempt | No partial change was applied |  |  |  |
| 4 | Enter the correct credential | The action completes and the signature is recorded |  |  |  |
| 5 | Repeat the failed attempt enough times to reach the configured limit | The signing credential locks out — **PIN method only**, see the note |  |  |  |
| 6 | Confirm failed signing attempts are recorded | A failure counter is recorded; **no signing-context entry** is written — see the note |  |  |  |
| 7 | Record which signing method is in use and confirm it matches the Part 11 assessment position | Method: __________________ |  |  |  |

> **Read this whole note before executing TC-16-10. Step 7 is not the last step — it
> decides what steps 1 to 6 mean.** Establish the signing method first.
>
> **Steps 5 and 6 apply to the PIN method only.** With a PIN, five failures inside the
> window lock signing for a configured period, and the refusal is explicit. If your
> organisation signs with the **account password** instead, there is **no signing lockout
> at all** and no attempt is counted — repeated wrong credentials are refused individually
> and indefinitely. Record the method, then record steps 5 and 6 against it; mark them N/A
> with that justification if the method is not PIN.
>
> **Step 6 — what is recorded is a counter, and it is not in the audit trail.** A failed
> PIN increments a failure count and a lockout timestamp on the user record. Those two
> columns are **not** in the set of user fields the audit trail tracks, so **no audit entry
> is produced** — do not expect to find one, and do not record its absence as a failure.
> The change is visible only in the user record itself, and no administrator screen
> displays it. The trail therefore cannot answer "who tried to sign what and failed", and
> neither can the interface: there is no record identifier, no meaning and no signing
> context. Demonstrating step 6 requires database access. Record this if your procedure
> relies on reviewing failed signing attempts.
>
> **Step 1 — one interface path mints a signature without asking for a credential.** The
> product's signing dialogs do prompt, and the module flows this protocol exercises
> elsewhere do verify the credential server-side. But there is a data-interface route for
> signing a review task that requires only an authenticated session and that the signer be
> the assigned reviewer — **no credential is requested or checked on that route**. A
> credential prompt in the interface is therefore not, by itself, evidence that signing
> always demands re-authentication. Execute step 1 through the interface and record what
> you observe; then record this limitation, and see *Controls this protocol does not test*
> for the recommended negative test. Under 21 CFR §11.200(a)(1) this is the control that
> distinguishes a signature from an authenticated action, so assess it rather than noting
> it.

### TC-16-11 — Signature content *(URS-SEC-13)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Inspect a recorded signature | The signer's **printed name** is displayed — read the note on how it is derived |  |  |  |
| 2 | Confirm the **date and time** of signing | Present, with timezone |  |  |  |
| 3 | Confirm the **meaning** of the signature (approval, review, closure, responsibility) | Present and correct for the action taken |  |  |  |
| 4 | Confirm all three appear on the human-readable printed copy | All present on the printout |  |  |  |
| 5 | Sign a second record with a different meaning and confirm the meaning differs accordingly | Meaning reflects the action, not a fixed value |  |  |  |

> **Read this before recording steps 1 and 3.**
>
> **Step 1 — the name is resolved, not captured.** The signature stores a reference to the
> signer's user account; the printed name you see is looked up from that account when the
> signature is displayed. The identity itself cannot be deleted — the database refuses to
> remove a user who has signed — so a signature can never lose its signer. But if a
> person's name is later corrected or changed in their profile, historical signatures will
> display the new name rather than the name as it stood at signing. 21 CFR §11.50(a)(1)
> asks for the printed name of the signer; if your assessment requires the name as
> captured at the moment of signing, record this as an observation and state how your
> procedure addresses it. The signing **date, time and meaning** are captured on the
> signature itself and are not affected.
>
> **Step 3 — the meaning is genuinely per-action and server-set.** Each flow writes its own
> meaning: approved, rejected, reviewed, verified, closed, cancelled, disposed, performed,
> and others including full sentences for periodic-review outcomes. It is set by the server
> for the action taken, not chosen by the user. Confirm the meaning matches the action for
> each signature you inspect, rather than assuming a single vocabulary across modules.

**Attach the printout as objective evidence.**

### TC-16-12 — Session control *(URS-SEC-14)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the configured idle and absolute session limits | Idle: ______ min · Absolute: ______ h |  |  |  |
| 2 | Sign in and leave the session idle beyond the idle limit, then attempt an action | The session has ended; re-authentication is required |  |  |  |
| 3 | Confirm no data was left visible or actionable after timeout | Access is closed |  |  |  |
| 4 | Sign out explicitly and press the browser back button | Protected content is not served from cache |  |  |  |
| 5 | Where session revocation is available, revoke a session from another device and confirm it ends | Session terminates |  |  |  |

### TC-16-13 — Multi-factor authentication *(URS-SEC-15)*

Execute if MFA is used. If not, mark N/A and record the written justification.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Record the configured MFA mode, permitted factors and grace period | Recorded |  |  |  |
| 2 | Enrol a test user in MFA | Enrolment completes; factor is registered |  |  |  |
| 3 | Sign in and confirm the second factor is demanded | Prompted for the factor |  |  |  |
| 4 | Enter an incorrect code | Sign-in refused |  |  |  |
| 5 | Enter the correct code | Sign-in succeeds |  |  |  |
| 6 | Where MFA is set to required, confirm a non-enrolled user is forced to enrol after the grace period | Enrolment is enforced |  |  |  |
| 7 | Use a recovery code and confirm it works once and cannot be reused | Single use only |  |  |  |

### TC-16-14 — Deactivation preserves history *(URS-SEC-16)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Using the **Leaver** account, create a record and sign an action so there is history to preserve | Record and signature exist |  |  |  |
| 2 | Deactivate the account | Deactivation is recorded with performer and timestamp |  |  |  |
| 3 | Attempt to sign in as the deactivated user | Sign-in is refused |  |  |  |
| 4 | Confirm any active session for that user is terminated | Existing access ends |  |  |  |
| 5 | Open the records they created and signed | Records remain intact and still attributed to that named person |  |  |  |
| 6 | Confirm their audit entries remain and are still attributed | History is unchanged |  |  |  |
| 7 | Confirm the account cannot be reassigned to a different person | No reassignment capability — or, if technically possible, a procedural control prohibits it (record the SOP) |  |  |  |

### TC-16-15 — Scope of access: own, department, site, company *(URS-SEC-21)*

A permission answers *what* a user may do; its scope answers *which records*. Both are
enforced at the data layer — a record outside a user's scope is never delivered to their
device, so hiding is not what is being tested here.

**Setup:** one NC owned by **Full-User** at Site A / Department 1, and one owned by another
user at Site B / Department 2.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Grant **Scoped-User** Editor on Nonconformance at scope **Own**; list NCs | Only NCs they own are returned |  |  |  |
| 2 | Open the Site B NC by direct URL | Refused; no data rendered |  |  |  |
| 3 | Change the scope to **Department** and repeat | NCs in their department are returned; other departments are not |  |  |  |
| 4 | Change the scope to **Site** and repeat | NCs at every site assigned to the user are returned; other sites are not |  |  |  |
| 5 | Assign the user a second site and repeat without changing the role | Records at both sites are now returned |  |  |  |
| 6 | Change the scope to **Company-wide** and repeat | All NCs in the tenant are returned |  |  |  |
| 7 | Reduce the scope back to **Own** and confirm the wider records disappear | Access is withdrawn |  |  |  |

### TC-16-16 — Capabilities are separate, and ownership is not an exemption *(URS-SEC-22)*

Verifies that each capability gates only itself, and that being the record's owner does not
substitute for holding one. This is the control that makes an **Approve** or **Close** grant
meaningful — without it, anyone able to edit could finish the record.

**Setup:** **Scoped-User** holds Editor (create/read/update) on CAPA, company-wide, with
**no** Approve and **no** Close. They are made the **owner** of a test CAPA.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Scoped-User**, open the CAPA they own and edit a field | The edit saves |  |  |  |
| 2 | Attempt to close it from the record | No Close control is offered |  |  |  |
| 3 | Call the close endpoint directly for that CAPA | Refused, stating the role does not grant the action |  |  |  |
| 4 | Attempt to approve an approval step on it | Refused; approving requires the Approve capability |  |  |  |
| 5 | Grant the role **Close**, sign out and in, and retry | The CAPA closes |  |  |  |
| 6 | Confirm a **different** user with Close, in scope but not the owner, can also close a CAPA | Permitted — ownership is not required |  |  |  |

> **Read this before recording TC-16-16, and note what "ownership" means here.** This test
> case concerns **record** ownership — being the owner or author of the CAPA — and for that
> the control is real and deliberate: a record's owner holds no verb they were not granted.
> The short-circuit that once let any owner close or approve their own record was removed
> precisely because it made the Close and Approve grants unenforceable.
>
> **Company ownership is different, and it is an exemption.** The account flagged as the
> company owner bypasses every permission and scope check unconditionally — in the
> controllers, in the permission service, and inside the database's own row-level policies.
> A company owner can close, approve and read anything in the tenant regardless of role.
> So do **not** execute any step of this test case, or of TC-16-03, TC-16-15 or TC-16-17,
> using the company-owner account: every negative step will pass permissively and the
> protocol will record a control that was never exercised. Use **Scoped-User** as the setup
> states. Record in your validation report how many accounts hold company ownership and how
> that is controlled procedurally, since no permission configuration constrains them.

### TC-16-17 — Acting on another user's task, with attribution *(URS-SEC-23)*

Work must not stall when an assignee is unavailable, and a task taken over must be
unmistakable and fully attributed. Part 11 relevance: the signature records **who signed**
and **whose task it was**.

**Setup:** an in-progress approval step assigned to **Full-User**. **Approver-User** is not
the assignee but holds Approve on the module, in scope.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | As **Approver-User**, open the record and locate the step | The workflow and its steps are visible |  |  |  |
| 2 | Inspect the action control | It names the assignee — "Approve on behalf of *\<assignee\>*" — and is not presented as an ordinary Approve |  |  |  |
| 3 | Confirm the task does **not** appear in Approver-User's own task list | Only the assignee's queue holds it |  |  |  |
| 4 | Complete the action, signing where the step requires it | The step completes |  |  |  |
| 5 | Inspect the audit trail | The entry attributes the action to **Approver-User** |  |  |  |
| 6 | Inspect the signature record | Signed by **Approver-User**, recording **Full-User** as the user whose task was actioned |  |  |  |
| 7 | Sign in as **Full-User** and check notifications | A notification states that their task was actioned, naming who did it |  |  |  |
| 8 | Repeat as **Read-Only** (no Approve) on another such step | Refused; no control is offered and the endpoint rejects the call |  |  |  |

## 5. Procedural controls — verification by inspection

These are not testable in the application. Confirm the SOP exists, is approved, and is in
force.

| # | Control | SOP reference | Verified (init/date) |
| --- | --- | --- | --- |
| 1 | Electronic signature accountability policy, acknowledged by users |  |  |
| 2 | FDA §11.100(c) certification letter submitted **[if US-regulated]** |  |  |
| 3 | Identity verification before credential issue |  |  |
| 4 | Prohibition of shared / generic / reassigned accounts |  |  |
| 5 | Periodic access review |  |  |
| 6 | Periodic audit-trail review |  |  |
| 7 | Credential loss and compromise handling |  |  |
| 8 | Record retention and archival |  |  |

## 6. Controls this protocol does not test

The behaviours below are present in the product but are **not exercised by any test case
above**. A risk assessment may require the organisation to cover them with its own test
cases or procedural controls. Several are the enforcement layer *underneath* a step above —
the step observes the interface, and the control named here is what actually binds.

- **Signing through the data interface without a credential** — the recommended negative
  test for TC-16-10 step 1. A signature on a review task can be created over the
  application's data interface by an authenticated assigned reviewer with **no credential
  requested or verified**. Recommended test: attempt it, and if it succeeds, control the
  data interface procedurally and record the justification under §11.200(a)(1).
- **The signature ledger's immutability** — signatures cannot be altered or deleted through
  the application's data interface, which is sealed at the database privilege layer. The
  equivalent seal is **not** applied as a database trigger, so the protection does not
  extend to a trusted back-end connection the way the audit trail's does. Recommended
  test: confirm no interface path alters a stored signature, and treat back-end access as
  a supplier-assessment question (TC-16-06 step 6).
- **The tamper-evidence hash** — each signature carries a hash binding it to its signer,
  meaning, timestamp and subject record, so a re-pointed signature is detectable. One
  subject type is excluded from the binding. Recommended test: none in the application;
  record it as a supplier control.
- **Signing lockout on the password method** — TC-16-10 steps 5 and 6 are executable for
  the PIN method only. If signing uses the account password, no lockout or attempt counter
  applies to signing at all.
- **Deletion of a signed document version** — a draft or rejected version can be erased by
  its owner; the check is the version's status, not the presence of a signature. Two other
  subject types are bound to cascade rather than block. Recommended test: attempt deletion
  of the record types your process signs, and record which are erasable.
- **Audit-trail capture of deletions, module by module** — the trail *can* record a
  deletion with its prior values, performer and IP address, but whether it does is a
  **per-module configuration**, not a system-wide guarantee: each module names the fields
  its trail tracks, and a module that does not track the deletion marker writes no entry
  when a record is archived. Nonconformances and CAPAs are both in that position today.
  The same mechanism governs which *field changes* appear for each module. Recommended
  test: for every module your process relies on, archive a record and confirm whether an
  entry appears, rather than generalising from TC-16-05.
- **Scope enforcement below the interface** — TC-16-15 observes what is returned. The
  enforcement is in the database's row-level policies for the application's own read path,
  and in server-side checks for actions. Scope on the `site` tier matches the user's
  **effective** site set — primary plus additionally assigned sites. Recommended test: the
  direct-URL steps already in TC-16-15, plus a check that a scoped user cannot act on an
  out-of-scope record through the API.
- **Company-owner bypass** — the company-owner flag bypasses every permission and scope
  check, including the database policies. No permission configuration constrains it; it is
  a procedural control. See the note on TC-16-16.
- **Session revocation and device list** — a user may end their own other sessions, and an
  administrator may force-log-out a user. TC-16-12 step 5 touches revocation only where
  available.
- **The security event log** — failed sign-ins, lockouts, unlocks, MFA failures and
  recovery-code use are recorded in an append-only security log distinct from the module
  audit trail. TC-16-02 step 4 reads it; no test case reviews it as a whole.
- **Which modules reach the audit trail at all** — the most consequential control in this
  list. Each module names the fields whose changes its trail records; a change to a field
  outside that set produces **no entry**, even though the database's own capture fired.
  This is why a deletion is recorded for some record types and not others (TC-16-05 step 3)
  and why a record's own history dialog can omit entries the system-wide page shows.
  Recommended test: for every module your process relies on, make a change of each kind you
  must be able to evidence — status, ownership, placement, deletion — and confirm an entry
  appears with both values. Do not generalise from one module.
- **Signature revocation** — a recorded signature can be revoked, with a reason and a
  timestamp, and the revocation is the one change the trail records against a signature.
  It is the sanctioned exception to the immutability described above. Recommended test:
  confirm who may revoke, that a reason is required, and how a revoked signature appears on
  the record and its printout.
- **Signing at another person's workstation** — a signature records, separately from the
  signer, the operator whose session was active when a different person signed at their
  device, and that pairing is bound into the tamper-evidence hash. This is a distinct
  scenario from the task take-over in TC-16-17. Recommended test: perform a supervised
  signature and confirm both identities are recorded.
- **Notification of a task actioned on your behalf** — the assignee is notified, naming the
  actor (TC-16-17 step 7). Delivery is best-effort: a notification failure does not undo
  the action.

## 7. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

## 8. Execution summary

| Test case | Steps | Passed | Failed | N/A | Deviation ref |
| --- | --- | --- | --- | --- | --- |
| TC-16-01 |  |  |  |  |  |
| TC-16-02 |  |  |  |  |  |
| TC-16-03 |  |  |  |  |  |
| TC-16-04 |  |  |  |  |  |
| TC-16-05 |  |  |  |  |  |
| TC-16-06 |  |  |  |  |  |
| TC-16-07 |  |  |  |  |  |
| TC-16-08 |  |  |  |  |  |
| TC-16-09 |  |  |  |  |  |
| TC-16-10 |  |  |  |  |  |
| TC-16-11 |  |  |  |  |  |
| TC-16-12 |  |  |  |  |  |
| TC-16-13 |  |  |  |  |  |
| TC-16-14 |  |  |  |  |  |
| TC-16-15 |  |  |  |  |  |
| TC-16-16 |  |  |  |  |  |
| TC-16-17 |  |  |  |  |  |

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
