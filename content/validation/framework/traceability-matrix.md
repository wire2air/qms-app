---
id: traceability-matrix
title: Requirements Traceability Matrix
sidebar_position: 6
description: Baseline user requirements for Qability QMS mapped to the protocol and test case that verifies each one.
keywords: [RTM, traceability, URS, requirements, coverage, verification]
---

# Requirements Traceability Matrix

**Document ID:** VAL-RTM-001 · **Version:** 1.0

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Prepared by |  |  |  |  |
| Approved by (QA) |  |  |  |  |

## 1. Purpose

To demonstrate that every user requirement is verified by at least one executed test, and
to make change impact assessment fast: when a supplier release touches a function, this
matrix tells you which protocol to re-execute.

## 2. How to use it

1. **Adopt or replace.** The requirements below are a baseline drawn from the product's
   standard behaviour. Compare them with your own URS. Add your requirements, delete what
   you do not use, and mark anything not applicable with a justification.
2. **Complete the result columns during execution.** A requirement is only covered when
   its test has actually been executed and passed.
3. **Every requirement needs a row with a result.** A requirement with no verification is
   a gap; a requirement deliberately excluded needs a written justification, not a blank.

**Verification method key:** T = Test (OQ/PQ) · I = Inspection / documented review ·
A = Supplier assessment · P = Procedural control (SOP)

## 3. Cross-cutting requirements — electronic records and access

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-SEC-01 | Access is restricted to authenticated, individually identified users | T | OQ-16 | TC-16-01 |  |  |
| URS-SEC-02 | Password complexity, history and expiry are enforced to the organisation's standard | T | OQ-16 | TC-16-01 |  |  |
| URS-SEC-03 | Repeated failed authentication locks the account | T | OQ-16 | TC-16-02 |  |  |
| URS-SEC-04 | Permissions restrict each user to the modules and actions granted to their role | T | OQ-16 | TC-16-03 |  |  |
| URS-SEC-05 | A user cannot reach a record by direct URL that their permissions deny | T | OQ-16 | TC-16-03 |  |  |
| URS-SEC-06 | Data of one tenant is not accessible from another | T | IQ, OQ-16 | §9, TC-16-04 |  |  |
| URS-SEC-07 | All create, update and delete actions are captured in a computer-generated, time-stamped audit trail | T | OQ-16 | TC-16-05 |  |  |
| URS-SEC-08 | Audit entries cannot be edited or deleted by users, and prior values are preserved | T | OQ-16 | TC-16-06 |  |  |
| URS-SEC-09 | The audit trail can be filtered and exported for review | T | OQ-16 | TC-16-07 |  |  |
| URS-SEC-10 | Accurate, complete, human-readable copies of records can be produced for inspection | T | OQ-16 | TC-16-08 |  |  |
| URS-SEC-11 | Electronic signatures are permanently linked to the record signed and cannot be transferred | T | OQ-16 | TC-16-09 |  |  |
| URS-SEC-12 | Signing requires re-authentication with a credential distinct from the session | T | OQ-16 | TC-16-10 |  |  |
| URS-SEC-13 | Each signature records the signer's name, date and time, and the meaning of the signature | T | OQ-16 | TC-16-11 |  |  |
| URS-SEC-14 | Idle and absolute session limits terminate inactive sessions | T | OQ-16 | TC-16-12 |  |  |
| URS-SEC-15 | Multi-factor authentication can be required for all users | T | OQ-16 | TC-16-13 |  |  |
| URS-SEC-16 | Deactivating a user removes access while retaining their historical records and signatures | T | OQ-16 | TC-16-14 |  |  |
| URS-SEC-17 | The supplier maintains backup, restore and recovery arrangements | A, I | IQ | §4 |  |  |
| URS-SEC-18 | Users are accountable for actions taken under their electronic signature | P | — | SOP |  |  |
| URS-SEC-19 | Identity is verified before a signing credential is issued | P | — | SOP |  |  |
| URS-SEC-20 | The audit trail is reviewed periodically | P | — | SOP |  |  |
| URS-SEC-21 | Each permission is limited to a scope — the user's own records, their department, their assigned sites, or the whole company — and records outside that scope are not delivered | T | OQ-16 | TC-16-15 |  |  |
| URS-SEC-22 | Each capability (edit, approve, close, delete) is granted independently, and owning a record does not confer a capability the user's role withholds | T | OQ-16 | TC-16-16 |  |  |
| URS-SEC-23 | A permitted user may action a task assigned to another user; the action is presented as acting on their behalf, the assignee is notified, and both identities are recorded in the audit trail and signature | T | OQ-16 | TC-16-17 |  |  |

