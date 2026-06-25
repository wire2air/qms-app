# BaseTable System Rebuild — Enterprise Blueprint

> Status: Proposal / design. Date: 2026-06-25.
> Scope: a single reusable data-table foundation for every module in the QMS, finalized Storybook-first, then migrated across the app.
> Grounding: this document is based on the **actual** current code — `resource/js/shared/components/BaseTable.vue` (442 lines), its sub-components (`BasePagination`, `BasePopover`, `BaseFilterBar`), the composables (`usePagination`, `useTableFilters`), and the 26 real consumers. The hardest two are cited throughout: `taskInstancesTable.vue` (10 polymorphic entity types, 10+ live queries, a hand-rolled mobile render) and `CustomerComplaintsTable.vue` (per-user column prefs reimplemented in `localStorage`).

---

## 0. TL;DR

The current `BaseTable` is **good, not broken** — config-driven columns, slot-first cells, `defineModel` for v-model state, a sane a11y baseline (`scope="col"`, `aria-sort`, real `<button>` sort headers), zero Quasar, no heavy deps. It is a B-grade component. It is **not** an enterprise foundation, for five structural reasons:

1. **It is hard-wired to client-side data.** Sort and pagination both slice `props.rows` in-component. There is no clean server-side path — and worse, if you pass a server page *and* set `pagination.total`, the internal `.slice()` double-paginates (a latent correctness bug). For a QMS that will hold tens of thousands of documents/records/tasks, this is the #1 scaling blocker.
2. **State coverage is two states out of eight.** Only `loading` (a top bar) and `empty` exist. No skeleton, no error, no "no results for this filter" (distinct from truly empty), no permission-denied, no offline.
3. **Clickable rows are not keyboard-operable** — `<tr @click.prevent="emit('row-click')">` with no `tabindex`/`role`/key handler. This violates the project's own CLAUDE.md rule #8 and WCAG 2.1.1/4.1.2. Every table that passes `@rowClick` (Products, Tasks, …) is mouse-only.
4. **No mobile strategy.** "Responsive" = horizontal scroll. `taskInstancesTable` had to hand-roll a parallel card list. That duplication will metastasize across 26 tables.
5. **Cross-cutting state isn't owned by the component.** Column visibility is an internal, ephemeral `ref(new Set())` — not a prop, not persisted, not restorable. So `CustomerComplaintsTable` reimplemented column persistence outside the table. Saved views, filters, density prefs are all per-page copy-paste.

**Recommendation:** rebuild around a **headless engine + presentational shell**. Adopt **TanStack Table v8 (`@tanstack/vue-table`)** as the engine and **`@tanstack/vue-virtual`** for virtualization; keep the current Tailwind/`tw:`-token visual language and the column-config ergonomics. Wrap the engine in our own `BaseTable` + sub-components so consumers never import TanStack directly (no lock-in, swappable). Preserve the existing `columns`/slot API via a thin adapter so the 26 migrations are mechanical, not rewrites.

**Final enterprise UX score of what exists today: 5.8 / 10** (detail in §16). Target after this blueprint: **9.2 / 10**.

---

## 1. UX Review (brutally honest)

### What's genuinely good (keep it)
- **Config-driven columns + slot-first cells.** `#body-cell-{name}` scoped slots are the right ergonomic; consumers render badges/links per cell without the component knowing about entities. This is why 26 modules adopted it. **Do not regress this.**
- **`defineModel` v-models** for `pagination`/`selected`/`density` — modern, clean.
- **Sort affordance** is well done: dual carets, active-column highlight, real `<button>`, `aria-sort`.
- **Token-based styling** (`tw:bg-sidebar`, `tw:border-divider`, …) — themeable, dark-mode-ready via CSS vars.
- **Zero Quasar, no table mega-dep.** Light footprint.

