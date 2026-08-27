---
id: metric-definitions
title: Metric Definitions
sidebar_position: 1
description: What every analytics metric counts, which date decides the period a record falls into, and how scope, freshness and the difference between counts, rates and averages change the number you see.
keywords: [analytics, metrics, KPI, calculation, definition, scope, freshness, rollup, dashboard, reporting, overdue, on-time, backlog]
---

# Metric Definitions

## Overview

Every number on the **Analytics** page, on a module's **Insights** tab, in a saved dashboard,
in an exported report and inside an alert comes from the same central list of metric
definitions. There is one definition per metric, used by every surface, so the figure on
screen, the figure in the PDF and the figure that triggered an alert cannot quietly disagree
with each other.

Each tile carries a short note explaining its own calculation. **This page is the long
version** — the shared rules first, then what each metric counts, what it leaves out, which
date decides the period it lands in, and what to do about it.

> **Read the shared rules first.** Most disputes about an analytics number are not about the
> number. They are about *which date put a record in this month*, *whose records were
> counted*, and *whether the population was empty*. Those three things are explained once
> below and then assumed throughout.

> **Four metrics are currently under revision.** The four **Work Overdue** metrics (CAPA,
> Nonconformance, Change Request and Document) do not measure what their name suggests. See
> **Work Overdue — under revision** before quoting them anywhere.

---

## How to read any metric

### Every metric has one date that decides which period a record falls into

A metric does not put a record in "this month" because the record is somehow *in* this month.
It uses **one specific date carried by that record**, and that date is different from metric
to metric. The same CAPA can appear in March on one tile and in July on another:

- **CAPAs Raised** dates a CAPA by **when it was raised** — so it sits in March forever.
- **CAPA Closure Time** dates the same CAPA by **when it was closed** — July.
- **CAPA Open Work Items** dates the work items underneath it by **when each one is due** —
  which could be any month at all.

None of those is wrong. They answer different questions, so they need different clocks. Every
metric below states its own date explicitly, and the **Quick reference** table below
lists all of them in one place.

### If that date is empty, the record is not in the metric at all

This is the single most useful thing to know about these numbers, and the easiest to miss.

A metric only sees records that **have** its date. A record where that date has never been
set is not counted as zero, not counted as late, not shown in a residual bucket — it is
simply absent from that metric.

The consequences are not subtle:

- **CAPA Closure Time only describes CAPAs that have closed.** An open CAPA has no closure
  date, so it cannot appear. If your oldest, hardest CAPAs are the ones still open, the
  average closure time can look excellent *because* of them, not despite them. A falling
  closure time next to a rising **Open CAPAs** count usually means the quick ones are being
  cleared and the difficult ones are accumulating.
- **CR Approval Time only describes change requests that were both submitted and approved.**
  A change request stuck in review for eight months contributes nothing to it.
- **Work items with no due date are invisible to all three work-item metrics.** They are not
  counted as on time and not counted as late. If your on-time rate covers far fewer items
  than you expected, the missing ones are usually items nobody gave a date to.
- **Documents with no periodic review interval never appear in Documents overdue for
  review** — a reassuring 0% can simply mean the review intervals were never configured.

Whenever a metric's headline looks better than the situation on the floor, the first
question to ask is: *what is missing its date, and therefore missing from this number?*

### Some metrics ask a question about today, so their history keeps moving

Most metrics settle. Once March is over, "NCs Raised in March" never changes again.

Some metrics do not settle, because their calculation asks a question about **right now** and
only uses the date to decide which column of the chart the record belongs in. Their historic
bars legitimately change from one week to the next, and nothing has been deleted or
back-dated:

| Metric | What "now" means in it |
| --- | --- |
| Open CAPAs, Open NCs | Counted only while the record is still open — a March bar falls as March's records get closed. |
| CAPA / NC / CR / Document Open Work Items | Counted only while the work item is still open. |
| Documents overdue for review | Asks whether the next review date has already passed *today*. |
| Training Compliance | Uses each assignment's status *today*, not its status at the end of the period. |
| The four Work Overdue metrics | Ask whether the due date is in the past *today*. See **Work Overdue — under revision** below. |

The practical rule: for these metrics, a screenshot is a statement about the day it was
taken. If you are pasting one into a management review, say which day it came from — the
tile's freshness timestamp gives you that.

### Work items are measured separately from records