## 4. Document Control

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-DOC-01 | Controlled documents are created with mandatory metadata enforced | T | OQ-01 | TC-01-01 |  |  |
| URS-DOC-02 | Each document receives a unique, automatically generated number | T | OQ-01 | TC-01-02 |  |  |
| URS-DOC-03 | Document content is authored in structured, numbered sections | T | OQ-01 | TC-01-03 |  |  |
| URS-DOC-04 | A document version is routed for review through a defined approval workflow | T | OQ-01 | TC-01-04 |  |  |
| URS-DOC-05 | A reviewer can request changes, returning the version to the author | T | OQ-01 | TC-01-05 |  |  |
| URS-DOC-06 | Approval requires an electronic signature | T | OQ-01 | TC-01-06 |  |  |
| URS-DOC-07 | Only an approved version can be made effective | T | OQ-01 | TC-01-07 |  |  |
| URS-DOC-08 | Releasing a version supersedes the previously effective version | T | OQ-01 | TC-01-07 |  |  |
| URS-DOC-09 | A new version requires documented change control (reason, type, summary) | T | OQ-01 | TC-01-08 |  |  |
| URS-DOC-10 | Superseded versions remain retrievable and are identifiable as not current | T | OQ-01 | TC-01-08 |  |  |
| URS-DOC-11 | A printed copy states the document identifier, version and status, and non-effective versions are marked not for controlled use | T | OQ-01 | TC-01-09 |  |  |
| URS-DOC-12 | Periodic review can be scheduled and generates a task when due | T | OQ-01 | TC-01-10 |  |  |
| URS-DOC-13 | Archiving a document requires a recorded reason | T | OQ-01 | TC-01-11 |  |  |
| URS-DOC-14 | The complete document history is available in the audit trail | T | OQ-01 | TC-01-12 |  |  |
| URS-DOC-15 | Users without document permissions cannot create or approve documents | T | OQ-01 | TC-01-13 |  |  |
| URS-DOC-16 | Bulk-imported legacy documents are traceable to their source file | T | OQ-01 | TC-01-14 |  |  |

## 5. Training Management

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-TRN-01 | Training content, material and assessment can be authored | T | OQ-02 | TC-02-01 |  |  |
| URS-TRN-02 | Publishing locks training content against further edit | T | OQ-02 | TC-02-02 |  |  |
| URS-TRN-03 | Training is assigned to named individuals and/or roles | T | OQ-02 | TC-02-03 |  |  |
| URS-TRN-04 | Trainees must review all required material before assessment | T | OQ-02 | TC-02-04 |  |  |
| URS-TRN-05 | Assessments are scored against a configured passing score | T | OQ-02 | TC-02-05 |  |  |
| URS-TRN-06 | The configured maximum number of attempts is enforced | T | OQ-02 | TC-02-06 |  |  |
| URS-TRN-07 | Training completion is signed by the trainee | T | OQ-02 | TC-02-07 |  |  |
| URS-TRN-08 | Competency is verified by a designated manager, with sign-off | T | OQ-02 | TC-02-08 |  |  |
| URS-TRN-09 | Rejection routes the trainee to retraining | T | OQ-02 | TC-02-08 |  |  |
| URS-TRN-10 | Linked documents are pinned to the version effective at launch | T | OQ-02 | TC-02-09 |  |  |
| URS-TRN-11 | Training records are retrievable and reportable per person and per training | T | OQ-02 | TC-02-10 |  |  |

## 6. Nonconformance

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-NCR-01 | Nonconformances are raised with mandatory classification enforced | T | OQ-03 | TC-03-01 |  |  |
| URS-NCR-02 | Each NC receives a unique identifier | T | OQ-03 | TC-03-02 |  |  |
| URS-NCR-03 | A draft NC can be corrected or deleted before it becomes a permanent record | T | OQ-03 | TC-03-03 |  |  |
| URS-NCR-04 | Opening an NC makes it a permanent record that can no longer be deleted | T | OQ-03 | TC-03-04 |  |  |
| URS-NCR-05 | The NC is investigated through a defined workflow | T | OQ-03 | TC-03-05 |  |  |
| URS-NCR-06 | A material disposition and supporting notes are recorded and required before closure | T | OQ-03 | TC-03-06 |  |  |
| URS-NCR-07 | Where CAPA is required, at least one linked CAPA must exist before closure | T | OQ-03 | TC-03-07 |  |  |
| URS-NCR-08 | Closure requires an electronic signature and renders the record read-only | T | OQ-03 | TC-03-08 |  |  |
| URS-NCR-09 | Cancelling an NC requires a recorded reason | T | OQ-03 | TC-03-09 |  |  |
| URS-NCR-10 | The full NC history is available in the audit trail | T | OQ-03 | TC-03-10 |  |  |