### UX problems
| # | Problem | Evidence (file:line) | Impact |
|---|---------|----------------------|--------|
| U1 | Row click not keyboard-operable; no row focus ring | `BaseTable.vue:348-354` | Keyboard/SR users cannot open records. A11y blocker. |
| U2 | Everything is `tw:whitespace-nowrap` — no truncation, no ellipsis+tooltip | `BaseTable.vue:290,375` | Wide content forces horizontal scroll; long titles blow out column widths. |
| U3 | Only loading + empty states | `BaseTable.vue:186-191, 403-410` | No skeleton (layout shift on load), no error recovery, filtered-empty looks identical to truly-empty. |
| U4 | No integrated toolbar — search/filter/views/group/export are all caller-supplied slots | `hasToolbar` `BaseTable.vue:167-174` | Every page rebuilds the toolbar. `ProductsTable` hand-rolls CSV export; `CustomerComplaints` hand-rolls column prefs. |
| U5 | Column visibility is ephemeral & internal | `hiddenCols = ref(new Set())` `BaseTable.vue:47` | Resets on nav; can't persist; can't restore a saved view. Forced `CustomerComplaints` to bypass the feature entirely. |
| U6 | Select-all is page-scoped only, with no "select all N across pages" affordance | `toggleAll` `BaseTable.vue:134-141` | Bulk ops on filtered sets are impossible beyond one page. |
| U7 | No multi-sort, no sort indicator priority | `handleSort` resets to single column `BaseTable.vue:66-75` | Enterprise users expect shift-click multi-sort. |
| U8 | Density toggle is per-instance state, not remembered | `density` model, no persistence | User re-sets density on every visit. |
| U9 | Mobile = horizontal scroll only | `tw:overflow-x-auto` `BaseTable.vue:257` | Unusable on phones for wide tables; `taskInstances` had to fork the render. |
| U10 | No row actions system — every table hand-builds an `actions` column slot | all consumers | Inconsistent hover/overflow/context-menu behavior across modules. |

