---
id: part-11-assessment
title: 21 CFR Part 11 / EU Annex 11 Assessment
sidebar_position: 3
description: Clause-by-clause assessment of Qability QMS against 21 CFR Part 11 and EU GMP Annex 11, separating product controls from the procedural controls the customer must supply.
keywords: [21 CFR Part 11, Annex 11, electronic signature, audit trail, data integrity, compliance assessment, ALCOA]
---

# 21 CFR Part 11 / EU GMP Annex 11 Assessment

**Document ID:** VAL-P11-001 · **Version:** 1.0 · **System:** Qability QMS

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Prepared by |  |  |  |  |
| Reviewed by (System Owner) |  |  |  |  |
| Approved by (Quality Assurance) |  |  |  |  |

## 1. Purpose and how to read this document

This assessment states, clause by clause, which Part 11 and Annex 11 controls **the
product provides**, and which are **procedural obligations that remain with the regulated
user**. Both kinds are required for compliance. A system cannot make you compliant on its
own, and no honest vendor assessment claims otherwise.

Each row is marked:

| Marking | Meaning |
| --- | --- |
| **Product** | The application implements the control. Verify it during OQ. |
| **Procedural** | The control is your responsibility — an SOP, a training record, a management decision. The product cannot supply it. |
| **Shared** | The product provides a capability; you must configure it and govern its use. |

> **Verify, don't assume.** This document is the supplier's statement of capability. It is
> not evidence. The evidence is your executed OQ, and in particular
> [OQ-16 Security, Access & Electronic Records](/validation/oq/security-and-electronic-records),
> which tests the controls listed here. Where a row says "verify in OQ-16 TC-xx", that is
> the test that turns the claim into evidence.

## 2. Applicability

Complete before use:

| Question | Answer |
| --- | --- |
| Are records created/maintained in this system predicate-rule records? | **[Yes / No]** |
| Are electronic signatures used in place of handwritten signatures? | **[Yes / No]** |
| Has the Part 11 §11.100(c) certification letter been submitted to FDA? | **[Yes / No — date]** |
| Is this a hybrid (paper + electronic) process? | **[Yes / No — describe]** |

## 3. Subpart B — Controls for closed systems (§11.10)

Qability QMS is operated as a **closed system**: access is controlled by the organisation
responsible for the records, through per-tenant user accounts and role-based permissions.