CAPA, Nonconformance, Change Control and Document Control each have three metrics about
**work items** — the individual review, approval and action tasks that appear in people's
task lists — rather than about the record as a whole. They exist because the deadline that
actually gets managed in this system lives on the work item, not on the record.

The same rules apply to all twelve of them:

- **"Open"** means a work item is **Assigned** or **In Progress**. Items that were **Sent
  Back**, **Reassigned** or **Superseded** are not open — the work moved to a different item,
  and counting both would double-count it.
- **"Completed"** means the work item reached **Approved**, **Rejected** or **Cancelled**.
  The completion time is stamped at that moment. So a **rejected** or **cancelled** item is
  counted as completed — it left someone's queue, which is what an on-time measure is about.
  It is not a measure of how many were approved.
- **Only work items that carry a due date are measured at all** (see above).
- Work items carry an **assignee** but no site or department, which affects who can see these
  metrics — see **Scope** below.

### Scope: two people can see different numbers, and both be right

Every number is calculated over **the records you are allowed to see**, not over the whole
organization and then hidden. Records outside your reach are never delivered to your device
at all, so they cannot be in your total.

Every tile therefore carries a **scope badge** saying which population produced it:

| Badge | The number was calculated over |
| --- | --- |
| **My records** | Only records you own — for work items, the ones assigned to you. |
| **My department** | Your department, plus anything you own elsewhere. |
| **My sites** | Every site assigned to you, plus your department, plus records you own. |
| **Whole organization** | Every record in the organization. |

So a site quality lead and a group quality director can look at "Open CAPAs" side by side,
see different numbers, and both be correct. **Before comparing two figures, check that the
two scope badges match.** A number without its scope is not a number you can argue about.

One consequence that surprises people: **a metric can only be narrowed by information its
records actually carry.** Where the underlying records have no site, there is nothing for a
site-level reader to match on, and the system falls back to the next thing that does exist —
their department, or the records they personally own — rather than showing them a
company-wide total they are not entitled to. Where none of those exists either, the metric
produces a figure only for readers with organization-wide access. That is why some tiles are
visible to a director and simply absent for a site lead. Each metric below notes this where
it applies.

You also only see metrics for modules you can read. Someone with analytics access but no
Nonconformance access sees the Nonconformance module listed and none of its metrics.

### Freshness: how old the number on the tile is

These figures are not recalculated from scratch every time you open a page — that would be
too slow to be usable. They come from a pre-calculated store that refreshes **about every 15
minutes**, with a full rebuild overnight.

Every tile shows **when its number was computed** ("2 minutes ago", "14 minutes ago"); hover
it for the exact time. A tile also shows a **Rollup** badge, meaning it came from that
pre-calculated store rather than being read live.

Two things follow:

- A record you created a moment ago may not be in the total yet. Wait for the next refresh
  rather than assuming the metric is wrong.
- **A timestamp that has stopped moving is a signal, not a cosmetic glitch.** If the system
  detects that a metric's definition no longer matches how its module actually works, it
  deliberately stops updating that metric instead of publishing a confident wrong number. The
  last good figures stay on screen and the timestamp goes stale — which is visible, whereas a
  silently wrong number is not. A tile whose timestamp is hours or days old should be raised
  with your administrator.

### Counts, rates and averages behave differently

**Counts** have no population behind them. Zero means genuinely none, and the tile shows 0.

**Rates** are a share of a **population**, and the population is not "everything" — it is
whatever survived the metric's own filter. Two things follow:

- **Whatever a metric excludes is missing from *both* halves of the fraction**, not just the
  top. "Share of completed work items finished on time" has a population of *completed work
  items that had a due date*, so nothing that is still open, and nothing undated, is in the
  denominator at all.
- **An empty population produces no value, not 0%.** If nothing qualified, the tile shows a
  dash rather than a zero, because "none qualified" and "none of them passed" are completely
  different findings. This is guaranteed by how the calculation is built, not by a display
  rule — a rate can never be manufactured out of an empty population.

To see the population behind a chart, use the widget's export: it includes the numerator and
the denominator for every period and every segment, so a spreadsheet reconciles with the
screen.

**Averages are means, not medians.** The four duration metrics — CAPA Closure Time, NC
Closure Time, CR Approval Time and Approval Step Turnaround — total up the elapsed time and
divide by the number of records. A single record that took a year moves the average for its
whole period, and periods containing only a handful of records swing hard. If a month looks
alarming, group the chart by priority or severity and look at how many records are actually
behind it before drawing a conclusion.