## 7. CAPA

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-CAP-01 | CAPAs are raised with mandatory classification enforced | T | OQ-04 | TC-04-01 |  |  |
| URS-CAP-02 | Starting a CAPA launches its workflow and makes it a permanent record | T | OQ-04 | TC-04-02 |  |  |
| URS-CAP-03 | Investigation and action steps are executed and recorded through the workflow | T | OQ-04 | TC-04-03 |  |  |
| URS-CAP-04 | A CAPA cannot be closed while workflow steps or sub-tasks remain open | T | OQ-04 | TC-04-04 |  |  |
| URS-CAP-05 | Closure requires an electronic signature and schedules an effectiveness check | T | OQ-04 | TC-04-05 |  |  |
| URS-CAP-06 | The effectiveness check is completed with an outcome and notes, signed | T | OQ-04 | TC-04-06 |  |  |
| URS-CAP-07 | A "not effective" outcome is recorded and can trigger further action | T | OQ-04 | TC-04-07 |  |  |
| URS-CAP-08 | Cancelling a CAPA requires a recorded reason and signature | T | OQ-04 | TC-04-08 |  |  |
| URS-CAP-09 | CAPAs can be linked to the nonconformances that caused them, many to one | T | OQ-04 | TC-04-09 |  |  |
| URS-CAP-10 | The full CAPA history is available in the audit trail | T | OQ-04 | TC-04-10 |  |  |

## 8. Change Control

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-CHG-01 | Change requests are raised with mandatory classification enforced | T | OQ-05 | TC-05-01 |  |  |
| URS-CHG-02 | Impact and risk of the change are assessed and recorded | T | OQ-05 | TC-05-02 |  |  |
| URS-CHG-03 | The change is approved through a defined workflow before implementation | T | OQ-05 | TC-05-03 |  |  |
| URS-CHG-04 | Affected records can be linked to the change | T | OQ-05 | TC-05-04 |  |  |
| URS-CHG-05 | Implementation and closure are recorded, with signature where required | T | OQ-05 | TC-05-05 |  |  |
| URS-CHG-06 | The full change history is available in the audit trail | T | OQ-05 | TC-05-06 |  |  |

## 9. Complaints

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-CMP-01 | Complaints are logged with mandatory detail enforced | T | OQ-06 | TC-06-01 |  |  |
| URS-CMP-02 | Product, lot and customer detail are captured | T | OQ-06 | TC-06-02 |  |  |
| URS-CMP-03 | QA review, investigation decision and justification are recorded | T | OQ-06 | TC-06-03 |  |  |
| URS-CMP-04 | Reportability to a regulator is assessed and the decision recorded | T | OQ-06 | TC-06-04 |  |  |
| URS-CMP-05 | A complaint can be escalated to a nonconformance, with the link retained | T | OQ-06 | TC-06-05 |  |  |
| URS-CMP-06 | Closure is controlled and recorded | T | OQ-06 | TC-06-06 |  |  |
| URS-CMP-07 | A complaint record can be printed in full for inspection | T | OQ-06 | TC-06-07 |  |  |
| URS-CMP-08 | The full complaint history is available in the audit trail | T | OQ-06 | TC-06-08 |  |  |

## 10. Audit Management

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-AUD-01 | Audit standards and their clauses are maintained | T | OQ-07 | TC-07-01 |  |  |
| URS-AUD-02 | An audit programme schedules audits over a period | T | OQ-07 | TC-07-02 |  |  |
| URS-AUD-03 | An audit is planned with scope, dates and audit team | T | OQ-07 | TC-07-03 |  |  |
| URS-AUD-04 | Requirements are assessed and responses with evidence recorded | T | OQ-07 | TC-07-04 |  |  |
| URS-AUD-05 | Findings are raised, classified and tracked to closure | T | OQ-07 | TC-07-05 |  |  |
| URS-AUD-06 | A finding can generate a linked CAPA | T | OQ-07 | TC-07-06 |  |  |
| URS-AUD-07 | An audit report can be produced | T | OQ-07 | TC-07-07 |  |  |
| URS-AUD-08 | The full audit history is available in the audit trail | T | OQ-07 | TC-07-08 |  |  |

