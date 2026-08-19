---
id: installation-qualification
title: Installation Qualification (IQ)
sidebar_position: 4
description: Executable IQ protocol confirming the Qability QMS tenant, its configuration, access controls and supporting arrangements are established and documented as specified.
keywords: [IQ, installation qualification, environment, tenant, configuration, baseline, SaaS]
---

# Installation Qualification — Qability QMS

**Document ID:** VAL-IQ-001 · **Version:** 1.0

| Role | Name | Title | Signature | Date |
| --- | --- | --- | --- | --- |
| Protocol prepared by |  |  |  |  |
| Protocol approved by (QA) |  |  |  |  |
| Executed by |  |  |  |  |
| Execution reviewed by |  |  |  |  |

**Execution start:** ________________  **Execution end:** ________________

## 1. Purpose

To document that the Qability QMS tenant used by **[Company]** is provisioned,
configured, and supported as specified, and to establish the **configuration baseline**
against which future changes are assessed.

## 2. Scope and approach

Qability QMS is delivered as a hosted service. There is no customer-installed software,
so this IQ does not verify installation media, file checksums or server builds. It
verifies what a customer *can* verify and *must* control:

- the environment and the exact version under test;
- the tenant's configuration baseline;
- access-control setup;
- supporting arrangements — backup, support, incident notification — which are
  contractual rather than testable, and are therefore **documented** here rather than
  executed.

Server-side infrastructure qualification is the supplier's responsibility and is covered
by supplier assessment, not by this protocol. Reference that assessment in §4.

## 3. Prerequisites

| # | Prerequisite | Confirmed (init/date) |
| --- | --- | --- |
| 1 | This protocol is approved before execution begins |  |
| 2 | Supplier assessment complete and accepted |  |
| 3 | Tenant provisioned and reachable |  |
| 4 | An administrator account is available to the executor |  |

## 4. Section 1 — Environment and version baseline

Record the facts. Attach screenshots as objective evidence.

| # | Item to record | Recorded value | Init / Date |
| --- | --- | --- | --- |
| 1.1 | Tenant URL |  |  |
| 1.2 | Environment (production / validation / sandbox) |  |  |
| 1.3 | Application version under test |  |  |
| 1.4 | Date version was deployed to this tenant |  |  |
| 1.5 | Hosting region / data residency |  |  |
| 1.6 | Supplier assessment reference and date |  |  |
| 1.7 | Contract / SLA reference (availability, support, incident notification) |  |  |
| 1.8 | Documented backup frequency and retention |  |  |
| 1.9 | Documented recovery objectives (RTO / RPO) |  |  |
| 1.10 | Date of last supplier restore test, if available |  |  |

> Items 1.8 – 1.10 are supplier commitments. If the supplier cannot evidence them,
> record that as a finding and address it through supplier management — do not mark the
> row "pass" on the strength of a verbal assurance.

## 5. Section 2 — Access and transport security

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Browse to the tenant URL | The application loads over HTTPS; the certificate is valid, in date, and issued to the expected host |  |  |  |
| 2.2 | Attempt to reach the tenant over plain HTTP | The request is redirected to HTTPS, or refused |  |  |  |
| 2.3 | Browse to the tenant URL while signed out and request a record URL directly | Access is refused and the browser is redirected to sign-in — the record is not rendered |  |  |  |
| 2.4 | Sign in with a valid administrator account | Sign-in succeeds and the workspace loads |  |  |  |
| 2.5 | Sign in with a deliberately incorrect password | Sign-in is refused; the message does not reveal whether the account exists |  |  |  |
| 2.6 | Record the browsers and versions the organisation will support, and confirm the application loads and is usable in each | Application functions in each supported browser |  |  |  |

## 6. Section 3 — Configuration baseline

Record the configuration as established. This table **is** the baseline: any later change
to these values is a change to the validated system and must go through change control.

