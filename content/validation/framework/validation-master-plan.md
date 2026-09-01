---
id: validation-master-plan
title: Validation Master Plan
sidebar_position: 2
description: Template Validation Master Plan for Qability QMS — scope, risk-based approach, roles, deliverables, acceptance criteria and change control.
keywords: [VMP, validation master plan, GAMP 5, risk assessment, scope, acceptance criteria, CSV]
---

# Validation Master Plan — Qability QMS

**Document ID:** VAL-VMP-001 · **Version:** 1.0 · **Status:** Template for customer tailoring

> Replace every **[bracketed]** placeholder with your own detail, delete what does not
> apply, and route the result through your document control before execution.

| Role                            | Name | Title | Signature | Date |
| ------------------------------- | ---- | ----- | --------- | ---- |
| Prepared by                     |      |       |           |      |
| Reviewed by (System Owner)      |      |       |           |      |
| Reviewed by (IT / Security)     |      |       |           |      |
| Approved by (Quality Assurance) |      |       |           |      |

## 1. Purpose

This plan defines the approach, scope, responsibilities, deliverables and acceptance
criteria for validating **[Company]**'s implementation of Qability QMS, to demonstrate
that the system is fit for its intended use and complies with **[applicable regulations —
e.g. 21 CFR Part 11, 21 CFR 820, EU GMP Annex 11, ISO 13485:2016, ISO 9001:2015]**.

## 2. System description

