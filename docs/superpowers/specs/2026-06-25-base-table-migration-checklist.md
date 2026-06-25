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

## 0. Strategy & ground rules

- **One table per PR.** Each is independently shippable and eyeball-verifiable.
- **The adapter stays** until the last consumer is migrated. Don't delete
  `BaseTable.vue` mid-rollout.
- **Respect the page toolbar.** Most tables render inside `BaseListLayout` /
  `useListLayout`, which already owns **search + filters + saved views** at the page
  level. **Do NOT enable the table's `searchable`/`filterable`** when the page
  already provides them — that was the CustomerComplaints duplication. Default to
  page-owns-search/filter; the table owns columns/density/export/persistence.
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

## 2. Inventory & tracking (24 remaining + 1 done)

Tiers by feature surface. Check off as each lands.

### ✅ Done
- [x] `customerComplaints/CustomerComplaintsTable.vue` — reference impl (columnManager + persistKey + advanced filter + shared options).

### Tier 1 — Trivial (pagination only; ~near drop-in) — 16
Swap element + pagination/sort v-model + keep slots. No column manager unless desired.
- [ ] `changeRequests/ChangeRequestsTable.vue`  *(simplest — no flags)*
- [ ] `records/RecordsTable.vue`  *(@rowClick)*
- [ ] `optionSets/OptionSetsTable.vue`  *(@rowClick)*
- [ ] `equipment/EquipmentHome.vue`  *(@rowClick; table inline in a Home page)*
- [ ] `trainings/TrainingsTable.vue`
- [ ] `trainingInstances/TrainingInstancesTable.vue`
- [ ] `departments/DepartmentsTable.vue`
- [ ] `sites/SitesTable.vue`
- [ ] `documentTemplates/DocumentTemplatesTable.vue`
- [ ] `rcaTemplate/RcaTemplatesTable.vue`
- [ ] `riskAssessmentTemplate/RiskAssessmentTemplatesTable.vue`
- [ ] `customerComplaints/ComplaintFormsTable.vue`
- [ ] `customerComplaints/EmailChannelsTable.vue`
- [ ] `formTemplate/formTemplatesTable.vue`
- [ ] `workflow/WorkflowsTable.vue`
- [ ] `workflowInstance/workflowInstancesTable.vue`

### Tier 2 — Medium (columnToggle + showDensityToggle) — 5
Add `columnManager` + `densitySelector` + `persistKey`; mark non-default columns `hidden`.
- [ ] `suppliers/SuppliersTable.vue`
- [ ] `nonconformances/NonconformancesTable.vue`
- [ ] `capas/CapasTable.vue`
- [ ] `qualityEvents/QualityEventsTable.vue`
- [ ] `documents/DocumentsTable.vue`  *(has computed columns w/ dependent queries — check those still feed `columns`)*

### Tier 3 — Complex (selection / bulk / polymorphic) — 3
- [ ] `formTemplate/formTemplateRecords.vue`  *(selectable; table embedded in a form-records page)*
- [ ] `products/ProductsTable.vue`  *(selectable + bulk-actions + columnToggle + density + @rowClick + hand-rolled CSV export → migrate to `bulkActions`/`exportValue`; watch audited-export)*
- [ ] `taskInstance/taskInstancesTable.vue`  *(**hardest**: 10 polymorphic entity types, ~12 dependent live queries, a hand-rolled desktop/mobile fork → replace the fork with `mobileCards` + column `mobile` priorities; do LAST, allow extra time)*

> Infra / not consumers (no migration): `BasePage.vue`, `useListLayout.js`,
> `BaseListLayout.stories.js`, `BaseTable.stories.js`.

---

## 3. Rollout order

1. **Pilot (1):** `ChangeRequestsTable` — the simplest, proves the Tier-1 recipe end-to-end.
2. **Tier 1 batch** — the other 15 trivial tables (can be grouped a few per PR since they're mechanical, but still eyeball each).
3. **Tier 2** — the 5 column-manager tables (each gets `persistKey`).
4. **Tier 3** — `formTemplateRecords` → `ProductsTable` → `taskInstancesTable` (one PR each).
5. **Cleanup** — see §5.

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

- [ ] Confirm zero `<BaseTable>` consumers remain (`grep -r "<BaseTable" src/`).
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