## 11. Risk Management

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-RSK-01 | Risk assessment templates define the scoring method in use | T | OQ-08 | TC-08-01 |  |  |
| URS-RSK-02 | A risk assessment is created and hazards recorded | T | OQ-08 | TC-08-02 |  |  |
| URS-RSK-03 | Risk level is derived consistently from the recorded scores | T | OQ-08 | TC-08-03 |  |  |
| URS-RSK-04 | Mitigations are recorded and residual risk re-scored | T | OQ-08 | TC-08-04 |  |  |
| URS-RSK-05 | Risk assessments are reviewed and approved | T | OQ-08 | TC-08-05 |  |  |
| URS-RSK-06 | The full risk history is available in the audit trail | T | OQ-08 | TC-08-06 |  |  |

## 12. QC Inspection

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-QCI-01 | Specifications define characteristics with limits and test methods | T | OQ-09 | TC-09-01 |  |  |
| URS-QCI-02 | Sampling plans determine sample size and accept/reject criteria | T | OQ-09 | TC-09-02 |  |  |
| URS-QCI-03 | An inspection lot is created against a specification and sampling plan | T | OQ-09 | TC-09-03 |  |  |
| URS-QCI-04 | Results are recorded per characteristic, and per sample where required | T | OQ-09 | TC-09-04 |  |  |
| URS-QCI-05 | Out-of-specification results are detected and flagged automatically | T | OQ-09 | TC-09-05 |  |  |
| URS-QCI-06 | Lot accept/reject follows the sampling plan's criteria | T | OQ-09 | TC-09-06 |  |  |
| URS-QCI-07 | A rejected lot is dispositioned and can raise a nonconformance | T | OQ-09 | TC-09-07 |  |  |
| URS-QCI-08 | Inspection results are approved by an authorised person | T | OQ-09 | TC-09-08 |  |  |
| URS-QCI-09 | An inspection report can be produced | T | OQ-09 | TC-09-09 |  |  |
| URS-QCI-10 | The full inspection history is available in the audit trail | T | OQ-09 | TC-09-10 |  |  |

## 13. Log Books

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-LOG-01 | A controlled log book is defined with its entry form | T | OQ-10 | TC-10-01 |  |  |
| URS-LOG-02 | Activating a log book freezes its definition | T | OQ-10 | TC-10-02 |  |  |
| URS-LOG-03 | Entries are scheduled or triggered as configured | T | OQ-10 | TC-10-03 |  |  |
| URS-LOG-04 | Entries are captured with attribution and timestamp | T | OQ-10 | TC-10-04 |  |  |
| URS-LOG-05 | Untrained users are prevented from making entries | T | OQ-10 | TC-10-05 |  |  |
| URS-LOG-06 | Entries are reviewed and signed by an authorised reviewer | T | OQ-10 | TC-10-06 |  |  |
| URS-LOG-07 | Correcting an entry preserves the original value | T | OQ-10 | TC-10-07 |  |  |
| URS-LOG-08 | A log book register can be printed for a date range | T | OQ-10 | TC-10-08 |  |  |
| URS-LOG-09 | The full log book history is available in the audit trail | T | OQ-10 | TC-10-09 |  |  |

## 14. Equipment & Calibration

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-EQP-01 | Equipment is registered with identification and location | T | OQ-11 | TC-11-01 |  |  |
| URS-EQP-02 | Calibration due dates are recorded and tracked | T | OQ-11 | TC-11-02 |  |  |
| URS-EQP-03 | Preventive maintenance is scheduled and tracked | T | OQ-11 | TC-11-03 |  |  |
| URS-EQP-04 | Equipment status changes (in service / out of service) are recorded | T | OQ-11 | TC-11-04 |  |  |
| URS-EQP-05 | Overdue calibration or maintenance is visible to the responsible person | T | OQ-11 | TC-11-05 |  |  |
| URS-EQP-06 | The full equipment history is available in the audit trail | T | OQ-11 | TC-11-06 |  |  |

