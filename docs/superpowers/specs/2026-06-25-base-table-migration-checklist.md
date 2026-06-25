# BaseTable → DataTable Migration Checklist

> Goal: move every `<BaseTable>` consumer onto `<DataTable>` directly, so each table
> gains the engine-backed features (virtualization, full state machine, keyboard
> a11y, column manager + reorder + sync persistence, advanced filter, mobile cards,
> row actions). The `BaseTable` adapter keeps everything working *today* — this is an
> incremental, table-by-table migration with no big-bang.
>
> Reference migration: `CustomerComplaintsTable.vue` (already done).
> System docs: `2026-06-25-base-table-system-rebuild-blueprint.md`.

---

## ✅ STATUS — migration complete (2026-06-25)

**All `<BaseTable>` consumers are migrated to `<DataTable>`.** `grep -r "<BaseTable" src/`
returns nothing. The advanced filter (`filterable`) has been rolled out to **24** tables
(reference: `nonconformances/NonconformancesTable.vue`, `capas/CapasTable.vue`).

Remaining follow-ups (not migration blockers):

- **`formTemplate/formTemplateRecords.vue` — intentionally NOT `filterable`.** It already
  ships a bespoke `FormTemplateRecordsAdvancedFilter` over dynamic, schema-derived columns;
  DataTable's `filterable` would render a second, conflicting filter UI.
- **`trainings/TrainingsTable.vue` — migrated but advanced filter NOT yet added** (omitted
  from the filter rollout). Add `filterable` + per-column `filterType` if/when wanted.
- **Cleanup (§5)** is now actionable: `BaseTable.vue` survives only as a thin adapter shim
  with zero consumers; decide delete-vs-keep + add the `lint:tables` guard.
- **In-app eyeball still owed** — auth-gated, so the filter dropdowns (select option lists,
  date pickers) need a human pass in the running app.

---

## 0. Strategy & ground rules

- **One table per PR.** Each is independently shippable and eyeball-verifiable.
- **The adapter stays** until the last consumer is migrated. Don't delete
  `BaseTable.vue` mid-rollout.
- **Respect the page toolbar — search vs. advanced filter.** Most tables render inside
  `BaseListLayout` / `useListLayout`, which owns the **search box + quick filters + saved
  views** at the page level. **Never enable the table's `searchable`** — that's the
  page's job (the CustomerComplaints duplication). The table's **`filterable` (advanced
  filter) is a complementary capability and IS now enabled on all migrated tables** — it
  adds structured per-column conditions (badge → `select`, luxon → `date`, `number`) the
  page search can't express. The only exception is a page that already ships its **own**
  advanced filter (`formTemplateRecords`), where `filterable` would duplicate it. Summary:
  page owns search; table owns columns/density/export/persistence **and the advanced filter**.
- **Auth-gated → human eyeball required.** Every migrated table must be opened in the
  running app and checked (sorting, pagination, selection, row-click, badges). CI/lint
  can't prove render.

---

## 1. Per-table migration recipe (do this for each table)

- [ ] **Swap the element:** `<BaseTable …>` → `<DataTable …>`. Keep all
      `#body-cell-*` / `#header-cell-*` / `#body-cell` slots verbatim (same API).
- [ ] **Pagination v-model:** convert the local `pagination` ref from the legacy
      shape `{ page, rowsPerPage, sortBy, descending, total }` to **`{ page, pageSize }`**
      plus a separate **`sort`** ref (`[{ id, desc }]`). Bind `v-model:pagination` +
      `v-model:sort`. Seed initial sort from the old `sortBy`/`descending`.
- [ ] **Flag rename:** `columnToggle` → `columnManager`; `showDensityToggle` →
      `densitySelector`.
- [ ] **Mobile:** decide cards vs scroll. Default `mobileCards` is **on** in
      `DataTable` — for a faithful port set `:mobileCards="false"` unless you want the
      card view. (The adapter set it false; match that unless improving.)