| Clause | Requirement | Type | How it is met |
| --- | --- | --- | --- |
| §11.10(a) | Validation of systems to ensure accuracy, reliability, consistent intended performance, and the ability to discern invalid or altered records | **Shared** | The supplier develops under version control with automated tests and change control. Validation for *your* intended use is performed by you using this package. Invalid/altered records are discernible through the audit trail (§11.10(e)) and the version history in Document Control. |
| §11.10(b) | Ability to generate accurate and complete copies in human-readable and electronic form for inspection | **Product** | Every controlled record can be printed to a paginated A4 document with company header, status, identifier and approval history, or saved as PDF. Audit history is exportable to CSV. Verify in **OQ-16 TC-16-08**. |
| §11.10(c) | Protection of records to enable accurate and ready retrieval throughout the retention period | **Shared** | Records are retained in the hosted PostgreSQL database with supplier-managed backup; deletion through the application is a soft delete that retains the row and its audit history. Retention *period* and archival policy are yours to define. Obtain the supplier's backup, restore and retention commitments during supplier assessment and record them in the IQ. |
| §11.10(d) | Limiting system access to authorised individuals | **Product** | Authentication by password (policy-enforced) or SSO; optional TOTP multi-factor; per-tenant isolation; role-based permissions enforced in the application and, independently, by row-level security in the database. Verify in **OQ-16 TC-16-01 … 04**. |
| §11.10(e) | Secure, computer-generated, time-stamped audit trails recording operator entries and actions that create, modify or delete records; audit trail retained as long as the record and available for review and copying; record changes must not obscure previously recorded information | **Product** | Audit entries are written by database triggers, not by application code, so an action cannot bypass them. Each entry captures action, entity type and id, performer, UTC timestamp, originating IP, and field-level old and new values. Entries are not editable or deletable through the application. Previous values are preserved and displayed alongside the new value. Verify in **OQ-16 TC-16-05 … 07**. |
| §11.10(f) | Operational system checks to enforce permitted sequencing of steps and events | **Product** | Workflow instances enforce step order; a step activates only when its predecessor is satisfied. Lifecycle rules prevent out-of-sequence transitions — for example a document version cannot be made effective before approval, a CAPA cannot be closed while workflow steps remain open, and a nonconformance cannot be closed without disposition, notes and (where required) a linked CAPA. Verify in **OQ-01, OQ-03, OQ-04**. |
| §11.10(g) | Authority checks — only authorised individuals may use the system, sign records, access the operation or device, alter a record, or perform the operation | **Product** | Permissions are granted per module and action, evaluated on every request and again at the database through row-level security. Record-level rules further restrict actions to the owner or the assigned step user. Verify in **OQ-16 TC-16-03 … 04**. |
| §11.10(h) | Device checks to determine validity of the source of data input | **N/A / Shared** | Data is entered by authenticated users through the browser; there is no instrument interface in the base product. If you integrate an instrument or use the API for automated input, assess it separately. |
| §11.10(i) | Education, training and experience of persons who develop, maintain or use the system | **Procedural** | Yours. The Training module can hold and evidence the records; the obligation to define and deliver the training is yours. |
| §11.10(j) | Written policies holding individuals accountable for actions initiated under their electronic signatures | **Procedural** | Yours. An SOP asserting the legal equivalence and personal accountability of electronic signatures must exist and be acknowledged by users. The product cannot supply this. |
| §11.10(k) | Appropriate controls over systems documentation — distribution, access, revision control and audit trail of changes | **Shared** | For your own SOPs, Document Control provides this. For the supplier's own system documentation, obtain the supplier's change-control evidence during supplier assessment. |

## 4. Subpart B — Open systems (§11.30)

Not applicable while the system is operated as a closed system. If you enable external
participation — supplier portal users, external auditors — access remains authenticated
and tenant-scoped, so the system stays closed in the Part 11 sense. Confirm this
assessment against your own configuration and record the conclusion.

## 5. Subpart B — Signature manifestations and linking

| Clause | Requirement | Type | How it is met |
| --- | --- | --- | --- |
| §11.50(a)(1) | Signed record shows the printed name of the signer | **Product** | The signature record stores the signing user; the name is resolved and shown on screen and on printed copies. |
| §11.50(a)(2) | Date and time of signature | **Product** | A timezone-aware timestamp is recorded at signing (`signed_at`), independent of any user-supplied value. |
| §11.50(a)(3) | Meaning associated with the signature (review, approval, responsibility, authorship) | **Product** | Meaning is a mandatory field on every signature record and is captured from the action performed — for example approval of a workflow step, closure of a CAPA, closure of a nonconformance. |
| §11.50(b) | Those items are subject to the same controls as records and included on any human-readable copy | **Product** | Signature records live in the controlled database with their own audit trail, and appear in printed copies and the record's audit view. |
| §11.70 | Signature/record linking — signatures must be linked to their records so they cannot be excised, copied or transferred to falsify | **Product** | Each signature is stored with a foreign key to exactly one subject record (enforced by a database check constraint) and with a cryptographic hash of the signed payload, so a signature cannot be re-pointed at a different record and content changes are detectable. Deletion of a signed record is refused at the database level while the signature exists. Verify in **OQ-16 TC-16-09**. |

## 6. Subpart C — Electronic signatures