## 15. Supplier Management

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-SUP-01 | Suppliers are registered with identifying and categorisation detail | T | OQ-12 | TC-12-01 |  |  |
| URS-SUP-02 | Supplier qualification is assessed and scored | T | OQ-12 | TC-12-02 |  |  |
| URS-SUP-03 | Certificates are held with expiry dates and expiry is surfaced | T | OQ-12 | TC-12-03 |  |  |
| URS-SUP-04 | Approved status is controlled and visible | T | OQ-12 | TC-12-04 |  |  |
| URS-SUP-05 | A supplier contact can participate in an assigned record step and see nothing else | T | OQ-12 | TC-12-05 |  |  |
| URS-SUP-06 | A supplier can be blocked and requalified, with reasons recorded | T | OQ-12 | TC-12-06 |  |  |
| URS-SUP-07 | The full supplier history is available in the audit trail | T | OQ-12 | TC-12-07 |  |  |

## 16. Forms & Workflows

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-WFL-01 | Form templates are built with typed fields | T | OQ-13 | TC-13-01 |  |  |
| URS-WFL-02 | Required-field and data-type validation is enforced on entry | T | OQ-13 | TC-13-02 |  |  |
| URS-WFL-03 | Form templates are versioned and published | T | OQ-13 | TC-13-03 |  |  |
| URS-WFL-04 | Workflow templates define ordered steps with assignee roles | T | OQ-13 | TC-13-04 |  |  |
| URS-WFL-05 | Publishing a workflow version locks it; changes require a new version | T | OQ-13 | TC-13-05 |  |  |
| URS-WFL-06 | Steps activate strictly in the defined sequence | T | OQ-13 | TC-13-06 |  |  |
| URS-WFL-07 | Approval rules ALL and ANY behave as specified | T | OQ-13 | TC-13-07 |  |  |
| URS-WFL-08 | Mandatory comment and mandatory e-signature settings are enforced | T | OQ-13 | TC-13-08 |  |  |
| URS-WFL-09 | Reject stops the run; request-changes returns it to the owner | T | OQ-13 | TC-13-09 |  |  |
| URS-WFL-10 | Retired workflow versions remain readable for historical records | T | OQ-13 | TC-13-10 |  |  |
| URS-WFL-11 | The full workflow history is available in the audit trail | T | OQ-13 | TC-13-11 |  |  |

## 17. Item Master

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-ITM-01 | Items are registered with identifying detail | T | OQ-14 | TC-14-01 |  |  |
| URS-ITM-02 | Item codes are unique within the tenant | T | OQ-14 | TC-14-02 |  |  |
| URS-ITM-03 | Items can be associated with their suppliers | T | OQ-14 | TC-14-03 |  |  |
| URS-ITM-04 | Items are selectable in downstream quality records | T | OQ-14 | TC-14-04 |  |  |
| URS-ITM-05 | An item can be withdrawn from use without losing its history | T | OQ-14 | TC-14-05 |  |  |
| URS-ITM-06 | The full item history is available in the audit trail | T | OQ-14 | TC-14-06 |  |  |

## 18. Retain Samples

| Req ID | Requirement | Method | Protocol | Test case | Result | Ref |
| --- | --- | --- | --- | --- | --- | --- |
| URS-RET-01 | Retain samples are registered against product and lot | T | OQ-15 | TC-15-01 |  |  |
| URS-RET-02 | A label identifying the sample can be produced | T | OQ-15 | TC-15-02 |  |  |
| URS-RET-03 | Storage location and custody changes are recorded | T | OQ-15 | TC-15-03 |  |  |
| URS-RET-04 | Disposal is an authorised, authenticated action with a recorded reason | T | OQ-15 | TC-15-04 |  |  |
| URS-RET-05 | A register of retained samples can be produced | T | OQ-15 | TC-15-05 |  |  |
| URS-RET-06 | The full sample history is available in the audit trail | T | OQ-15 | TC-15-06 |  |  |

## 19. Coverage summary

Complete after execution.

| Module | Requirements | Verified | Excluded (justified) | Open |
| --- | --- | --- | --- | --- |
| Cross-cutting (SEC) | 20 |  |  |  |
| Document Control | 16 |  |  |  |
| Training | 11 |  |  |  |
| Nonconformance | 10 |  |  |  |
| CAPA | 10 |  |  |  |
| Change Control | 6 |  |  |  |
| Complaints | 8 |  |  |  |
| Audit Management | 8 |  |  |  |
| Risk Management | 6 |  |  |  |
| QC Inspection | 10 |  |  |  |
| Log Books | 9 |  |  |  |
| Equipment | 6 |  |  |  |
| Supplier Management | 7 |  |  |  |
| Forms & Workflows | 11 |  |  |  |
| Item Master | 6 |  |  |  |
| Retain Samples | 6 |  |  |  |
| **Total** | **150** |  |  |  |

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Compiled by |  |  |  |
| Approved by (QA) |  |  |  |
