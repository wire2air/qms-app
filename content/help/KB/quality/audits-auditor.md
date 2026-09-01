---
id: audits-auditor
title: 'Audits — Auditor'
sidebar_position: 7
description: Run internal and supplier audits — plan them, walk the requirements, record findings, and close out.
keywords:
  [audit, internal audit, supplier audit, auditor, findings, OFI, audit plan, calendar, standards]
---

# Audits — Auditor

> Basics only for now — this article grows as the module does.

## Auditor vs Auditee — which one am I?

The Audits menu has two working modules, one per role:

- **Auditor** — _you_ are running the audit: internal audits of your own
  processes, or supplier audits of a vendor. You work from a standard's
  requirements, ask the questions, record results and raise findings.
- **Auditee** — _you_ are being audited by an outside body (ISO registrar,
  FDA, a customer). You don't walk requirements — you track the auditor's
  agenda, reports, findings and the certificate. See
  [Audits — Auditee](./audits-auditee).

## What's in the Auditor module

- **Insights** — conformance trends, findings by standard, audit throughput.
- **Audits** — every internal and supplier audit: scheduled, in progress and
  closed. Open one to work it.
- **Audit Plan** — recurring audit programs and the schedule they generate.
- **Calendar** (own menu entry) — every audit on one year grid, including
  certification audits in violet.
- **Audit Readiness** (own menu entry) — a dashboard of how prepared you are
  before an audit arrives: coverage, outstanding findings, and what still needs
  attention.
- **Reports** — the audit report, generated from what you recorded during the
  audit rather than rewritten afterwards. AI can extract findings from your notes
  as a starting point for you to review and correct.
- **Standards** (own menu entry) — the clause libraries audits run against.
  Import your licensed copy or author your own checklist; AI enrichment can
  draft the auditor guide (questions, observations, expected evidence,
  people to interview) per clause.

## What to set up first

The sub-menus are in roughly the order you use them, and each step is usable
before the next exists.

### Step 1 — Standards

An audit runs **against** something. Load the clause library you audit to —
import your licensed copy of a standard, or author your own checklist.

AI enrichment can draft the auditor guide per clause: the questions to ask, what
to observe, the evidence to expect, who to interview. Review it before you rely
on it; it is a starting point, not a finished checklist.

### Step 2 — Audit Plan (optional)

If you audit on a cycle — internal audits quarterly, suppliers annually — set up
a **program** and let it generate the schedule. Skip this for one-off audits and
create them directly.

### Step 3 — The audit itself

Create it, pick the standard, site, lead auditor and team. Work the
**Requirements** notebook clause by clause during fieldwork.

### Step 4 — Findings and follow-up

Findings raised during the audit become CAPAs where corrective action is needed,
linked back to the finding so the chain from observation to closure is intact.

### Step 5 — The report

Generate the report from what you recorded, rather than rewriting it afterwards.

:::tip
Load the standard properly before your first audit. Everything downstream — the
notebook, the findings, the report, the readiness dashboard — hangs off the
clause library, and a thin one makes all of them thin.
:::

## Running an audit, in short

1. Create the audit (ad hoc from **Audits**, or let a program schedule it),
   pick the standard, site, lead auditor and team.
2. **Start** it and work the **Requirements** notebook clause by clause:
   the questions are your interview aid — take notes; observations and
   expected evidence have their own checklists.
3. Record each clause's **Result** — that one verdict is where
   nonconformities and OFIs come from. Findings can spawn CAPAs, and CAPA
   closure feeds finding closure.
4. When every finding is closed and every clause answered, **Submit for
   Close-Out** — the approval workflow signs the audit off.

## Audit status, and where it is up to

An audit carries the same four statuses as every other record — Draft, Open,
Closed, Cancelled — with **where in the audit you are** kept separately as its
execution phase (planning, fieldwork, reporting, and so on).

They are two different questions. "Is this audit still open?" is what reporting
asks across the whole system; "has fieldwork finished?" is what the audit team
asks. Keeping them apart means neither answer has to be reconstructed from the
other.

## External auditors

An external auditor can be recorded as a contact on the audit without being given
a user account, so third-party and certification audits are attributable to a
named person without provisioning access they do not need.

## AI in this module

AI **enriches a standard's clauses** with an auditor guide — questions to ask,
what to observe, expected evidence, who to interview. It can **import a standard
from a PDF** and draft the checklist shell. During reporting it can **extract
findings** from the notes you took, as a first pass for you to correct.

The assistant reads; it does not act. It can find, summarise and draft — it
cannot create, edit, approve or close a record. Anything it produces is a
starting point you review and apply yourself, and the normal permission checks
run when you save it.

It can only reach modules you already have read access to.

→ [AI Assistant](../ai/ai-assistant.md) · [AI Access and Usage](../ai/ai-access-and-usage.md)