| Clause | Requirement | Type | How it is met |
| --- | --- | --- | --- |
| §11.100(a) | Each signature is unique to one individual and not reused or reassigned | **Shared** | Accounts are individual, and the email address is unique platform-wide. **You must prohibit shared or generic accounts by procedure** and never reassign a leaver's account to another person. |
| §11.100(b) | The organisation verifies the identity of the individual before establishing their signature | **Procedural** | Yours, entirely. Verify identity before inviting a user or issuing a signing PIN, and retain that evidence. |
| §11.100(c) | Certification to FDA that electronic signatures are the legally binding equivalent of handwritten signatures | **Procedural** | Yours. A signed letter must be submitted to FDA (Office of Regional Operations) before or at first use of electronic signatures. Frequently overlooked — check it has been done. |
| §11.200(a)(1) | Non-biometric signatures employ at least two distinct identification components; both used at first signing of a session, at least one at subsequent signings within a continuous session | **Product** | Signing requires an authenticated session (established with user ID plus password or SSO) **and** re-authentication at the point of signing with a distinct credential — a dedicated e-signature PIN, the account password, or a re-verified SSO identity. The PIN is a separate credential from the login password and is subject to failed-attempt lockout. **Confirm your configured method meets your interpretation of "two distinct components" and record it.** Verify in **OQ-16 TC-16-10 … 11**. |
| §11.200(a)(2) | Used only by their genuine owners | **Shared** | The product requires a credential known only to the signer. Non-transfer is a procedural commitment you must obtain from users (§11.10(j)). |
| §11.200(a)(3) | Administered so attempted use by anyone else requires collaboration of two or more individuals | **Shared** | PIN reset is delivered as a one-time link to the account owner's registered email; administrators cannot read an existing PIN. Combine with your access-administration SOP. |
| §11.300(a) | Uniqueness of each combined identification code and password | **Product** | Email addresses are unique platform-wide; passwords are stored only as one-way hashes. |
| §11.300(b) | Periodic checking, recall or revision of codes and passwords | **Product** | Configurable password expiry (default 90 days), reuse history (default 5 previous passwords), and forced change at first login. |
| §11.300(c) | Loss-management procedures to deauthorise lost/stolen/compromised credentials and issue temporary replacements under suitable controls | **Shared** | The product provides password reset, e-signature PIN reset by one-time emailed link, session revocation, and user deactivation. The procedure governing their use is yours. |
| §11.300(d) | Transaction safeguards to prevent unauthorised use and detect/report attempts to the security unit | **Product** | Failed-attempt lockout (default 5 attempts, 15-minute lock) on both login and e-signature PIN; idle and absolute session timeouts (defaults 30 minutes and 12 hours); optional TOTP multi-factor with recovery codes; authentication and access events recorded in the audit trail. **Configure who monitors these events.** |
| §11.300(e) | Initial and periodic testing of devices bearing/generating codes | **N/A** | No tokens or cards are issued by the product. If you deploy hardware authenticators through your identity provider, assess them there. |

## 7. EU GMP Annex 11 cross-reference

| Annex 11 clause | Topic | Type | Notes |
| --- | --- | --- | --- |
| §1 | Risk management | **Procedural** | Documented in the [VMP](/validation/framework/validation-master-plan) §5. |
| §2 | Personnel | **Procedural** | Define roles and competence; evidence in Training. |
| §3 | Suppliers and service providers | **Procedural** | Formal supplier assessment of Qability, retained. |
| §4 | Validation | **Shared** | This package; executed by you. |
| §4.8 | Data migration | **Procedural** | If migrating legacy documents or records, qualify the migration: define the mapping, verify a sample, reconcile counts. Bulk Document Import is a migration tool and its use must be qualified — see [OQ-01](/validation/oq/document-control). |
| §5 | Data — checks on critical data entered manually | **Shared** | Required fields and lifecycle gates are enforced; a *second-person* check on critical data entry is configured by you via workflow approval steps. |
| §6 | Accuracy checks | **Shared** | Configure approval steps where accuracy is critical. |
| §7 | Data storage — protection, backup, integrity checks | **Shared** | Supplier-hosted; obtain and record backup, restore-test and retention evidence in the IQ. |
| §8 | Printouts — clear printed copies, indication of altered data | **Product** | Printed copies carry status, identifier, approval and print provenance; non-effective versions are marked as not for controlled use. |
| §9 | Audit trails | **Product** | See §11.10(e) above. Annex 11 additionally expects audit trails to be **regularly reviewed** — that review is procedural and yours. |
| §10 | Change and configuration management | **Shared** | Supplier release notes plus your change control. |
| §11 | Periodic evaluation | **Procedural** | Set the interval in the VMP §9. |
| §12 | Security — physical and logical | **Shared** | Product controls per §11.10(d); physical security is the supplier's, evidenced in supplier assessment. |
| §13 | Incident management | **Procedural** | Your SOP; supplier incident notification terms should be in the contract. |
| §14 | Electronic signature | **Product** | See §6 above. |
| §15 | Batch release | **[Assess]** | Only if the system is used for certification/release. |
| §16 | Business continuity | **Shared** | Supplier RTO/RPO commitments plus your own continuity plan for periods of unavailability. |
| §17 | Archiving | **Shared** | Define retention and archival; confirm readability of archived data over the retention period. |