### "Withheld" is not zero

When you group a chart or a breakdown by a dimension, a segment containing very few records
is shown as **Withheld** rather than as a number, so that a chart cannot be used to identify
an individual. Withheld means *records exist here and there were too few to display*. It
never means zero. Withheld segments and everything past the display limit are folded into a
single residual row so the parts still add up to the total.

### Drilling through to the records

Some tiles open the record list behind them when you click. That list is a normal filtered
list — it is a **starting point for investigation, not a re-run of the metric**. It filters
by status, not by the metric's period or your chosen comparison window, so expect the counts
to differ.

Metrics with no list to open — the twelve work-item metrics, Documents overdue for review and
Electronic signatures captured — are not clickable.

---

## Quick reference — which date decides the period

| Metric | Module | Type | The record lands in the period containing… |
| --- | --- | --- | --- |
| CAPAs Raised | CAPA | count | the date the CAPA was raised |
| Open CAPAs | CAPA | count | the date the CAPA was raised |
| CAPA Closure Time | CAPA | average days | the date the CAPA was closed |
| CAPA Effectiveness Verified | CAPA | rate | the date the CAPA was closed |
| CAPA Work On-Time Completion | CAPA | rate | the date the work item was completed |
| CAPA Open Work Items | CAPA | count | the date the work item is due |
| CAPA Work Overdue *(under revision)* | CAPA | rate | the date the work item is due |
| NCs Raised | Nonconformances | count | the date the NC was raised |
| Open NCs | Nonconformances | count | the date the NC was raised |
| NC Closure Time | Nonconformances | average days | the date the NC was closed |
| NC Work On-Time Completion | Nonconformances | rate | the date the work item was completed |
| NC Open Work Items | Nonconformances | count | the date the work item is due |
| NC Work Overdue *(under revision)* | Nonconformances | rate | the date the work item is due |
| Change Requests Raised | Change Control | count | the date the change request was raised |
| CR Approval Time | Change Control | average days | the date the change request was approved |
| Change Request Work On-Time Completion | Change Control | rate | the date the work item was completed |
| Change Request Open Work Items | Change Control | count | the date the work item is due |
| Change Request Work Overdue *(under revision)* | Change Control | rate | the date the work item is due |
| Documents overdue for review | Document Control | rate | the date the document's review clock started |
| Document Work On-Time Completion | Document Control | rate | the date the work item was completed |
| Document Open Work Items | Document Control | count | the date the work item is due |
| Document Work Overdue *(under revision)* | Document Control | rate | the date the work item is due |
| Quality Events Raised | Quality Events | count | the date the event was reported |
| Audit Findings Raised | Audit Findings | count | the date the finding was recorded |
| Training Compliance | Training | rate | the date the training was assigned |
| Electronic signatures captured | Analytics | count | the date and time the signature was applied |
| Approval Step Turnaround | Approvals | average days | the date the step was completed |

---

## CAPA

### CAPAs Raised

**Counts** every CAPA created in the period, whatever became of it afterwards. Cancelled and
closed CAPAs still count — this is a demand measure, not an outcome measure.

- **Period date:** when the CAPA was raised. A CAPA never moves out of the period it was
  raised in.
- **Break down by:** status, priority, type.
- **Using it:** rising volume is not automatically bad — it can mean detection is improving.
  Read it next to **Open CAPAs**: raising more while closing at the same rate is what creates
  a backlog. Grouping by source or type is how you find whether one process is generating
  the demand.

### Open CAPAs

**Counts** CAPAs that are neither **Closed** nor **Cancelled** as of the last refresh, shown
in the month each was raised.

- **Excludes:** anything closed or cancelled — so a bar shrinks as its CAPAs are closed. This
  is a living number, not a historic one.
- **Period date:** when the CAPA was raised, which is what makes the chart an ageing profile:
  bars far to the left are your oldest unfinished work.
- **Break down by:** status, priority.
- **Using it:** the leftmost surviving bars are the ones to act on. A tall bar three months
  back is a more useful finding than the total.

### CAPA Closure Time

**Averages** the number of days from initiation to closure across CAPAs closed in the period.

- **Measured from the initiation date recorded on the CAPA**, not from when the record was
  keyed in — so a CAPA entered into the system after the fact reports the true elapsed time
  rather than a flatteringly short one.
- **Excludes:** every CAPA that is still open, and any closed CAPA with no initiation date
  recorded. Read the caution above about records whose date is empty — this metric describes
  finished work only.
