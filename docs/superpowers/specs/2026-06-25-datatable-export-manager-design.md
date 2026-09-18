# DataTable Advanced Export Manager — Design

> Move table export out of the page header and into the DataTable toolbar, with an
> **advanced export manager** dialog (pick columns, choose CSV/Excel, choose row scope).
> Built as a **reusable** DataTable capability; wired into **Customer Complaints** first.
> Other modules opt in later.

Date: 2026-06-25 · Branch: `feat/base-table-rebuild`

## Problem

Customer Complaints exports from a page-header `Export` menu. That export is not a plain
CSV dump — it:

1. supports **CSV and Excel (.xlsx)** (via the `xlsx` lib), and
2. POSTs a **21 CFR Part 11 audit record** to `/v1/services/customerComplaints/auditExport`
   (who exported, format, row count, view), and
3. includes **custom-field columns**.

DataTable's built-in `exportable` is client-side **CSV-only, no audit, no column picker**.
So we cannot simply flip `exportable` on — that would silently drop the audit trail, Excel,
and custom fields. We need a richer, reusable export feature.

## Approach (chosen: A)

**DataTable owns the export UI + selection resolution; the consumer owns file generation +
audit.** DataTable stays decoupled (no `xlsx`, no `@/api`) — exactly the boundary the table
rebuild established. Each module wires its own audit endpoint.

## DataTable API (Layer 1, reusable, decoupled)

New props on `DataTable.vue`:

- `exportManager: Boolean` (default `false`) — when on, the toolbar Export button opens the
  advanced dialog instead of an immediate CSV download. Supersedes `exportable` when both set.
- `exportColumns: Array | null` (default `null`) — explicit export-field defs:
  `{ key, label, value(row)?, group: 'system' | 'custom', defaultSelected?: Boolean }`.
  When `null`, derived from the table's visible leaf columns (`label` + `exportValue` accessor),
  so generic tables work with zero config. Lets a consumer pass a **superset** of visible columns.
- `exportFormats: Array` (default `['csv']`) — formats the dialog offers. Consumers that can
  generate Excel pass `['csv','xlsx']`. CSV-only stays CSV-only (no `xlsx` dep in the shell).

New event:

- `@export` — emitted on dialog confirm: `{ format, fields, scope, rows, rowCount }`.
  - `fields` = resolved selected field defs (`{ key, label, value, group }`).
  - `rows` = resolved row set per scope: `scope==='view'` → table's filtered+sorted rows;
    `scope==='all'` → `props.rows` (ignores the table's advanced filter; page-level filters that
    shaped `props.rows` still apply — documented limitation).
  - **Fallback:** if no `@export` listener is attached, DataTable downloads CSV itself via
    `exportCsv.js` (so generic tables get export for free; Excel is hidden unless a listener exists).

## New component `TableExportDialog.vue` (in `dataTable/`, decoupled, BaseDialog-based)

- **Format**: segmented toggle, only shown when `formats.length > 1`.
- **Columns**: grouped checkbox list — *Fields* (system) and *Custom fields* — each group has a
  select-all/none header checkbox. The custom group's select-all is the "include custom fields"
  control. Custom section hidden when there are no custom fields.
- **Row scope**: radio — "Current view (filtered + sorted)" vs "All rows".
- Footer shows selected-column + row counts; Cancel / Export (Export disabled when 0 columns).
- Pure UI; selection state initialized from each field's `defaultSelected` each time it opens.
  Emits `confirm({ format, fieldKeys, scope })`.

## Customer Complaints (Layer 3, consumer)

- `CustomerComplaintsHome.vue`:
  - Remove the page-header `Export` `BaseMenu`/button (+ now-unused `IconDownload`/`IconChevronDown`
    if unreferenced).
  - Convert `exportRows()` into `exportColumns` field defs: the 13 system fields (`group:'system'`)
    + dynamic `customFieldKeys` (`group:'custom'`), preserving today's labels/values exactly.
  - Add `handleExport({ format, fields, scope, rows })`:
    - **CSV** → map fields → pseudo-columns `{ name, label, exportValue: value }`, reuse
      `rowsToCsv`/`downloadCsv` from `dataTable/exportCsv.js` (RFC-4180 + injection-safe).
    - **Excel** → keep `xlsx` utils; build json rows `{ [field.label]: field.value(row) }`.
    - **Audit** → keep the `auditExport` POST (now also records `scope` + selected column count).
  - Pass `exportManager`, `:exportFormats="['csv','xlsx']"`, `:exportColumns`, `:exportFilename`,
    and `@export="handleExport"` down to the table.
- `CustomerComplaintsTable.vue`: forwards `exportManager`/`exportFormats`/`exportColumns` to
  `<DataTable>` and re-emits `@export` (Home owns the data + audit endpoint).

## Testing

- `TableExportDialog.spec` — group select-all/none, custom-fields toggle, format + scope choice,
  `confirm` payload; Export disabled at 0 columns. (Stub BaseDialog inline — it teleports.)
- `DataTable.spec` — `@export` emits resolved fields/rows per scope; CSV fallback downloads when
  unhandled. (Assert payload, not the file blob.)
- Existing `exportCsv.spec` covers CSV correctness.

## Compliance / docs

- Audit POST stays in the consumer → preserved. Add to the migration checklist: **any module
  enabling `exportManager` for regulated data MUST wire `@export` to its audit endpoint** — the
  DataTable CSV fallback is un-audited and is only for non-regulated tables.

## Scope

This pass: the DataTable feature + Customer Complaints wired end-to-end. Other modules opt in later.