## 8. Procedural controls you must have in place before go-live

This is the actionable summary. Every item is one the product cannot provide.

| # | Procedural control | Owner | SOP ref | Status |
| --- | --- | --- | --- | --- |
| 1 | Policy asserting electronic signatures are legally binding, with user acknowledgement | QA |  |  |
| 2 | FDA §11.100(c) certification letter submitted **[if US-regulated]** | QA |  |  |
| 3 | Identity verification before account and signing-credential issue | HR / IT |  |  |
| 4 | Prohibition of shared, generic or reassigned accounts | IT |  |  |
| 5 | Access provisioning, periodic access review, and prompt deprovisioning of leavers | IT |  |  |
| 6 | Credential loss / compromise handling | IT |  |  |
| 7 | Periodic audit-trail review (Annex 11 §9) — scope, frequency, who reviews | QA |  |  |
| 8 | Training on the system and on Part 11 responsibilities | Training |  |  |
| 9 | Change control covering both supplier releases and your own configuration changes | QA |  |  |
| 10 | Record retention and archival, including what happens at contract termination | QA |  |  |
| 11 | Business continuity for periods of system unavailability | Operations |  |  |
| 12 | Governance of AI-assisted drafting — human review and approval before any generated content enters a controlled record | QA |  |  |
| 13 | Backup/restore assurance obtained from the supplier and periodically re-confirmed | IT |  |  |

## 9. Known limitations and points to confirm

Stated plainly, because an assessment that lists only strengths is not useful:

- **Audit-trail integrity depends on database access control.** Entries are written by
  database triggers and cannot be altered through the application, but a party with
  direct privileged database access could in principle alter them. That access is
  controlled by the supplier. Cover it in supplier assessment — ask specifically about
  privileged-access management, segregation of duties, and logging of administrative
  database access.
- **Audit-trail review is not automated.** The product provides filtering and CSV export;
  it does not decide what should be reviewed or flag anomalies for you. Annex 11 §9
  expects a defined review — that is procedural.
- **Retention and legal hold are policy, not a product feature.** Deletion through the
  application is a soft delete, so data is recoverable, but there is no automated
  retention-period enforcement or legal-hold flag. Define retention procedurally.
- **The e-signature "two components" position needs your written interpretation.** The
  product re-authenticates at signing with a credential distinct from the session. Record
  your rationale for why that satisfies §11.200(a)(1) in your configuration.
- **Time source.** Timestamps are server-generated and timezone-aware. Confirm the
  supplier's NTP synchronisation during supplier assessment if accurate sequencing across
  systems matters to you.
- **AI features generate content.** Their output must be reviewed and approved by a
  qualified person before it enters a controlled record. The validated control is that
  review step. Do not treat generated content as verified.

## Related

- [OQ-16 Security, Access & Electronic Records](/validation/oq/security-and-electronic-records) — the protocol that tests these controls
- [Validation Master Plan](/validation/framework/validation-master-plan)
- [Installation Qualification](/validation/framework/installation-qualification)