- **Period date:** when the CAPA was closed. A CAPA opened in January and closed in June
  contributes its whole duration to June.
- **Break down by:** priority, type.
- **Using it:** always read next to **Open CAPAs**. Falling closure time with rising open
  count means the easy ones are being cleared first.

### CAPA Effectiveness Verified

**The share** of CAPAs closed in the period that carry a recorded effectiveness
verification.

- **Population:** CAPAs closed in that period — not all CAPAs, and not all closed CAPAs ever.
- **Excludes:** anything not yet closed.
- **Period date:** when the CAPA was closed, so a CAPA verified months after closure still
  counts toward the period it closed in, and that period's figure rises retrospectively when
  the verification is recorded.
- **Break down by:** type, source.
- **Using it:** this is a records-completeness measure as much as a quality one — it tells you
  whether the effectiveness check is being *recorded*, which is what an auditor will look for.

### CAPA Work On-Time Completion

**The share** of CAPA work items completed in the period that were finished on or before
their due date.

- **Population:** CAPA work items that were completed in the period **and** had a due date.
- **Remember** that completed includes **Rejected** and **Cancelled** items, and that undated
  items are absent entirely — see **Work items are measured separately from records**
  above.
- **Period date:** when the work item was completed.
- **Break down by:** task kind.
- **Using it:** this is the honest on-time figure — it only speaks about work that actually
  finished. Pair it with **CAPA Open Work Items** to see what has not.

### CAPA Open Work Items

**Counts** CAPA work items that are still **Assigned** or **In Progress** and have a due
date, shown in the month they are due.

- **Excludes:** completed items, and items that were sent back, reassigned or superseded.
- **Period date:** when the work item is due — so items appear in future months too, which is
  what makes this usable as a forward workload view.
- **Break down by:** task kind.
- **Using it:** the bars to the left of today are your genuinely late work; the bars to the
  right are your committed load. Reading both together is more informative than any single
  overdue percentage.

### CAPA Work Overdue *(under revision)*

See **Work Overdue — under revision** at the end of this page.

---

## Nonconformances

### NCs Raised

**Counts** every nonconformance created in the period, whatever became of it afterwards.

- **Period date:** when the NC was raised.
- **Break down by:** status, severity, type.
- **Using it:** grouped by severity it becomes a signal rather than a volume — a stable total
  hiding a rising share of high-severity findings is the case worth catching.

### Open NCs

**Counts** nonconformances that are neither **Closed** nor **Cancelled** as of the last
refresh, shown in the month each was raised.

- **Excludes:** anything closed or cancelled — bars shrink as records are closed.
- **Period date:** when the NC was raised, making the chart an ageing profile.
- **Break down by:** status, severity.
- **Using it:** old bars that refuse to shrink, grouped by severity, are your escalation list.

### NC Closure Time

**Averages** the number of days from detection to closure across NCs closed in the period.

- **Measured from the date the nonconformance was detected**, not from when it was typed into
  the system — so an NC found on the floor on Monday and entered on Thursday reports four
  extra days, which is the truth.
- **Excludes:** every NC still open, and any closed NC with no detection date recorded.
- **Period date:** when the NC was closed.
- **Break down by:** severity, type.
- **Using it:** grouping by severity is the point — an overall average that mixes minor and
  critical findings tells you very little.

### NC Work On-Time Completion

**The share** of nonconformance work items completed in the period that were finished on or
before their due date. Same rules as the CAPA equivalent — see
**Work items are measured separately from records** above.

- **Period date:** when the work item was completed.
- **Break down by:** task kind.

### NC Open Work Items

**Counts** nonconformance work items still **Assigned** or **In Progress** with a due date,
shown in the month they are due.

- **Period date:** when the work item is due.
- **Break down by:** task kind.

### NC Work Overdue *(under revision)*

See **Work Overdue — under revision** at the end of this page.

---

## Change Control

### Change Requests Raised

**Counts** every change request created in the period, whatever became of it afterwards.

- **Period date:** when the change request was raised.
- **Break down by:** status, priority, source.
- **Using it:** grouped by source, this is the cleanest picture of what is driving change in
  your system.

### CR Approval Time

**Averages** the number of days from submission to approval across change requests approved
in the period.

- **Excludes:** change requests that were never submitted, never approved, or are still in
  review — including one that has been sitting in review for months. This metric cannot see
  the queue, only the throughput.
