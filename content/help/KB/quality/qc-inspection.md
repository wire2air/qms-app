---
id: qc-inspection
title: QC Inspection
sidebar_position: 6
description: Set up specifications, sampling plans and inspection plans, then run incoming, in-process, final and outgoing inspections with sampling, results capture and QA disposition.
keywords: [qc inspection, quality control, IQC, IPQC, FQC, OQC, specification, sampling plan, AQL, inspection lot, disposition, test library, inspection plan]
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

| Tab | Purpose | Who typically uses it |
| --- | --- | --- |
| **Test Library** | A reusable master list of individual tests (pH, Appearance, Net Weight…). Define a test once and reuse it across many specifications. | QA Manager |
| **Specifications** | The **acceptance criteria** — the list of tests plus their target/limits for a given item, item group, or item type. "What good looks like." | QA Manager |
| **Sampling Plans** | **How many** units to inspect for a lot size, and how many defects are allowed (AQL). | QA Manager |
| **AQL Standards** | The published sampling tables (e.g. ANSI/ASQ Z1.4) that sampling plans draw their numbers from. | QA Manager |
| **Inspection Plans** | Binds a **disposition approval workflow** to a scope + inspection point, so a completed lot routes to the right approver. | QA Manager |
| **Inspection Lots** | The actual inspection record: pick an item + inspection point, capture results, and record a disposition. | QA team |

### How the pieces fit together

Everything is keyed off **scope** and **inspection point**, so the right requirements attach to a lot automatically.

- **Scope** answers *"what does this apply to?"* and can be one of three levels, from most to least specific:
  - **Item** — a single SKU.
  - **Item Group** — a family of related SKUs (e.g. all "Caps"). *Set up one spec/plan for the whole group instead of one per SKU.*
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

Library tests are templates: when you build a specification you can **Add from library** to pre-fill tests instead of typing them again. *Acceptance limits (target/LSL/USL/UOM) are not stored in the library — they belong to each specification, because they differ per item.*

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
   - **AQL standard** — reference an **AQL Standard** (Step 3a) and set the inspection level and the AQL per defect class (Critical / Major / Minor).
   - **Custom table** — enter your own sample-size / accept / reject rows.
4. Save, then **Approve** the plan. Only **Active** sampling plans are used for inspection.

#### Step 3a — AQL Standards

If you use AQL-based plans, the **AQL Standards** tab holds the published tables (e.g. ANSI/ASQ Z1.4) your plans reference. You normally set these up once; sampling plans then point at them.

### Step 4 — Create an Inspection Plan

An inspection plan routes a completed lot to the right approver.

1. Go to **QC Inspection → Inspection Plans → New Inspection Plan**.
2. Choose the **Inspection point** and **Scope**.
3. Select the **disposition approval workflow** (who reviews and approves the disposition) and, if you use them, the notification groups to email on pass/fail.

Disposition notifications live on the inspection plan only — the person entering a lot doesn't set them.

## Running an inspection (QA team)

Day-to-day, the QA team works entirely in the **Inspection Lots** tab.

1. Go to **QC Inspection → Inspection Lots → New Inspection Lot**.
2. Select the **Item**, the **Inspection point**, and enter the **lot quantity** (plus any reference fields — supplier, PO, batch…).
3. The system automatically **matches** the Specification and Sampling Plan for that item + point, narrow → broad:
   - **One match** — shown read-only, with the level it matched by (e.g. "matched by Item Group").
   - **Several matches** — pick the correct one from the list.
   - **No match** — you'll see an error and **cannot proceed**. That means no *effective* specification or *active* sampling plan covers this item yet — ask a QA Manager to create/approve one.
4. Create the lot. The system computes the **sample size** from the sampling plan and the quantity.
5. **Capture results** for each characteristic (and log any defects). Instruments requiring calibration are checked at capture.
6. When results are complete, **Submit for QA Disposition**. The lot routes through the disposition workflow from the matching inspection plan.
7. The reviewer records a single **Disposition** (Release, Rework, Scrap, Use-as-is…). An adverse disposition can automatically raise a **Nonconformance**.

## Roles — who does what

QC Inspection separates **setup** from **execution** so day-to-day inspectors aren't changing quality requirements:

- **QA Manager (setup)** — creates and approves the Test Library, Specifications, Sampling Plans, AQL Standards and Inspection Plans. These require the corresponding "manage/write" permissions.
- **QA team (execution)** — creates inspection lots, captures results, and (where permitted) records dispositions. They generally only need access to the **Inspection Lots** tab.

If your inspectors can see or change the setup tabs when they shouldn't, review the QC-related permissions on their role under **Settings → Roles & Permissions**.

## Tips

- Prefer scoping specs and sampling plans to an **Item Group** where you can — one setup covers every SKU in the group, and new SKUs added to the group are covered automatically.
- Keep the **Test Library** current so building specifications is mostly picking, not typing.
- A lot can't be created without a matching effective spec **and** active sampling plan — that guardrail is intentional, so nothing is inspected against undefined criteria.