| Attribute                | Detail                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System name              | Qability QMS                                                                                                                                                                  |
| Version under validation | **[e.g. 2026.8.0 — record the exact release]**                                                                                                                                |
| Supplier                 | Qability                                                                                                                                                                      |
| Deployment model         | Multi-tenant SaaS **[or: dedicated / on-premise]**                                                                                                                            |
| Tenant / URL             | **[https://company.qability.app]**                                                                                                                                            |
| Business owner           | **[name, title]**                                                                                                                                                             |
| System owner             | **[name, title]**                                                                                                                                                             |
| Intended use             | **[e.g. the electronic quality management system of record for document control, training, nonconformance, CAPA, change control, complaints, audit and supplier management]** |
| GxP impact               | **[Yes / No — with justification]**                                                                                                                                           |
| Records affected         | **[e.g. quality records retained under 21 CFR 820.180; electronic signatures under Part 11 subpart C]**                                                                       |

### 2.1 Architecture summary

Qability QMS is a browser-based application. Application services and the PostgreSQL
database are hosted by the supplier; user devices run only the web client. There is no
customer-installed component, so installation qualification concerns the tenant, its
configuration and its access controls rather than local software.

Record the specifics of your instance during
[IQ](/validation/framework/installation-qualification).

## 3. Regulatory and standards basis

| Reference                        | Relevance                                                   |
| -------------------------------- | ----------------------------------------------------------- |
| 21 CFR Part 11                   | Electronic records and electronic signatures                |
| 21 CFR 820.40 / 820.100 / 820.30 | Document control, CAPA, design controls **[if applicable]** |
| EU GMP Annex 11                  | Computerised systems **[if applicable]**                    |
| ISO 13485:2016 §4.1.6            | Validation of software used in the QMS **[if applicable]**  |
| ISO 9001:2015 §7.5               | Documented information                                      |
| GAMP 5, 2nd edition              | Risk-based approach; software category                      |

### 3.1 Software category

Qability QMS is assessed as **GAMP category 4 (configured product)**. Testing therefore
verifies configuration and the functions relied upon, rather than reviewing source code.
Where **[Company]** builds custom modules using the App Builder / form template features,
those configurations remain category 4 but require their own test coverage — see
[OQ-13 Forms & Workflows](/validation/oq/forms-and-workflows).

## 4. Scope

### 4.1 Modules in scope

Complete this table during planning. A module is in scope if a GxP decision depends on it.

| Module                                | Protocol                                                | In scope? | Risk        | Rationale                                                      |
| ------------------------------------- | ------------------------------------------------------- | --------- | ----------- | -------------------------------------------------------------- |
| Document Control                      | [OQ-01](/validation/oq/document-control)                | **[Y/N]** | **[H/M/L]** |                                                                |
| Training Management                   | [OQ-02](/validation/oq/training-management)             | **[Y/N]** | **[H/M/L]** |                                                                |
| Nonconformance                        | [OQ-03](/validation/oq/nonconformance)                  | **[Y/N]** | **[H/M/L]** |                                                                |
| CAPA                                  | [OQ-04](/validation/oq/capa)                            | **[Y/N]** | **[H/M/L]** |                                                                |
| Change Control                        | [OQ-05](/validation/oq/change-control)                  | **[Y/N]** | **[H/M/L]** |                                                                |
| Complaints                            | [OQ-06](/validation/oq/complaints)                      | **[Y/N]** | **[H/M/L]** |                                                                |
| Audit Management                      | [OQ-07](/validation/oq/audit-management)                | **[Y/N]** | **[H/M/L]** |                                                                |
| Risk Management                       | [OQ-08](/validation/oq/risk-management)                 | **[Y/N]** | **[H/M/L]** |                                                                |
| QC Inspection                         | [OQ-09](/validation/oq/qc-inspection)                   | **[Y/N]** | **[H/M/L]** |                                                                |
| Log Books                             | [OQ-10](/validation/oq/log-books)                       | **[Y/N]** | **[H/M/L]** |                                                                |
| Equipment & Calibration               | [OQ-11](/validation/oq/equipment-calibration)           | **[Y/N]** | **[H/M/L]** |                                                                |
| Supplier Management                   | [OQ-12](/validation/oq/supplier-management)             | **[Y/N]** | **[H/M/L]** |                                                                |
| Forms & Workflows                     | [OQ-13](/validation/oq/forms-and-workflows)             | **[Y/N]** | **[H/M/L]** |                                                                |
| Item Master                           | [OQ-14](/validation/oq/item-master)                     | **[Y/N]** | **[H/M/L]** |                                                                |
| Retain Samples                        | [OQ-15](/validation/oq/retain-samples)                  | **[Y/N]** | **[H/M/L]** |                                                                |
| Security, Access & Electronic Records | [OQ-16](/validation/oq/security-and-electronic-records) | **Y**     | **High**    | Part 11 controls underpin every other module — always in scope |

### 4.2 Out of scope

State explicitly, with justification. Typical exclusions:

- Supplier-side infrastructure qualification (covered by supplier assessment, not by
  **[Company]** testing).
- Browser and operating-system qualification (commercially available, standard use).
- Modules not licensed or not used — list them.
- **[Any AI-assisted drafting features, where output is reviewed and approved by a
  qualified person before use — state the control that makes this acceptable.]**

> **AI features need an explicit position.** Where the product can draft content
> (documents, workflows, forms, summaries), the validated control is the human review and
> approval step that follows, not the generation itself. Say so here, and make sure the
> reviewing SOP requires that review. Do not rely on generated content entering a
> controlled record without approval.

## 5. Risk assessment

Assess each in-scope function for impact on product quality, patient safety and data
integrity. Record: hazard, probability, detectability, resulting risk class, and the
control (system control, procedural control, or test coverage) that mitigates it.

| Function | Failure mode | Impact | Prob. | Detect. | Risk | Mitigation / test reference |
| -------- | ------------ | ------ | ----- | ------- | ---- | --------------------------- |
|          |              |        |       |         |      |                             |
|          |              |        |       |         |      |                             |
|          |              |        |       |         |      |                             |

Testing depth follows the risk class, per §3 of
[How to Use This Package](/validation/framework/how-to-use-this-package).

## 6. Roles and responsibilities

| Role                      | Responsibility                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| System Owner              | Owns the system and its validated state; approves protocols and the summary report.                 |
| Business Process Owner(s) | Define intended use and requirements; provide PQ scenarios; execute PQ.                             |
| Quality Assurance         | Approves the plan, protocols, deviations and the release decision; independent review of execution. |
| IT / Security             | Confirms access control, authentication, backup and restore arrangements.                           |
| Validation Lead           | Coordinates execution; maintains the traceability matrix; compiles the summary report.              |
| Tester(s)                 | Execute protocols and record objective evidence.                                                    |
| Supplier (Qability)       | Supplies specifications, protocol templates, release notes and supplier-assessment evidence.        |

Executors must not review their own execution. Name individuals in the protocol cover
sheets.

## 7. Deliverables

| Deliverable                            | Owner                  | Reference                                                      |
| -------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| Supplier assessment                    | QA                     | **[record]**                                                   |
| User Requirements Specification        | Business Process Owner | **[record]**                                                   |
| Validation Master Plan (this document) | Validation Lead        | VAL-VMP-001                                                    |
| Part 11 / Annex 11 assessment          | QA                     | [VAL-P11-001](/validation/framework/part-11-assessment)        |
| Installation Qualification             | IT                     | [VAL-IQ-001](/validation/framework/installation-qualification) |
| Operational Qualification protocols    | Validation Lead        | VAL-OQ-01 … 16                                                 |
| Performance Qualification              | Business Process Owner | [VAL-PQ-001](/validation/framework/performance-qualification)  |
| Requirements Traceability Matrix       | Validation Lead        | [VAL-RTM-001](/validation/framework/traceability-matrix)       |
| Deviation records                      | Validation Lead / QA   | per protocol                                                   |
| Validation Summary Report              | Validation Lead        | **[record]**                                                   |

## 8. Acceptance criteria

The system is accepted as validated when **all** of the following hold:

1. Every protocol in scope has been executed against the recorded system version, and
   signed by the tester and an independent reviewer.
2. Every test step has a recorded actual result.
3. All deviations are closed, with documented impact assessment and QA approval. Any
   deviation accepted without correction carries a written justification and, where
   needed, a procedural control.
4. Every requirement in the traceability matrix maps to at least one executed, passing
   test — or to a documented, approved exclusion.
5. Procedural controls identified in the Part 11 assessment are in place as approved SOPs,
   and affected users are trained.
6. The Validation Summary Report is approved by QA.

## 9. Maintaining the validated state

| Trigger                                                                     | Action                                                                                                                           |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Supplier release                                                            | Review release notes; assess impact against the traceability matrix; regression-test affected protocols; record the decision.    |
| Configuration change (workflow, document type, role, lookup, custom module) | Route through change control; retest the affected protocol.                                                                      |
| Change of intended use                                                      | Re-assess risk; extend scope; revalidate.                                                                                        |
| Periodic review                                                             | **[Annually]** — confirm the system operates as validated; review deviations, incidents, access rights and audit-trail sampling. |
| Security incident or data-integrity event                                   | Investigate under your incident SOP; assess validated-state impact.                                                              |

## 10. Deviation handling

Deviations are raised on the protocol's own deviation log, assessed for impact,
dispositioned, and closed with QA approval before the summary report is signed. See §5.3
of [How to Use This Package](/validation/framework/how-to-use-this-package).

## 11. Records retention

Validation records are retained for **[period — at least the life of the system plus your
record-retention period]** under **[SOP reference]**. Executed protocols are controlled
records.

## 12. Glossary

| Term   | Meaning                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| IQ     | Installation Qualification — the system is installed and configured as specified.                           |
| OQ     | Operational Qualification — the system functions as specified across its operating range.                   |
| PQ     | Performance Qualification — the system performs reliably for its intended use, with real users and data.    |
| URS    | User Requirements Specification.                                                                            |
| RTM    | Requirements Traceability Matrix.                                                                           |
| ALCOA+ | Attributable, Legible, Contemporaneous, Original, Accurate, plus Complete, Consistent, Enduring, Available. |
| GAMP 5 | ISPE guidance on a risk-based approach to compliant GxP computerised systems.                               |