- **Period date:** when the change request was approved.
- **Break down by:** priority.
- **Using it:** because rejected and stalled requests are invisible here, do not read this as
  "how long change control takes". Read it as "how long the approvals that happened took",
  and check the queue separately.

### Change Request Work On-Time Completion

**The share** of change request work items completed in the period that were finished on or
before their due date. Same rules as the CAPA equivalent.

- **Period date:** when the work item was completed.
- **Break down by:** task kind.

### Change Request Open Work Items

**Counts** change request work items still **Assigned** or **In Progress** with a due date,
shown in the month they are due.

- **Period date:** when the work item is due.
- **Break down by:** task kind.

### Change Request Work Overdue *(under revision)*

See **Work Overdue — under revision** at the end of this page.

---

## Document Control

### Documents overdue for review

**The share** of active controlled documents whose next periodic review date has already
passed, out of the active controlled documents whose review clock started in the selected
period.

- **The review clock** starts at the document's last recorded review. If a document has never
  been reviewed, it starts at the effective date of its current version. The next review date
  is that start date plus the document's own review interval.
- **Excludes:** archived documents, and — importantly — **any document with no periodic
  review interval configured**. A document nobody set an interval for can never be overdue on
  this metric, so a very low percentage may reflect missing configuration rather than good
  control.
- **Period date:** when the review clock started, which is *not* when the review became due
  and *not* today. This matters: a document last reviewed four years ago has a review clock
  that started four years ago, so a "last 12 months" view does not contain it. **To look for
  genuinely neglected documents, widen the period** — a short window can only ever show
  documents on short review cycles.
- **Break down by:** document status. Only active documents are counted, so this grouping has
  a single value.
- **Using it:** treat this as a prompt to open the document list and sort by review date,
  rather than as a standalone KPI. Its most useful reading is a change over time in a fixed,
  wide window.

### Document Work On-Time Completion

**The share** of document work items — the review and approval tasks on document versions —
completed in the period that were finished on or before their due date. Same rules as the
CAPA equivalent.

- **Period date:** when the work item was completed.
- **Break down by:** task kind.

### Document Open Work Items

**Counts** document work items still **Assigned** or **In Progress** with a due date, shown
in the month they are due.

- **Period date:** when the work item is due.
- **Break down by:** task kind.
- **Using it:** a document version sitting in review is a document that cannot be released.
  Bars to the left of today are releases that have already slipped.

### Document Work Overdue *(under revision)*

See **Work Overdue — under revision** at the end of this page.

---

## Quality Events

### Quality Events Raised

**Counts** quality events reported in the period.

- **Period date:** when the event was reported.
- **Break down by:** status, severity, category.
- **This is a volume measure only.** Quality events do not record lifecycle timestamps, so
  there is no closure time and no open-backlog metric for this module — those figures cannot
  be derived from what the records hold, and are deliberately absent rather than estimated.
- **Using it:** grouped by category, this is an early-warning surface — a category climbing
  here often precedes nonconformances in the same area.

---

## Audit Findings

### Audit Findings Raised

**Counts** audit findings recorded in the period. It counts **findings, not audits** — one
audit with nine findings contributes nine.

- **Period date:** when the finding was recorded, which is when it was entered rather than
  when the audit was conducted. For audits written up some time after the fact, the finding
  lands in the write-up period.
- **Break down by:** finding status, which is the useful one — it separates findings still
  being worked from those already resolved.
- **Scope note:** findings carry a department but no site, so a site-level reader sees the
  findings in their own department rather than everything at their site.
- **Using it:** a rise here is not automatically a decline in quality; audit programmes are
  scheduled, so volume tracks audit activity. Compare like periods, and group by status to
  see whether findings are being closed out.

---

## Training

### Training Compliance

**The share** of live training assignments that are currently **Completed** or **Verified**,
out of all live assignments made in the period.

- **Population:** every assignment made in that period that is still live. **Failed** and
  **Retrain required** assignments stay in the population and count against you — they are
  live obligations, not completions.
- **Excludes:** assignments that were removed from a person (for example, when someone
  changes role and the requirement no longer applies). Removing an assignment takes it out of
  both halves of the calculation.
- **Period date:** when the training was **assigned**, not when it was completed. So a
  period's figure keeps rising after the period has ended as people work through what they
  were given. Read a recent month as "how far through the new assignments we are", and an
  older month as "how much of that batch was never finished".