### Visual hierarchy & density
- Header is `text-xs uppercase tracking-widest` — fine, but identical weight across sortable/non-sortable until hover; the *sortable affordance* should be discoverable without hover (carets help, but they're 8px and `opacity-25`).
- Two density levels only (`comfortable`/`compact`). Enterprise tables usually want **three** (compact/cozy/comfortable) and a per-user default.
- Selected-row background (`tw:bg-main-selected`) and hover (`tw:bg-sidebar-hover`) can collide visually; need a clear precedence + a left selection accent bar (Linear pattern).

---

## 2. Missing Features (vs. enterprise bar)

Legend: ✅ present · 🟡 partial · ❌ missing

**Toolbar:** Search ❌(slot only) · Global search ❌ · Quick filters ❌ · Advanced filters ❌ · Saved views ❌ · Export 🟡(hand-rolled) · Import ❌ · Refresh ❌ · Density 🟡 · Column visibility 🟡(ephemeral) · Group by ❌ · Sort 🟡(single) · Settings ❌

**Table:** Sticky header ✅ · Sticky first/last column ❌ · Resizable cols ❌ · Reorder cols ❌ · Pin cols ❌ · Sort ✅ · Multi-sort ❌ · Pagination ✅(client) · Infinite scroll ❌ · Virtualization ❌ · Row selection ✅ · Bulk selection 🟡(page-scoped) · Expandable rows ❌ · Nested/tree ❌ · Keyboard nav ❌ · Context menu ❌ · Double-click ❌ · Hover actions ❌

**Row actions:** Quick actions 🟡(manual) · Overflow menu ❌(manual) · Permission-gated 🟡(manual `v-if`) · Conditional visibility 🟡(manual)

**Bulk actions:** Delete/Export/Assign/Status/Labels/Archive/Clone/Workflow — all ❌ as a *system* (each table reinvents via `#bulk-actions` slot).

**Filters:** Nested/AND-OR ❌ · Searchable ❌ · Operators ❌ · Saved ❌ · Recent ❌ · Chips ❌ · Keyboard ❌ (today: a flat `BaseFilterBar` + `useTableFilters`, no builder).

**States:** Loading ✅ · Skeleton ❌ · Empty ✅ · Error ❌ · No-results ❌ · Permission-denied ❌ · Offline ❌

**Responsiveness:** Cards ❌ · Horizontal scroll ✅ · Responsive columns ❌ · Hidden-by-priority ❌ · Expand rows ❌ · Bottom actions ❌

**A11y:** Keyboard nav ❌ · SR row semantics 🟡 · Focus mgmt 🟡 · ARIA 🟡 · Selection announce ❌ · Context menu ❌

**Perf:** Virtual scroll ❌ · Memoization 🟡 · Lazy render ❌ · Large datasets ❌

---

## 3. Recommended Architecture

**Three layers, strict boundaries:**

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3 — Module tables (DocumentsTable, taskInstancesTable) │
│   own data via useLiveQuery; pass columns + a data source.   │
├─────────────────────────────────────────────────────────────┤
│ Layer 2 — Presentational shell (OUR components)              │
│   BaseTable + TableToolbar + TableFilters + BulkActionBar +  │
│   RowActions + states. Tailwind/tw: tokens. Storybook-first. │
├─────────────────────────────────────────────────────────────┤
│ Layer 1 — Headless engine (useDataTable wrapper)             │
│   thin wrapper over @tanstack/vue-table: column model, sort, │
│   filter, group, pin, size, selection, expansion, pagination.│
│   Data-source-agnostic: client array OR server fetcher.      │
└─────────────────────────────────────────────────────────────┘
```

### Why a headless engine (the key decision)
The features the QMS will need over 5–10 years — multi-sort, column pinning/resizing/reordering, grouping, tree rows, virtualization, server-driven sort/filter/paginate — are exactly the matrix TanStack Table solves as a **framework-agnostic, headless** core. Confirmed current Vue 3 adapter (`@tanstack/vue-table`, `FlexRender`/`useVueTable` in v8 stable; the v9 line moves to tree-shakeable `tableFeatures({...})` modules). Building this matrix by hand — which is the path the current component is on — is years of subtle state-management work we'd own forever.

**Guardrail against lock-in:** consumers never import TanStack. They talk to *our* `useDataTable(options)` and `<BaseTable>`. TanStack lives only inside Layer 1. If we ever swap engines, Layer 2/3 don't change.

**The one real trade-off:** +~14kb gzip (table) +~5kb (virtual), and the team learns one new mental model (the row model). Both are worth it at this scale. *Alternative considered & rejected:* extend the current custom engine. Fine for sort+paginate; it does not amortize for pinning+grouping+virtualization+server-mode — we'd reinvent TanStack badly.

### Data-source abstraction (fixes the #1 problem)
`useDataTable` accepts a discriminated `dataSource`:

```ts
// Client mode — engine sorts/filters/paginates the in-memory array.
{ type: 'client', rows: Ref<Row[]> }

// Server mode — engine is "manual"; emits state, caller fetches.
{ type: 'server', fetcher: (q: TableQuery) => Promise<{ rows: Row[]; total: number }> }
//   TableQuery = { page, pageSize, sort: SortRule[], filters: FilterGroup, search, groupBy }
```

In server mode we set TanStack's `manualSorting/manualFiltering/manualPagination` and never slice locally — killing the double-pagination bug and unlocking 100k-row datasets. Module tables on the SyncEngine stay in **client mode** (data is already local in IndexedDB) but get virtualization for free.

---

## 4. Component Breakdown

| Component | Responsibility | Notes |
|-----------|----------------|-------|
| `useDataTable(options)` | Headless engine wrapper. Returns reactive `table` API + helpers. | Layer 1. The only file that imports TanStack. |
| `BaseTable` | Orchestrator + table render (thead/tbody, sticky, virtual rows, density, selection col). Slots through to cells. | Backward-compatible `columns`/`#body-cell-*` API via adapter. |
| `TableProvider` (optional) | `provide()`s the table instance so deep sub-components (toolbar in a different DOM spot) read shared state. | Avoids prop-drilling the engine. |
| `TableToolbar` | Layout shell: left (title/count), center (search), right (actions). Pure slots + sensible defaults. | Replaces ad-hoc `hasToolbar`. |
| `TableSearch` | Debounced search input; client filter or server `search` param. | Wraps `BaseTextInput`. |
| `TableFilters` | Linear-style filter builder: chips + popover, operators, AND/OR, recent/saved. | Emits a `FilterGroup` tree. |
| `TableViewSwitcher` | Saved views (table/board/list) + per-view persisted state. | Persists via a `viewStore` adapter. |
| `TableDensitySelector` | compact/cozy/comfortable; persisted per-user. | |
| `ColumnManager` | Visibility + order (drag) + pin + reset. Persisted. | Replaces ephemeral `hiddenCols`. |
| `BulkActionBar` | Sticky bar when `selected.length>0`; standardized actions API + "select all N". | Replaces per-table `#bulk-actions`. |
| `TablePagination` | Keep/evolve `BasePagination`; add page-size, jump-to, range, server total. | Already extracted. |
| `RowActions` | Quick (hover) + overflow menu + context menu, all from one `actions` config with `visible`/`disabled`/`permission`. | Kills the hand-rolled actions columns. |
| `TableEmptyState` | Empty / no-results / permission-denied / offline / error variants. | Slot-overridable, icon+title+desc+CTA. |
| `TableSkeleton` | Column-aware shimmer rows matching real layout. | Removes load-time layout shift. |
| `TableCard` (mobile) | Card renderer for `< md`; driven by column `mobile` priority. | Single source of truth — deletes `taskInstances`' fork. |

---

## 5–8. Component API (Props · Slots · Events)

### `BaseTable` — props
| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `columns` | `ColumnDef[]` | `[]` | Enriched column contract (below). Back-compat with today's shape. |
| `rows` | `Row[]` | `[]` | Client-mode data. Ignored if `dataSource.type==='server'`. |
| `dataSource` | `ClientSource \| ServerSource` | `{type:'client'}` | The data-coupling fix (§3). |
| `rowKey` | `string \| (row)=>string` | `'id'` | Allow function keys. |
| `state` | `'auto'\|'loading'\|'skeleton'\|'empty'\|'no-results'\|'error'\|'denied'\|'offline'` | `'auto'` | Explicit override; `auto` infers from data/loading/filters. |
| `error` | `Error \| string \| null` | `null` | Drives error state + retry. |
| `loading` | `boolean` | `false` | |
| `selectable` | `boolean \| 'single' \| 'multiple'` | `false` | |
| `selectAcrossPages` | `boolean` | `false` | Enables "select all N matching". |
| `density` | `'compact'\|'cozy'\|'comfortable'` | persisted | 3 levels. |
| `stickyHeader` | `boolean` | `true` | |
| `stickyColumns` | `{ left?: string[]; right?: string[] }` | `{}` | Pinning. |
| `resizableColumns` | `boolean` | `false` | |
| `reorderableColumns` | `boolean` | `false` | |
| `multiSort` | `boolean` | `false` | shift-click. |
| `virtualize` | `boolean \| { estimateRowHeight }` | `auto >100 rows` | |
| `expandable` | `boolean \| (row)=>boolean` | `false` | |
| `getSubRows` | `(row)=>Row[] \| undefined` | — | Tree mode. |
| `groupBy` | `string[]` | `[]` | |
| `pagination` | `v-model` `PaginationState` | `{page:1,pageSize:50,…}` | Keep current shape. |
| `selected` | `v-model` `Key[]` | `[]` | |
| `columnState` | `v-model` `{visible,order,pinned,sizes}` | persisted | Replaces ephemeral set; restorable for saved views. |
| `sort` | `v-model` `SortRule[]` | `[]` | First-class (was buried in pagination). |
| `filters` | `v-model` `FilterGroup` | `null` | |
| `rowActions` | `(row)=>ActionItem[] \| ActionItem[]` | — | RowActions config. |
| `bulkActions` | `ActionItem[]` | — | BulkActionBar config. |
| `mobileBreakpoint` | `string` | `'md'` | Card switch. |
| `density`, `columnState`, `sort`, `filters`, `pagination` are all persistable via a `persistKey` prop → `viewStore`. | | | |
| `persistKey` | `string \| null` | `null` | When set, view state round-trips to storage (user-scoped). |
| `ariaLabel` / `caption` | `string` | — | SR table description. |

### `ColumnDef` contract (superset, back-compatible)
```ts
{
  name: string                       // unchanged (slot key)
  label: string                      // unchanged
  field?: string | (row)=>any        // unchanged
  align?: 'left'|'center'|'right'    // unchanged
  sortable?: boolean                 // unchanged
  sort?: (a,b,rowA,rowB)=>number     // unchanged (custom comparator)
  hideable?: boolean                 // unchanged
  // --- new, all optional ---
  width?: number; minWidth?: number; maxWidth?: number
  resizable?: boolean
  pin?: 'left' | 'right'
  truncate?: boolean | number        // ellipsis + tooltip; lines for clamp
  sticky?: boolean
  mobile?: 'primary'|'secondary'|'meta'|'hidden'  // card layout priority
  exportValue?: (row)=>string        // standardized export
  filterType?: 'text'|'select'|'date'|'number'|'boolean'|'entity'
  filterOptions?: …                  // for the filter builder
  group?: string                     // grouped header
  headerTooltip?: string
}
```
Anything not specified falls back to today's behavior → existing tables render unchanged.

### `BaseTable` — slots (superset of today)
- `#body-cell-{name}` `{ row, col, value, rowIndex }` — **unchanged.**
- `#body-cell` fallback — **unchanged.**
- `#header-cell-{name}` `{ col, sort }` — **unchanged** + `sort` helper.
- `#row-detail` `{ row }` — expandable content.
- `#toolbar`, `#toolbar-left`, `#toolbar-center` — toolbar regions.
- `#empty`, `#no-results`, `#error`, `#denied`, `#offline` — per-state override.
- `#skeleton` — custom skeleton.
- `#bulk-actions` `{ selected, clear, allMatching }` — **unchanged** + `allMatching`.
- `#mobile-card` `{ row }` — override the default card.
- `#row-actions` `{ row }` — override the RowActions render.

### `BaseTable` — events
- `@row-click(row, index, event)` — **kept** (now also fires on Enter/Space from keyboard).
- `@row-dblclick(row)` · `@row-contextmenu(row, event)` — new.
- `@update:sort` · `@update:filters` · `@update:columnState` · `@update:selected` · `@update:pagination` — v-model writebacks.
- `@request(query: TableQuery)` — server mode: "go fetch this".
- `@refresh()` · `@retry()` — toolbar refresh / error retry.
- `@reorder-column({from,to})` · `@resize-column({name,width})` — column ops.

**Composability rule:** `BaseTable` works standalone (pass props) *or* composed (`<TableProvider>` + `<TableToolbar>` + `<BaseTable>` reading shared state). Both supported; standalone is the default, provider is for split layouts.

---

## 9. Storybook Plan (Storybook 10, `@storybook/vue3-vite`, a11y addon already installed)

Conventions to match the repo: **CSF2** (`render()` + `setup()`), inline `tw:` templates, `tags:['autodocs']`, the existing **custom light/dark global toolbar** (`.storybook/preview.js`), and the a11y addon (`a11y: { test: 'todo' }` → flip to `'error'` for the new components).

Per component, ship these stories (the user's required matrix):

| Story | BaseTable | Toolbar | Filters | RowActions | BulkBar | EmptyState | Skeleton | Pagination |
|-------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Default | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Loading | ✓ | | | | | | ✓ | |
| Skeleton | ✓ | | | | | | ✓ | |
| Empty | ✓ | | | | | ✓ | | |
| Error | ✓ | | | | | ✓ | | |
| No-results | ✓ | | ✓ | | | ✓ | | |
| Permission-denied | ✓ | | | ✓ | ✓ | ✓ | | |
| Offline | ✓ | | | | | ✓ | | |
| Dense / Cozy / Comfortable | ✓ | | | | | | | |
| Large dataset (10k, virtualized) | ✓ | | | | | | | ✓ |
| Bulk selection (+ select-all-N) | ✓ | ✓ | | | ✓ | | | |
| Filters (builder, chips, AND/OR) | ✓ | ✓ | ✓ | | | | | |
| Multi-sort | ✓ | | | | | | | |
| Column manager (hide/reorder/pin/resize) | ✓ | ✓ | | | | | | |
| Mobile (cards, `md` viewport) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Dark mode | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Accessibility (a11y addon, keyboard) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| Server-mode (mock fetcher, latency) | ✓ | | ✓ | | | | ✓ | ✓ |
| Real-world: Documents / Tasks recreations | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ |

Add: a **viewport addon** config for the mobile stories, and a **play function** (interaction test) on the Accessibility and Bulk-selection stories to assert keyboard nav + ARIA. Storybook becomes the acceptance gate before any app migration.

---

## 10. Accessibility Review (target WCAG 2.1 AA)

Current gaps → fixes:
- **Keyboard rows (blocker, U1).** Make the row a roving-tabindex grid: `role="row"`, one `tabindex="0"` at a time, Arrow-Up/Down to move focus, Enter/Space to fire `row-click`, `Home/End`, `PageUp/Down`. Render an explicit focus ring. (Today: none.)
- **Grid semantics.** Adopt `role="grid"` + `aria-rowcount`/`aria-colcount` (true counts even when virtualized — critical so SRs report 10,000 not 30).
- **Selection announcements.** `aria-live="polite"` region: "3 of 240 selected." Checkboxes already labeled — keep.
- **Loading/busy.** `aria-busy="true"` on the grid while loading; `role="status"` on the skeleton.
- **Sort.** `aria-sort` already correct; add an SR-only "sorted ascending by X" status on change.
- **Filters/menus.** Focus-trap popovers (verify `BasePopover` traps + restores focus on close; today unconfirmed — `BaseTable.vue:220`). Escape closes and returns focus to trigger.
- **Caption.** Add `<caption class="sr-only">` from `caption`/`ariaLabel`.
- **Context menu.** Keyboard-invocable (Shift+F10 / Menu key), not mouse-only.
- **Color.** Selection state must not rely on background alone — add the left accent bar (also helps the hover/selected collision, U-hierarchy).
- **Reduced motion.** Gate the loading-slide and row transitions behind `prefers-reduced-motion`.

Enforce via the a11y addon set to `error` on the new stories + `play()` interaction tests for keyboard paths.

---

## 11. Performance Review

- **Virtualization.** `@tanstack/vue-virtual` row windowing; auto-on above ~100 visible rows (configurable). Keeps DOM ~30 rows regardless of dataset. Mandatory for `taskInstances`, `Documents`, audit logs.
- **Server mode** for unbounded datasets (§3): push sort/filter/paginate to the API; never hold 50k rows in memory. SyncEngine-backed tables stay client+virtualized (data is local).
- **Memoization.** TanStack memoizes row models; ensure column defs are **module-scope stable** (don't recreate arrays each render — note: several current tables build `columns` as a `computed`, which is fine, but cell render fns must be stable). Document this in the migration guide.
- **`v-memo` on rows** keyed by `(rowId, isSelected, rowVersion)` to skip re-render of untouched rows during selection churn.
- **Lazy cell mounting.** Heavy cells (entity badges doing their own `useLiveQuery`, as in `taskInstances`) only mount for visible (virtualized) rows — a real win there today every row mounts.
- **Debounce.** Search 200ms, resize via `requestAnimationFrame`, filter apply coalesced.
- **Avoid full re-sort copies.** Engine handles incremental sorted row model instead of `[...rows].sort()` on every keystroke (`BaseTable.vue:100`).
- **Budget/targets:** first meaningful paint of a 10k-row table < 150ms; scroll at 60fps; selection toggle < 16ms.

---

## 12. Mobile Review (not a shrunk desktop)

- **Card mode below `mobileBreakpoint`.** `TableCard` renders each row from column `mobile` priority: `primary` = card title, `secondary` = subtitle, `meta` = chip row, `hidden` = omitted. One renderer → deletes the `taskInstances` desktop/mobile fork.
- **Row actions → bottom sheet** on mobile (per CLAUDE.md detail-page interaction rules), not a cramped overflow menu.
- **Bulk selection** via long-press to enter selection mode; sticky bottom action bar.
- **Filters** open as a full-screen sheet, not an anchored popover.
- **Horizontal scroll** remains available as an opt-in "table view" toggle for power users who want the grid on tablet.
- **Sticky** first column (e.g., record name/number) when horizontal-scrolling on tablet.

---

## 13. Migration Strategy

**Principle: zero big-bang. The new BaseTable is API-compatible with the old one for the common path.**

1. **Phase 0 — Engine + shell in isolation.** Build Layer 1 (`useDataTable`) + Layer 2 components, finalized entirely in Storybook against the §9 matrix. No app code touched. a11y addon = error. Sign-off gate: all stories + play tests green.
2. **Phase 1 — Drop-in swap.** Replace `BaseTable.vue` with the new shell behind the **identical `columns` + `#body-cell-*` + `v-model:pagination/selected/density` API**. The 26 consumers compile unchanged. Run the app; visually diff the easy tables (Departments, Sites, Trainings…). Ship.
3. **Phase 2 — Reclaim hand-rolled features.** Delete `CustomerComplaints`' `localStorage` column code → use `persistKey` + `columnState`. Delete `taskInstances`' mobile fork → use `mobile` priorities + `TableCard`. Replace `Products`' `downloadCsv` → `exportValue` + toolbar export.
4. **Phase 3 — Server mode where it pays.** Move the largest tables (audit logs, all-records views) to `dataSource: server`. Add virtualization everywhere.
5. **Phase 4 — Migrate the 57 raw `<table>` sites** (e.g. `ProductSpecificationsTab.vue:118`) onto BaseTable. Add a `lint:tables` check that flags raw `<table>` outside an allowlist (mirrors `lint:layout`).

Each phase ships independently; the app is always releasable.

---

## 14. Technical Debt (paid down by this work)
- **DOM-state coupling / double-pagination latent bug** (`paginatedRows` slicing a server page) — removed by data-source abstraction.
- **Ephemeral column visibility** (`hiddenCols` ref) → persisted `columnState`.
- **Per-table reinvention:** CSV export (Products), column prefs (CustomerComplaints), mobile render (Tasks), select-all logic — all centralized.
- **Inline `<style>` keyframe** in `BaseTable.vue:428` → tokenized animation utility, gated by reduced-motion.
- **Hardcoded `min-w-125`, `z-1`** → token-driven sizing + a documented z-index scale.
- **`useTableFilters`/`BaseFilterBar`** (flat, copy-pasted across ~20 pages) → subsumed by `TableFilters` + `FilterGroup`.
- **Unverified popover focus-trap** — audited and fixed as part of a11y.

## 15. Priority Order
1. **P0 — Keyboard-operable rows + focus** (a11y/legal blocker; small, do first even before the rebuild lands).
2. **P0 — Engine + data-source abstraction + state coverage** (skeleton/error/no-results/denied/offline).
3. **P1 — Virtualization + persisted columnState + mobile cards** (the three that unblock Tasks/Documents/CustomerComplaints).
4. **P1 — RowActions + BulkActionBar systems** (consistency across 26 tables).
5. **P2 — Linear-style TableFilters + Saved views.**
6. **P2 — Resize/reorder/pin, multi-sort, grouping/tree.**
7. **P3 — Import, global search, board/view switcher.**

## 16. Final Enterprise UX Score

| Dimension | Today | Notes |
|-----------|:--:|------|
| Core table UX | 7/10 | Strong config+slot model, good sort affordance. |
| Visual hierarchy/density | 6/10 | Clean but only 2 densities, selection/hover collide. |
| Accessibility | 4/10 | Good headers; **keyboard rows broken**, no grid semantics. |
| Mobile | 3/10 | Horizontal scroll only; forks duplicated. |
| Performance/scale | 4/10 | No virtualization; client-only; double-paginate risk. |
| Enterprise features | 4/10 | Sort/select/paginate yes; filters/views/pin/group/export no. |
| Reusability/architecture | 7/10 | Good API; but cross-cutting state not owned, features hand-rolled. |
| States coverage | 3/10 | 2 of 8 states. |
| **Weighted overall** | **5.8/10** | A solid B-grade component, not an enterprise foundation. |

**Projected after blueprint: 9.2/10** — held back from 10 only by scope of grouping/tree/board views landing in later phases.

---

### Appendix A — Engine dependency note
- `@tanstack/vue-table` (v8 stable; `useVueTable` + `FlexRender`). v9 introduces tree-shakeable `tableFeatures({...})` — adopt when it leaves beta. Pin v8 for production now.
- `@tanstack/vue-virtual` for windowing.
- Both are headless (no styles) — our Tailwind/`tw:` token layer is untouched. TanStack is imported **only** in `useDataTable.js`; nothing else in the app references it.
