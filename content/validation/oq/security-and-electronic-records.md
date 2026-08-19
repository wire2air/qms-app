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
| 8 | Confirm a newly invited user is required to change their password at first sign-in | Forced change occurs, if configured |  |  |  |
| 9 | Record the configured password expiry period | Recorded: __________ days |  |  |  |

### TC-16-02 — Account lockout *(URS-SEC-03)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Using the **Leaver** test account, submit incorrect passwords up to one less than the configured maximum | Sign-in refused each time; account not yet locked |  |  |  |
| 2 | Submit one further incorrect password, reaching the configured maximum | The account is locked |  |  |  |
| 3 | Attempt to sign in with the **correct** password while locked | Sign-in is refused despite correct credentials |  |  |  |
| 4 | Confirm the lockout and the failed attempts are visible to an administrator or recorded in the trail | The events are recorded |  |  |  |
| 5 | Confirm the account becomes usable after the configured lockout duration, or after administrator unlock | Access is restored by the expected mechanism only |  |  |  |

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
| 7 | Change **Read-Only**'s role to grant write, sign out and in again, and confirm the new permission takes effect | Access reflects the updated role |  |  |  |
| 8 | Revoke the permission again and confirm access is withdrawn | Access is withdrawn |  |  |  |

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
| 3 | Delete a record that may be deleted | A delete entry is recorded; the entry itself persists |  |  |  |
| 4 | Perform a lifecycle action (approve, close, or release) | The action is recorded with its own action type |  |  |  |
| 5 | Confirm each entry records the originating IP address | IP address present |  |  |  |
| 6 | Confirm the timestamp is system-generated and matches actual time in the recorded timezone | Timestamp correct; not user-supplied |  |  |  |
| 7 | Confirm entries attributed to automated processing are identified as system actions, not as a person | Automated actions are distinguishable |  |  |  |

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
| 6 | Export the filtered result | An export is produced containing timestamp, action, record type and id, performer, IP, and old/new values |  |  |  |
| 7 | Open the export and confirm the content matches what was displayed | Export is complete and accurate |  |  |  |

**Attach the export as objective evidence.**

### TC-16-08 — Human-readable copies for inspection *(URS-SEC-10)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Print a record from each module in scope | Each produces a paginated, legible document |  |  |  |
| 2 | Confirm each printout identifies the record, its status and its approvals | Identification is unambiguous |  |  |  |
| 3 | Save one as PDF and confirm nothing is truncated | Complete content in the PDF |  |  |  |
| 4 | Confirm attachments referenced by a record are retrievable | Attachments open |  |  |  |
| 5 | Confirm the audit history of a record can be produced alongside it | Audit history available in readable form |  |  |  |

### TC-16-09 — Signature/record linking *(URS-SEC-11)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Open a signed record and locate its signature | The signature is displayed on the record it belongs to |  |  |  |
| 2 | Confirm the signature is shown against that record only, and not against any other | Signature appears on exactly one record |  |  |  |
| 3 | Attempt to delete a record that carries a signature | Deletion is refused |  |  |  |
| 4 | Confirm no interface allows a signature to be copied, moved or re-pointed to another record | No such capability exists |  |  |  |
| 5 | Confirm the signature appears on the printed copy of the record | Present on the printout |  |  |  |

### TC-16-10 — Signing requires re-authentication *(URS-SEC-12)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | While signed in, perform an action requiring signature | A credential prompt appears — being signed in is not sufficient by itself |  |  |  |
| 2 | Enter an incorrect credential | The signature is refused **and the underlying action does not occur** |  |  |  |
| 3 | Confirm the record is unchanged after the failed attempt | No partial change was applied |  |  |  |
| 4 | Enter the correct credential | The action completes and the signature is recorded |  |  |  |
| 5 | Repeat the failed attempt enough times to reach the configured limit | The signing credential locks out |  |  |  |
| 6 | Confirm failed signing attempts are recorded | Attempts are captured |  |  |  |
| 7 | Record which signing method is in use and confirm it matches the Part 11 assessment position | Method: __________________ |  |  |  |

### TC-16-11 — Signature content *(URS-SEC-13)*

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Inspect a recorded signature | It shows the **printed name** of the signer |  |  |  |
| 2 | Confirm the **date and time** of signing | Present, with timezone |  |  |  |
| 3 | Confirm the **meaning** of the signature (approval, review, closure, responsibility) | Present and correct for the action taken |  |  |  |
| 4 | Confirm all three appear on the human-readable printed copy | All present on the printout |  |  |  |
| 5 | Sign a second record with a different meaning and confirm the meaning differs accordingly | Meaning reflects the action, not a fixed value |  |  |  |

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

## 6. Deviation log

| # | Step ref | Description | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

## 7. Execution summary

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

**Overall result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |
