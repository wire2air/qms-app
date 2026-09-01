---
id: qc-inspection
title: QC Inspection
sidebar_position: 6
description: Set up specifications, sampling plans and inspection plans, then run incoming, in-process, final and outgoing inspections with sampling, results capture and QA disposition.
keywords:
  [
    qc inspection,
    quality control,
    IQC,
    IPQC,
    FQC,
    OQC,
    specification,
    sampling plan,
    AQL,
    inspection lot,
    disposition,
    test library,
    inspection plan,
  ]
---

# QC Inspection

## Overview

QC Inspection is where your quality team defines **what to check**, **how many to check**, and then **records the results** of checking incoming, in-process, final and outgoing goods. It brings four inspection points together in one place:

- **Incoming (IQC)** — inspect received materials and components before they enter production.
- **In-process (IPQC)** — inspect work at defined stages during production.
- **Final (FQC)** — inspect finished goods before release.
- **Outgoing (OQC)** — inspect goods before they ship.

The module has two halves that work together:

1. **Setup** (done ahead of time, usually by a QA Manager): the **Test Library**, **Specifications**, **Sampling Plans**, **AQL Standards** and **Inspection Plans** that describe your quality requirements.
2. **Execution** (done day-to-day by the QA team): **Inspection Lots** — creating a lot, capturing results, and recording a disposition.

You'll find QC Inspection in the sidebar. The page header shows a test-tube icon and the title "QC Inspection," with tabs across the top.

## The tabs and how they link

QC Inspection is organized into six tabs. The first five are **setup**; the last one — Inspection Lots — is where the day-to-day work happens.

| Tab                  | Purpose                                                                                                                                      | Who typically uses it |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Test Library**     | A reusable master list of individual tests (pH, Appearance, Net Weight…). Define a test once and reuse it across many specifications.        | QA Manager            |
| **Specifications**   | The **acceptance criteria** — the list of tests plus their target/limits for a given item, item group, or item type. "What good looks like." | QA Manager            |
| **Sampling Plans**   | **How many** units to inspect for a lot size, and how many defects are allowed (AQL).                                                        | QA Manager            |
| **AQL Standards**    | The published sampling tables (e.g. ANSI/ASQ Z1.4) that sampling plans draw their numbers from.                                              | QA Manager            |
| **Inspection Plans** | Binds a **disposition approval workflow** to a scope + inspection point, so a completed lot routes to the right approver.                    | QA Manager            |
| **Inspection Lots**  | The actual inspection record: pick an item + inspection point, capture results, and record a disposition.                                    | QA team               |

### How the pieces fit together

Everything is keyed off **scope** and **inspection point**, so the right requirements attach to a lot automatically.

- **Scope** answers _"what does this apply to?"_ and can be one of three levels, from most to least specific:
  - **Item** — a single SKU.
  - **Item Group** — a family of related SKUs (e.g. all "Caps"). _Set up one spec/plan for the whole group instead of one per SKU._
  - **Item Type** — a broad category (Finished Good, Component…).
- **Inspection point** — Incoming, In-process, Final or Outgoing.

When a lot is created, the system resolves each requirement **narrow → broad**: it looks for an Item-level match first, then Item Group, then Item Type. The most specific match wins.

```
Test Library ──┐
               ├──►  Specification  (what to test + limits)   ─┐
AQL Standard ──┴──►  Sampling Plan  (how many to inspect)     ─┼──►  Inspection Lot
                     Inspection Plan (disposition workflow)   ─┘     (the QA team's record)
```

## Setting it up (QA Manager)

Do these once per item / item group. Later changes create new versions rather than editing approved records.

### Step 1 — Build the Test Library (optional but recommended)

1. Go to **QC Inspection → Test Library**.
2. Add the individual tests you use often — give each a name, a test type (Numeric, Pass/Fail, Text), a default severity (defect class), and, if it needs a gauge, mark **Requires an instrument** and pick a preferred one.
3. Optionally restrict a test to certain **Item Groups** so it only appears where relevant.

Library tests are templates: when you build a specification you can **Add from library** to pre-fill tests instead of typing them again. _Acceptance limits (target/LSL/USL/UOM) are not stored in the library — they belong to each specification, because they differ per item._

### Step 2 — Create a Specification

A specification is the acceptance criteria for a scope.

1. Go to **QC Inspection → Specifications → New Specification** (or create one from an item's **Specifications** tab).
2. Choose the **Scope** — Item, Item Group, or Item Type — and select the target.
3. Add characteristics (tests). For each, set the test type and, for Numeric tests, the **Target / LSL / USL / UOM** (the acceptance range). Use **Add from library** to pull in common tests.
4. Save the draft, then click **Approve & make effective** (an e-signature may be required). Only **Effective** specifications are used for inspection; approving a new one supersedes the previous version for the same scope.

### Step 3 — Create a Sampling Plan

A sampling plan decides how many units to inspect and how many defects are acceptable.

1. Go to **QC Inspection → Sampling Plans → New**.
2. Choose the **Inspection point** and the **Scope** (Item / Item Group / Item Type).
3. Pick a **Plan type**:
   - **AQL standard** — reference an **AQL Standard** (Step 3a), pick an inspection level, and set one AQL per defect class (Critical / Major / Minor). At inspection time the lot size + level resolve a **code letter**, and the code letter + AQL give the sample size and accept/reject numbers. A **?** next to the Inspection level opens the code-letter table (Table 1) so you can see exactly how lot size × level picks the letter. AQL options carry a typical-pairing hint — **Critical ≈ 0.40–0.65 · Major ≈ 1.0–1.5 · Minor ≈ 2.5–4.0** (tighter AQL = fewer defects tolerated for the same sample).
   - **Custom table** — your own fixed plan: **one sample size for the whole inspection** (the custom analogue of the code letter's n) plus an accept/reject row per defect class. At inspection, logged defects are tallied per class against the matching row; reject when the tally reaches Re.
   - **√N + 1** — raw-material sampling. The sample size comes from the **container count**, not the unit quantity: for N containers received (drums, bags, boxes), open **⌈√N⌉ + 1** of them for identity/assay testing. AQL and defect-class accept/reject numbers do **not** apply — acceptance is the specification's lab tests. The dialog includes a live example calculator (25 containers → 6 samples).
4. Save, then **Approve** the plan. Only **Active** sampling plans are used for inspection.
5. **Preview any plan** from the Sampling Plans list by clicking its name — a read-only view shows the full configuration plus a live sample-size preview (enter a lot size, see the code letter, n and per-class Ac/Re).

#### Step 3a — AQL Standards

If you use AQL-based plans, the **AQL Standards** tab holds the published tables your plans reference. The global standards ship with the **complete canonical ANSI/ASQ Z1.4 / ISO 2859-1 master tables** — all 16 code letters (A–R), Normal / Tightened / Reduced, including the Ac=0 plans for tight AQLs and the arrow cells of the printed standard.

Reading the table viewer:

- Every AQL value carries its typical defect-class pairing chip (typ. Critical / Major / Minor).
- **Arrow cells** have no plan of their own — they point at a neighbouring code letter's plan ("larger sample" / "smaller sample"), exactly like the arrows in the printed standard. The system follows them automatically when computing a plan.
- **Ac / Re** — accept the lot at ≤ Ac defects of that class, reject at ≥ Re. Reduced-inspection plans can have a gap between Ac and Re: a count in the gap still accepts, but signals a return to Normal inspection.

Global standards are read-only. **Clone** one into a custom standard to edit cells for your company (filling an arrow cell's sample/Ac/Re replaces the arrow with an explicit plan).

### Step 4 — Create an Inspection Plan

An inspection plan routes a completed lot to the right approver.

1. Go to **QC Inspection → Inspection Plans → New Inspection Plan**.
2. Choose the **Inspection point** and **Scope**.
3. Select the **disposition approval workflow** (who reviews and approves the disposition) and, if you use them, the notification groups to email on pass/fail.

Disposition notifications live on the inspection plan only — the person entering a lot doesn't set them.

## Running an inspection (QA team)

Day-to-day, the QA team works entirely in the **Inspection Lots** tab.

1. Go to **QC Inspection → Inspection Lots → New Inspection Lot**.
2. Select the **Item**, the **Inspection point**, and enter the **lot quantity** with its **UOM** (kg, L, pieces… — defaulted from the item's unit of measure, adjustable per lot), plus any reference fields — supplier, PO, batch….
3. Choose the **Sampling** source:
   - **Sampling plan** (default) — the system **matches** the Specification and Sampling Plan for that item + point, narrow → broad: one match is shown read-only ("matched by Item Group"), several matches let you pick, and no match blocks that mode until a QA Manager approves one.
   - **Custom table** — declare a fixed plan inline for **this lot only** (one sample size + accept/reject per defect class). No approved sampling plan is required — this is the escape hatch when nothing matches yet.
4. If the matched plan is a **√N + 1** plan, enter the **Containers received (N)** — the field shows the computed sample live ("√N + 1 → sample 6 containers"). Formula lots express their sample basis in containers throughout: _sample 9 of 50 containers · 1,000 kg_.
5. Create the lot. The system computes the **sample size** from the sampling configuration.
6. **Capture results** for each characteristic (and log any defects). Instruments requiring calibration are checked at capture. Notes:
   - Numeric fields don't accept **negative values** unless the characteristic's own spec range goes below zero (e.g. freezer temperatures).
   - A **failed sample requires a comment** — the row's comment icon turns **red** until the reason is documented (Save is blocked without it), and entered comments show as a truncated preview on the row.
   - Use **Retain Sample** (in the header actions or the rail card) to keep a physical sample from the lot.
7. When results are complete, **Submit for QA Disposition**. The lot routes through the disposition workflow from the matching inspection plan. The reviewer sees a glanceable advisory:
   - **AQL / custom lots** — the _AQL Acceptance_ panel tallies defective units per class against the plan's Ac/Re and shows an advisory Accept / Reject.
   - **√N + 1 lots** — the _Lab Acceptance_ panel applies the raw-material rule: **all** captured results within specification → advisory Accept; **any** out-of-spec result → advisory Reject, with per-sample chips naming what failed. Advisory only — the disposition decision is the reviewer's.
8. The reviewer records a single **Disposition** (Release, Rework, Scrap, Use-as-is…). For an **adverse** disposition you can raise a **Nonconformance** in one click — the NC arrives pre-filled with the failure summary **and the full inspection report attached as a PDF** on its description, so the NC evidence stands alone.
9. A QA manager can **Reopen for re-inspection** (reason required, kept in the audit trail), re-picking the specification and sampling: an existing plan, an ad-hoc **Custom AQL**, or an ad-hoc **Custom table** — applied to that lot only.

## Recording results against a test

How results are captured depends on the inspection plan's **capture mode**.

| Mode       | You record                                       | Use it for                                               |
| ---------- | ------------------------------------------------ | -------------------------------------------------------- |
| **Lot**    | One result per characteristic for the whole lot. | Attribute checks and anything judged once for the batch. |
| **Sample** | A value per sampled unit, per characteristic.    | Variable data where each unit's reading matters.         |

### The sample grid

In Sample mode you get a classic inspection data sheet: **one row per sampled
unit**, **one column per characteristic**, with the specification shown in the
column header.

Enter a value in each cell. The cell evaluates itself against the spec limits as
you type — the same rule the system applies when it recalculates — and a footer
tallies pass and fail per characteristic, so a problem column is visible before
you finish.

Two things make an 80-unit lot bearable:

- **Fill ↓** copies the first row's value down a column, for the characteristics
  that read the same on every unit.
- **Paste a column** — copy a newline-separated column out of a gauge export or
  a spreadsheet and paste it into a cell; it fills consecutive rows from there.

You can attach a **comment or evidence** to an individual cell, which is where a
photo of the out-of-spec unit belongs.

### Acceptance

Acceptance is calculated for you rather than logged separately. Each
characteristic carries a **defect class** (Critical, Major, Minor) from the
specification; a sampled unit counts as one defective for a class if any of its
characteristics in that class fails.

Those counts are compared against the sampling plan's accept and reject numbers
per class, and the panel shows an **advisory** Accept or Reject.

:::note The verdict is advisory, and the disposition is yours
The system tells you what the sampling plan says. It does not dispose of the lot
for you.

That separation is deliberate: acceptance is arithmetic, disposition is a
decision — one that may weigh customer impact, a deviation already open, or
material you cannot replace in time. Record the disposition explicitly.
:::

## In-process inspection (IPQC)

In-process inspection works differently from receiving or final inspection: the
line is running, samples are pulled repeatedly over a shift, and who is watching
matters.

### Check in

An inspector **checks in** to take the inspection. Check-in captures who is
inspecting and the **shift**, and — for in-process — which **production lot** is
active. Samples then collect against that lot.

If someone else is already checked in, taking over is explicit, so the record
shows who was responsible at any point.

### Clear the line first

Collection is locked until the active production lot has a **passed line
clearance**. See below.

### Collect samples on a cadence

Rather than recording everything at once, you **collect** units off the line as
the run proceeds. Each collection appends the units to the lot, stamped
server-side with the time and the inspector, and tagged to the production lot
they came from.

The sampling plan can set a **collection interval**. When it does:

- The next collection's due time is calculated from the last one.
- **Collect stays locked until shortly before it is due**, so a shift cannot be
  front-loaded and called hourly sampling.
- A banner warns as the collection comes due, and again once it is overdue.

:::tip
Set the interval on the sampling plan, not as a reminder in someone's head. An
in-process record whose samples are all timestamped within ten minutes of each
other tells an auditor exactly what happened, and no explanation afterwards
improves it.
:::

### Changing production lot

A run can move to a new production lot mid-shift. Add it from the inspection,
and subsequent collections tag to it — a fresh line clearance applies to the new
lot.

## Line clearance

Line clearance is the check that the line is genuinely ready: the previous
product cleared away, documentation correct, area sanitised.

It is a **hard gate** — a production lot cannot have samples collected against it
until its clearance has passed.

1. Open the line clearance for the active production lot.
2. Complete your company's clearance checklist. It is a configurable form, so it
   asks what your process actually requires.
3. Record the decision: **Release** to clear the line, or **Hold**.

A release unlocks collection for that lot. A hold leaves it locked.

:::note Why it gates rather than warns
A line clearance that only warned would be a form people fill in afterwards to
match what already happened.

Blocking collection means the clearance is done at the point it is meant to be
done — before product is sampled — and its timestamp is evidence rather than
paperwork.
:::

## Retain samples

Retain samples are the physical units you keep back from a batch so you can go
back to the material later — a customer complaint, a stability question, a
regulator asking what actually shipped.

### Creating one

Create a retain from the inspection lot. The item, lot number, batch and the
manufacturing and expiry dates carry across automatically, so you are only
recording what is specific to the sample:

- **Sample type** — Reserve, Reference, and your other configured types.
- **Quantity** retained.
- **Storage** location and conditions.
- **Retain until** — defaulted for you from the expiry date where one is known,
  and overridable when your policy differs.

### Labelling

**Print Label** produces the physical label for the container, so what is on the
shelf can be matched back to its record rather than relying on handwriting.

### Chain of custody

Every movement is recorded as a custody event, so the sample's history is
continuous from creation to disposal. That continuity is the point: a retain
sample with a gap in its custody proves nothing.

### Disposal

Disposal is a deliberate, separate action, e-signed with your **PIN**. The
identity is verified before the disposal is recorded, so the destruction of a
retained sample carries an attributable signature.

:::warning
Check the retain-until date and any open investigation before disposing. A retain
sample is the only physical evidence of what a batch actually was — once
destroyed, questions about that batch can no longer be answered from the material.
:::

## Roles — who does what

QC Inspection separates **setup** from **execution** so day-to-day inspectors aren't changing quality requirements:

- **QA Manager (setup)** — creates and approves the Test Library, Specifications, Sampling Plans, AQL Standards and Inspection Plans. These require the corresponding "manage/write" permissions.
- **QA team (execution)** — creates inspection lots, captures results, and (where permitted) records dispositions. They generally only need access to the **Inspection Lots** tab.

If your inspectors can see or change the setup tabs when they shouldn't, review the QC-related permissions on their role under **Settings → Roles & Permissions**.

## Tips

- Prefer scoping specs and sampling plans to an **Item Group** where you can — one setup covers every SKU in the group, and new SKUs added to the group are covered automatically.
- Keep the **Test Library** current so building specifications is mostly picking, not typing.
- A lot can't be created without a matching effective spec **and** active sampling plan — that guardrail is intentional, so nothing is inspected against undefined criteria.