- [ ] **Selection:** if it used `selectable` + `v-model:selected`, keep them. Note
      select-all is **page-scoped** now (flag to the product owner if "select all N
      across pages" was relied on).
- [ ] **Bulk actions:** keep the `#bulk-actions` slot, OR move to the config-driven
      `:bulkActions` prop.
- [ ] **Row actions:** if the table hand-rolls an `actions` column slot, consider the
      `:rowActions` config (quick + overflow + permissions). Optional.
- [ ] **Column manager + persistence:** if it had `columnToggle`, enable
      `columnManager` and add **`persistKey="<module>"`** so visibility/order/pinning
      sync per-user (replaces any localStorage column hack). Mark non-default columns
      `hidden: true` (replaces a `DEFAULT_VISIBLE` list).
- [ ] **Entity columns + advanced filter (only if the table owns filtering):** give
      badge/entity columns `filterType: 'select'` + `filterOptions` (`{value,label}`)
      so the advanced filter shows labelled dropdowns, not raw ids. Reuse a shared
      options composable (see `useComplaintFilterOptions.js`) — don't duplicate live
      queries.
- [ ] **Dates:** cells still format via `dt.formatDate()` in the slot (unchanged).
- [ ] **Export:** if the page already has an (audited) Export, do **not** enable the
      table's `exportable` (compliance — see CustomerComplaints / 21 CFR Part 11).
- [ ] **Remove dead props** left over from the old wiring (e.g. unused `canUpdate`).

### Verification (per table)
- [ ] `npm run lint` clean for the changed files.
- [ ] Existing/added unit tests pass.
- [ ] **In-app:** open the page → rows render with badges/links; sort each sortable
      column; paginate; selection + bulk actions; row-click/nav; column manager
      (show/hide/reorder/pin) persists across reload; no duplicate search/filter vs the
      page toolbar; mobile view acceptable.

---

## 2. Inventory & tracking (all 25 migrated)

Tiers by feature surface. **`[x]` = migrated to `<DataTable>`. `AF` column = advanced
filter (`filterable`) status.**

### ✅ Done — reference
- [x] `customerComplaints/CustomerComplaintsTable.vue` — reference impl (columnManager + persistKey + advanced filter + shared options). **AF: ✅**

### Tier 1 — Trivial (pagination only; ~near drop-in) — 16

- [x] `changeRequests/ChangeRequestsTable.vue` — **AF: ✅**
- [x] `records/RecordsTable.vue` — **AF: ✅**
- [x] `optionSets/OptionSetsTable.vue` — **AF: ✅** (date only — no entity cols)
- [x] `equipment/EquipmentHome.vue` — **AF: ✅** (inline DataTable)
- [x] `trainings/TrainingsTable.vue` — **AF: ❌ not yet** (omitted from rollout)
- [x] `trainingInstances/TrainingInstancesTable.vue` — **AF: ✅**
- [x] `departments/DepartmentsTable.vue` — **AF: ✅**
- [x] `sites/SitesTable.vue` — **AF: ✅** (date + text only)
- [x] `documentTemplates/DocumentTemplatesTable.vue` — **AF: ✅**
- [x] `rcaTemplate/RcaTemplatesTable.vue` — **AF: ✅** (date only)
- [x] `riskAssessmentTemplate/RiskAssessmentTemplatesTable.vue` — **AF: ✅** (date only)
- [x] `customerComplaints/ComplaintFormsTable.vue` — **AF: ✅**
- [x] `customerComplaints/EmailChannelsTable.vue` — **AF: ✅**
- [x] `formTemplate/formTemplatesTable.vue` — **AF: ✅**
- [x] `workflow/WorkflowsTable.vue` — **AF: ✅**
- [x] `workflowInstance/workflowInstancesTable.vue` — **AF: ✅**

### Tier 2 — Medium (columnToggle + showDensityToggle) — 5

- [x] `suppliers/SuppliersTable.vue` — **AF: ✅**
- [x] `nonconformances/NonconformancesTable.vue` — **AF: ✅** (filter-pattern reference)
- [x] `capas/CapasTable.vue` — **AF: ✅** (filter-pattern reference)
- [x] `qualityEvents/QualityEventsTable.vue` — **AF: ✅**
- [x] `documents/DocumentsTable.vue` — **AF: ✅** (computed columns w/ dependent queries)

### Tier 3 — Complex (selection / bulk / polymorphic) — 3

- [x] `formTemplate/formTemplateRecords.vue` — **AF: N/A** (bespoke `FormTemplateRecordsAdvancedFilter`; DataTable `filterable` intentionally off)
- [x] `products/ProductsTable.vue` — **AF: ✅**
- [x] `taskInstance/taskInstancesTable.vue` — **AF: ✅ (partial)** — `entityType` → select, `dueDate`/`createdAt` → date; `title`/`type`/`status` disabled (`filterType:false`) because they're resolved per-entity-type via maps with no backing row scalar (a generic filter there would silently match nothing).

> Other `filterable` tables outside the original 25-table inventory:
> `inspectionsLogs/FieldRecordsList.vue` (added during the filter rollout).
>
> Infra / not consumers (no migration): `BasePage.vue`, `useListLayout.js`,
> `BaseListLayout.stories.js`, `BaseTable.stories.js`.

---

## 3. Rollout order — ✅ complete

1. ~~**Pilot (1):** `ChangeRequestsTable`~~ — done.
2. ~~**Tier 1 batch** — the other 15 trivial tables.~~ — done.
3. ~~**Tier 2** — the 5 column-manager tables (each gets `persistKey`).~~ — done.
4. ~~**Tier 3** — `formTemplateRecords` → `ProductsTable` → `taskInstancesTable`.~~ — done.
5. **Cleanup** — see §5 (now actionable; not yet done).

Advanced-filter rollout (follow-up pass) landed across the migrated tables in two commits
(`8766084` entity-rich tables; latest "advanced filter on remaining tables").

---

## 4. Cross-cutting decisions (settle once, up front)

- [ ] **`mobileCards` default** — keep tables faithful (`false`) on migration, or opt
      specific tables into card view? (Recommend: false by default; opt-in per table.)
- [ ] **`persistKey` naming convention** — e.g. the module slug (`documents`,
      `suppliers`). Confirm one scheme.
- [ ] **Select-all semantics** — accept page-scoped, or build `selectAcrossPages`
      ("select all N matching") before migrating selectable tables (Products,
      formTemplateRecords)?
- [ ] **Page-toolbar split** — for `useListLayout`/`BaseListLayout` pages, confirm the
      rule: page owns search + filters + saved views; table owns columns/density/persist
      (and advanced filter only where the page has none).
- [ ] **`'__actions'` magic string** — optionally refactor `DataTable` to a structural
      `meta.synthetic` flag before mass migration (reduces per-table footguns).

---

## 5. Final cleanup (after the last table)

- [x] Confirm zero `<BaseTable>` consumers remain (`grep -r "<BaseTable" src/`) — **confirmed 2026-06-25, none remain.**
- [ ] Either **delete** `BaseTable.vue` (+ its spec/story) or leave it as a thin
      documented shim. Update CLAUDE.md/migration cheatsheet to point new tables at
      `<DataTable>`.
- [ ] Remove now-dead legacy bits (`usePagination`/`useTableFilters`/`BaseFilterBar`)
      only if no non-table consumers remain.
- [ ] Add a `lint:tables` check (mirror `lint:layout`) that flags new raw `<table>` and
      new `<BaseTable>` usage, steering everyone to `<DataTable>`.
- [ ] Migrate the ~57 raw `<table>` sites (separate effort; track later).

---

## 6. Risks / watch-list

- **Can't verify in CI** — auth-gated; each table needs a real-app eyeball.
- **Pagination/sort shape conversion** is the most error-prone mechanical step — get it
  right in the pilot and copy.
- **Duplicate search/filter** vs the page toolbar — the #1 thing to check per table.
- **`DocumentsTable`/`taskInstancesTable`** build `columns` from dependent live queries
  / polymorphic logic — ensure the computed `columns` still feeds `<DataTable :columns>`
  cleanly and custom-field/accessor columns use `field: (row) => …` (not `'a:b'` strings).
- **Audited export** — never enable table `exportable` where the page exports through a
  compliance endpoint.