| # | Configuration item | Recorded value / count | Init / Date |
| --- | --- | --- | --- |
| 3.1 | Company name and code |  |  |
| 3.2 | Sites defined (count and list, or attachment) |  |  |
| 3.3 | Departments defined (count) |  |  |
| 3.4 | Roles defined (count and list) |  |  |
| 3.5 | Users provisioned (count); administrators named |  |  |
| 3.6 | Document types and numbering prefixes |  |  |
| 3.7 | Workflow templates published, with version numbers |  |  |
| 3.8 | Form templates published |  |  |
| 3.9 | Lookup / option sets configured (NC types, dispositions, CAPA sources, severities, …) |  |  |
| 3.10 | Modules enabled for the tenant |  |  |
| 3.11 | Notification rules configured |  |  |
| 3.12 | Automation rules configured |  |  |
| 3.13 | Custom fields defined |  |  |

> Attach exports or screenshots rather than transcribing long lists. Reference the
> attachment number in the cell.

## 7. Section 4 — Security configuration

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Open the password policy settings and record every value: minimum length, complexity requirements, minimum strength, history depth, expiry days, force-change-on-first-login, breached-password blocking | Values recorded and match the organisation's security standard |  |  |  |
| 4.2 | Record the lockout configuration: maximum failed attempts and lockout duration | Values recorded and match the security standard |  |  |  |
| 4.3 | Record the session configuration: idle timeout, absolute timeout, remember-me policy | Values recorded and match the security standard |  |  |  |
| 4.4 | Record the multi-factor configuration: mode (optional / required), permitted factors, grace period, whether it applies to SSO sign-in, trusted-device duration | Values recorded; where MFA is not mandatory, the decision is justified in writing |  |  |  |
| 4.5 | Record whether SSO is configured, and with which identity provider | Recorded |  |  |  |
| 4.6 | Record any allowed email-domain restriction | Recorded |  |  |  |
| 4.7 | Confirm the e-signature method the organisation will use (PIN, password, or SSO re-verification) and that it is available to users | Method confirmed and recorded; matches the position taken in the Part 11 assessment §6 |  |  |  |

## 8. Section 5 — Supporting services

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 5.1 | Invite a test user and confirm the invitation email is received | Email is delivered to the intended recipient within the expected time, from the expected sender |  |  |  |
| 5.2 | Trigger a task assignment to a test user | Notification is delivered and links back to the correct record |  |  |  |
| 5.3 | Confirm the system time shown on a newly created record matches the actual time in the recorded timezone | Timestamp is correct; timezone is as configured |  |  |  |
| 5.4 | Where the API is used, confirm an API key can be issued and is scoped to this tenant only | Key issued; access limited to the tenant |  |  |  |
| 5.5 | Where SSO is configured, sign in via the identity provider with a test account | Sign-in succeeds and maps to the correct user |  |  |  |

## 9. Section 6 — Tenant isolation

Data segregation is a foundational control in a multi-tenant service. Test it, do not
assume it.

| # | Test step | Expected result | Actual result | P/F | Init / Date |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Signed in as a tenant user, list records in any module | Only records belonging to this tenant are returned |  |  |  |
| 6.2 | Attempt to open a record URL using an identifier that does not belong to this tenant (for example a fabricated UUID) | Access is refused or the record is reported as not found — no data from another tenant is exposed |  |  |  |
| 6.3 | Review the audit log | Only this tenant's activity is present |  |  |  |

## 10. Deviation log

| # | Step ref | Description of deviation | Impact assessment | Disposition | Retest result | Closed by / Date |
| --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |
| 2 |  |  |  |  |  |  |
| 3 |  |  |  |  |  |  |

## 11. Execution summary

| Section | Steps executed | Passed | Failed | Deviations raised |
| --- | --- | --- | --- | --- |
| 2 — Access and transport security |  |  |  |  |
| 3 — Configuration baseline |  |  |  |  |
| 4 — Security configuration |  |  |  |  |
| 5 — Supporting services |  |  |  |  |
| 6 — Tenant isolation |  |  |  |  |

**Overall IQ result:** ☐ Pass ☐ Pass with deviations (all closed) ☐ Fail

**Comments:**

<br /><br /><br />

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executed by |  |  |  |
| Reviewed by (independent of execution) |  |  |  |
| Approved by (QA) |  |  |  |

## Related

- [Validation Master Plan](/validation/framework/validation-master-plan)
- [21 CFR Part 11 / Annex 11 Assessment](/validation/framework/part-11-assessment)
- [OQ-16 Security, Access & Electronic Records](/validation/oq/security-and-electronic-records)