- **Break down by:** assignment status.
- **Scope note:** an assignment carries no site or department of its own — site and department
  are attributes of the *person*, not of the assignment — so this metric produces a figure
  only for readers with organization-wide access to training. For a per-site or per-department
  view, use the **Training Matrix**, which is built on people.
- **Definition check:** the system's automatic check that a metric's definition still matches
  how its module works cannot verify this one, because training assignments do not use the
  same kind of status list the check relies on. Nothing about the calculation is affected and
  the metric refreshes normally — but the automatic safety net described under
  **Freshness** above does not cover it. If the training
  statuses in your workspace are ever changed, have someone confirm this metric still counts
  what you expect.
- **Using it:** an older period stuck well below 100% is a training gap with names attached —
  open the assignment list to find them.

---

## Electronic Signatures

### Electronic signatures captured

**Counts** electronic signatures applied in the period, grouped by what each signature meant.

- **Period date:** the moment the signature was applied.
- **Break down by:** meaning (Approved, Reviewed, Verified, Rejected, Closed, Cancelled) and
  whether the signature was later revoked.
- **Revoked signatures stay counted.** A signature that was applied and later revoked is a
  thing that happened, and an activity record that quietly loses it is not an activity record.
  Use the revoked breakdown to separate them rather than expecting the total to drop.
- **Scope note:** a signature carries its signer but no site or department, so unless you have
  organization-wide access this shows your own signing activity.
- **Availability note:** this metric belongs to the Analytics module itself rather than to a
  record module, so it appears for anyone with analytics access.
- **Using it:** this is an activity and assurance measure, not a performance one. It is most
  useful as evidence that signing is happening where it should, and as a way to spot an
  unexpected concentration of one signature meaning.

---

## Approvals

### Approval Step Turnaround

**Averages** the number of days a workflow step spends in progress, across steps that
completed in the period.

- **Excludes:** **Delay** steps, whose duration is a deliberate wait rather than time anyone
  is losing. Also excludes steps that have not started, and steps still running — a step that
  has been sitting with an approver for six weeks contributes nothing until it completes.
- **Period date:** when the step completed.
- **Break down by:** step status, which separates steps that were approved from those that
  were rejected or cancelled — these often have very different turnarounds.
- **Scope note:** workflow steps carry no site, department or owner, so this metric produces a
  figure only for readers with organization-wide access.
- **Using it:** this is the shared bottleneck measure across every module that routes work
  through approvals. Because stalled steps are invisible until they finish, a *falling* figure
  during a period when approvals feel slow usually means the slow ones simply have not
  completed yet.

---

## Work Overdue — under revision

**This applies to all four:** CAPA Work Overdue, NC Work Overdue, Change Request Work Overdue
and Document Work Overdue.

> **Do not use these four figures for trending, targets or management reporting until this
> notice is removed.** They are being redefined. The description below is exactly what the
> number means today.

**What the calculation does today.** It first discards every work item that has been
completed, keeping only items that are still **Assigned** or **In Progress** with a due date.
It then asks, of those, how many have a due date in the past, and places each one in the month
it was due.

**Why that produces a number you cannot act on.** Everything that was finished has been
removed from *both* halves of the fraction, not just the top — so the population is "work
that is still open" rather than "work that was due". For any month that has already ended,
every item left in the population is by definition past its due date, so the figure reads
**100%** no matter how well the team performed. The current month reads roughly the share of
the month that has elapsed. The figure moves with the calendar, not with performance.

This is a definition problem, not a data problem: no amount of correcting records will change
what this calculation returns.

**What to use instead, today:**

- **Open Work Items** for the same module tells you *how many* items are still open and *when
  they were due* — the bars to the left of today are your real late work, as counts you can
  act on.
- **Work On-Time Completion** for the same module tells you whether the work that finished met
  its date.

Between them these answer both halves of the question the overdue rate was meant to answer,
and neither is affected by the defect above.

---

## Related articles

- [Roles & Permissions](/help/KB/administration/roles-and-permissions) — how scope is granted,
  and why two people see different totals.
- [My Tasks](/help/KB/operations/my-tasks) — the work items behind every work-item metric.
- [CAPAs](/help/KB/quality/capas), [Nonconformances](/help/KB/quality/nonconformances),
  [Change Requests](/help/KB/quality/change-requests),
  [Document Control](/help/KB/documents/document-control),
  [Training](/help/KB/training/training) — the records each metric is counting.
