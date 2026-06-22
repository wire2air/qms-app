# Enterprise Page Framework — Roadmap

> **Goal:** a complete, composable library of **page-level** and **interaction-level** patterns so every QMS module (Supplier, CAPA, Audit, Non-Conformance, Documents, Equipment, Training, Risk, QC, Complaints, Change Requests…) is assembled from shared primitives — consistent UX, minimal bespoke code, no per-module forks.
>
> Status legend: ✅ shipped · 🟡 partial (exists but incomplete / not generalized) · ⬜ missing.
> Priority: **P0** foundational (everything leans on it) · **P1** high-leverage, used by most modules · **P2** valuable, fewer modules · **P3** speculative / future.
>
> Companion docs: [`docs/design-system-roadmap.md`](design-system-roadmap.md) (component-level), [`docs/superpowers/specs/2026-06-19-detail-page-template-design.md`](superpowers/specs/2026-06-19-detail-page-template-design.md) (the `BaseDetailLayout` precedent this framework generalizes).

---

## Part I — Architecture & Governing Principles

Everything here follows the model proven by `BaseDetailLayout` (see its spec). It is the template for every new pattern.

### 1. Three layers, always

| Layer | Role | Example |
| --- | --- | --- |
| **L1 — headless composable** | Owns state + behavior, zero markup. Trivially unit-testable. | `useDetailLayout`, `usePagination`, `useConfirm` |
| **L3 — primitives** | Small, droppable, presentational + semantic Vue components. | `DetailHeader`, `BaseRailCard`, `BaseTabs` |
| **L2 — shell** | Composes L1 + L3 via **descriptors + slots + flags**. The thing modules actually use. | `BaseDetailLayout` |

Modules consume L2 by default, drop to L3 for bespoke arrangements, and never reimplement L1.

### 2. The descriptor / slot / flag contract

- **Descriptors** (data) configure repeating structure: `actions`, `tabs`, `columns`, `railCards`, `breadcrumbs`. Plain JS objects, each predicate (`visible`/`disabled`) is a boolean **or** `() => boolean`.
- **Slots** (content) fill regions: `#tab-{value}`, `#meta`, `#status`, `#rail`. Scoped slots expose `{ state, isMobile, activeTab, … }`.
- **Flags** (structure) toggle whole regions: `rail`, `headerVariant`, `width`, `density`, `loading`/`notFound`/`error`.

> **No entity vocabulary in any L1/L2/L3 API.** No "supplier"/"capa"/"finding" in props or types — entity concepts live only in slot content and Storybook fixtures. This is what makes one shell serve every module.

### 3. Non-negotiables (inherited from `CLAUDE.md`)

Tokens frozen (no new color/space/type) · Tailwind `tw:` prefix · `@tabler/icons-vue` only, explicit import · `function` keyword · `defineModel` for v-model · no `<form>` elements (use `BaseClickableRow` / real `<button>`) · PascalCase in templates · luxon `dt.formatDate()` · TDD (vitest + @vue/test-utils) → Storybook (CSF3 + `autodocs` + `addon-a11y`) → **human a11y/visual gate** before done.

### 4. Definition of done (per pattern)

`spec → failing test → minimal impl → passing test → stories (incl. states + responsive + a11y panel) → lint (eslint + lint:layout + lint:ds) green → human review`. Ratcheted by `scripts/check-design-system.mjs`.

---

## Part II — Current-State Inventory

What already exists, so the roadmap builds *on* it rather than past it.

### Page shells & structure
| Pattern | Status | Component |
| --- | --- | --- |
| Base page (width/padding/rhythm owner) | ✅ | `BasePage` |
| Detail page template | ✅ | `BaseDetailLayout` + `DetailHeader`/`DetailRail`/`DetailTabs`/`DetailActionBar`/`BaseRailCard` |
| Simpler detail scaffold | ✅ | `BaseDetailPage`, `BaseOverviewPanel`, `BaseDetailSection`, `BaseDetailField` |
| List/index page | 🟡 | `BaseListPage` (exists; not adopted everywhere) |
| Page header / sections / grid | ✅ | `PageHeader`, `PageSection`, `BaseSectionHeader`, `ContentGrid` |

### Navigation & shell
| Pattern | Status | Component |
| --- | --- | --- |
| App shell (sidebar + header + content) | ✅ | `App.vue`, `MainSidebar`, `MainHeader` |
| Collapsible sidebar (desktop fixed / mobile overlay) | 🟡 | `MainSidebar` + `useSidebar` (no mini/icon mode) |
| Global full-text search | ✅ | `GlobalSearch` (`/` to focus) |
| Notification center | ✅ | `NotificationsBell` + `NotificationsPanel` |
| Breadcrumbs | 🟡 | `BaseBreadcrumbs` (component) + `RecordTrailBreadcrumb` (cross-record trail; not route-driven) |
| Tabs / sub-nav | ✅ | `BaseTabs`, `BaseTabPanel` |

### Overlays & panels
| Pattern | Status | Component |
| --- | --- | --- |
| Dialog / modal | ✅ | `BaseDialog`, `BaseFormDialog` |
| Confirm | ✅ | `useConfirm` + `ConfirmDialogHost` |
| Drawer / slide-over (left/right) | ✅ | `BaseDrawer` |
| Popover / tooltip / action menu | ✅ | `BasePopover`, `BaseTooltip`, `BaseMenu` |

### Tables, forms, feedback, data display
| Pattern | Status | Component |
| --- | --- | --- |
| Data table (sort, paginate, select/bulk, column-toggle, density, sticky) | ✅ | `BaseTable` |
| Filter bar / quick-filter pills | ✅ | `BaseFilterBar`, `BaseQuickFilterPills` |
| Pagination | ✅ | `BasePagination` + `usePagination` |
| Form field + inline-edit/auto-save | ✅ | `BaseField`/`BaseLabel`, `useAutoSave` pattern |
| Stepper (primitive) | 🟡 | `BaseStepper` (not wired into a wizard flow) |
| Empty / error / success / not-found | ✅ | `BaseStatusState` |
| Loading skeleton / spinner | ✅ | `BaseSkeleton`, `BaseSpinner` |
| Toasts | ✅ | `useToast` + `BaseToastContainer` |
| Timeline / audit row | ✅ | `BaseTimeline`, `BaseAuditTrailRow` |
| Cards / stat cards / charts | ✅ | `BaseCard`, `BaseStatCard`, `BaseChart` |
| Description list / field row / clickable row / accordion / avatar | ✅ | `BaseDescriptionList`, `BaseFieldRow`, `BaseClickableRow`, `BaseAccordion`, `BaseAvatar` |

### Known gaps (the roadmap below)
Command palette · saved views · column persistence · tree table · master-detail/split-view shell · persistent inspector panel · contextual side-panels (activity/comments/attachments/approval/AI) as reusable units · dashboard / form / wizard / settings / analytics / report page shells · permission-denied / offline / maintenance states · mini sidebar · route-metadata breadcrumbs · recents / favorites / pinned · hotkey registry + shortcut help · context (right-click) menu · quick create/edit · floating save bar · bulk-edit / batch operations · side-by-side comparison · preview panel · resizable split pane.

---

## Part III — Pattern Catalog

Each pattern uses the 12-field template. Depth scales with priority; ✅/🟡 entries focus on the *delta* needed to finish or generalize.

---

### A. Page Layouts

#### A1. Base Page ✅ (P0)
- **Purpose:** Single owner of content width, horizontal padding, and vertical rhythm for every authenticated page.
- **Use when:** Every app page. **Don't when:** full-canvas editors/designers (workflow editor, form builder) and public/auth pages — those own their own viewport.
- **UX:** One width tier per page; one gutter; no nested max-width boxes. **Responsive:** width tiers (`narrow` 48rem / `standard` 80rem / `wide` 96rem / `full`) collapse to full-bleed with consistent side padding on mobile. **A11y:** `<main>` landmark; single h1 via teleported `PageHeader`.
- **Config API:** `width`, `fullHeight`, `density`. **Slots:** default. **Stories:** each width × density; fullHeight scroll region. **QMS examples:** all 30+ modules. **Mistakes:** hand-rolled `tw:p-5`/`tw:max-w-*`; direct header teleports. **Extensibility:** add tiers via tokens only; enforced by `lint:layout`.

#### A2. Detail Page ✅ (P0)
- Generalized and shipped as `BaseDetailLayout`. The reference implementation for this whole framework. See its spec. Remaining fast-follows: `density` passthrough, optional `stickyHeader`/`stickyTabs` flags, tablet "collapsible Details summary" affordance.

#### A3. List / Index Page 🟡 → **P0**
- **Purpose:** The most common page type (~95% of modules). Standard scaffold: title + primary action, filter bar, quick-filter pills, table/grid, pagination, empty/loading/error — all wired.
- **Use when:** any collection of records. **Don't when:** a single record (→ Detail) or a dashboard of aggregates (→ Dashboard).
- **UX:** whole-page scroll with sticky table header (not `fullHeight`); primary "New" action top-right; filters persist in URL query. **Responsive:** filter bar wraps → collapses into a "Filters" sheet on mobile; table → stacked cards or horizontal-scroll bounded region. **A11y:** result count announced (`aria-live`); empty state focusable.
- **Config API:** `title`, `icon`, `primaryAction`, `filters` (descriptor), `quickFilters`, `columns`, `loading`/`error`, `viewKey` (for saved views). **Slots:** `#filters`, `#bulk-actions`, `#empty`, `#row`/`#body-cell-*`. **Stories:** loaded / empty / loading / error / filtered / bulk-selected / mobile. **QMS examples:** Suppliers, CAPAs, Audits home, Documents, Trainings, Equipment, Complaints. **Mistakes:** re-implementing filter/pagination state per page; not URL-syncing filters. **Extensibility:** plug in Saved Views (D6), Column Manager (D8), virtual rows (D3) without touching consumers.
- **Build:** generalize `BaseListPage` into a `BaseListLayout` L2 (mirror of `BaseDetailLayout`) backed by a `useListLayout` L1 (filter state + URL sync + pagination + selection).

#### A4. Dashboard Page ⬜ → **P1**
- **Purpose:** Aggregate landing per module / role (KPIs, charts, recent activity, shortcuts).
- **Use when:** an overview of many records/metrics. **Don't when:** editing one record, or a pure report (→ Reports, print-oriented).
- **UX:** responsive card grid (`ContentGrid` + `BaseStatCard` + `BaseChart`), drill-down on every tile, optional date-range control. **Responsive:** 4→2→1 columns; charts get min-height floors. **A11y:** each stat is a labeled region; charts need text/table fallback.
- **Config API:** `widgets` (descriptor: type, span, query), `dateRange`, `density`. **Slots:** `#widget-{id}`, `#toolbar`. **Stories:** full / loading (skeleton grid) / empty / single-column. **QMS examples:** Complaints reports, QC inspection home, an exec "Quality cockpit". **Mistakes:** fixed pixel grids; non-interactive KPIs. **Extensibility:** user-arrangeable widgets later (drag layout, persisted per user).

#### A5. Form / Create-Edit Page 🟡 → **P1**
- **Purpose:** Standard create/edit surface (the ~70% of modules with forms), honoring the no-`<form>` / inline-edit / auto-save rules.
- **Use when:** structured data entry. **Don't when:** >4 logical phases or branching (→ Wizard), or trivial single-field edit (→ inline edit).
- **UX:** sectioned fields (`PageSection` + `BaseFieldRow`), sticky **floating save bar** (G9) showing dirty/saving/error, keyboard submit, unsaved-changes guard on navigate. **Responsive:** multi-column field rows → single column; save bar pins to bottom. **A11y:** every control via `BaseField` (id/for/aria-invalid/aria-describedby); error summary region; focus first invalid.
- **Config API:** `sections` (descriptor), `mode` (`create`/`edit`/`review`/`readonly`/`approval`), `saving`/`error`/`dirty`. **Slots:** `#section-{id}`, `#actions`. **Stories:** create / edit / readonly / review / approval / saving / error / dirty-guard. **QMS examples:** New Supplier, CAPA edit, Document metadata, Training builder. **Mistakes:** copying entity into a local form object (breaks live-query model); pre-validating instead of surfacing `save()` errors. **Extensibility:** the `mode` flag is the seam for review/approval overlays (E10).

#### A6. Wizard / Multi-step Page ⬜ → **P1**
- **Purpose:** Guided multi-step creation with per-step validation and a summary/confirm.
- **Use when:** onboarding, complex create (new Audit program, new Inspection log/schema, supplier onboarding) with ≥3 dependent steps. **Don't when:** a flat form fits (→ Form Page) — wizards add friction.
- **UX:** `BaseStepper` header (status per step), Back/Next/Finish, can't skip ahead past invalid steps, review step before submit, progress persisted for long flows. **Responsive:** horizontal stepper → vertical/numeric on mobile. **A11y:** `aria-current="step"`; announce step changes; focus moves to step heading.
- **Config API:** `steps` (descriptor: title, validate, optional), `linear` (bool), `current` (v-model). **Slots:** `#step-{value}`, `#summary`. **Stories:** linear / non-linear / with-errors / review / mobile. **QMS examples:** Audit program setup, Inspection schema builder, QC sampling-plan creation. **Mistakes:** allowing forward nav past invalid state; losing data on back. **Extensibility:** branch logic (conditional steps), save-and-resume.
- **Build:** `BaseWizard` (L2) + `useWizard` (L1: step graph, validation gating, completion) on top of existing `BaseStepper`.

#### A7. Settings Page ⬜ → **P2**
- **Purpose:** Consistent admin/config surface (sectioned, often left sub-nav + right content).
- **Use when:** org/module configuration (notification rules, roles, option sets, sites, departments). **Don't when:** per-record settings (→ Detail rail).
- **UX:** left sub-nav (anchored sections or routed sub-pages), each section auto-saves or has its own save bar, dangerous actions isolated in a "Danger zone". **Responsive:** sub-nav → top tabs/select on mobile. **A11y:** sub-nav as `nav` landmark; section headings form the outline.
- **Config API:** `sections`/`groups` descriptor, `navStyle` (`rail`/`tabs`). **Slots:** `#section-{id}`. **Stories:** multi-section / single / danger-zone / mobile. **QMS examples:** Notification rules, Option sets, Roles & permissions, Company settings. **Mistakes:** mixing org and personal settings; no save feedback. **Extensibility:** search-within-settings, deep links to a section.

#### A8. Analytics Page ⬜ → **P2**
- **Purpose:** Exploratory metrics with filters/date-range/segmentation and rich `BaseChart` layouts (distinct from a fixed Dashboard — analytics is interactive/sliceable).
- **Use when:** trend analysis, cross-module quality metrics. **Don't when:** a static KPI overview (→ Dashboard) or an export-grade document (→ Reports).
- **UX:** persistent filter rail, comparison periods, chart→table toggle, drill-through. **Responsive:** filters collapse; charts stack. **A11y:** every chart has an accessible data table; color not sole encoding.
- **Config API:** `filters`, `metrics`, `dimensions`, `range`. **Slots:** `#chart-{id}`, `#filters`. **Stories:** populated / empty / loading / comparison. **QMS examples:** NC trend analysis, supplier scorecards, audit conformance trends. **Mistakes:** color-only categories; no empty-data handling. **Extensibility:** saved analyses, scheduled email, export.

#### A9. Report Page ⬜ → **P2**
- **Purpose:** Print/PDF-oriented, paginated, regulated output (the `documents/print.vue` pattern generalized).
- **Use when:** formal deliverables (audit report, CAPA closure, batch record, CoA). **Don't when:** interactive exploration (→ Analytics).
- **UX:** fixed page width, print stylesheet, header/footer with metadata + signatures + page numbers, watermarks for drafts. **Responsive:** screen preview scales; print is fixed A4/Letter. **A11y:** logical reading order; tagged-PDF-friendly structure.
- **Config API:** `paper`, `header`/`footer` descriptors, `sections`, `watermark`. **Slots:** `#cover`, `#section-{id}`, `#signature-block`. **Stories:** preview / draft-watermark / multi-page. **QMS examples:** Document print, audit report export, CAPA effectiveness report. **Mistakes:** screen layout that breaks on print; missing signature/version metadata. **Extensibility:** server-side PDF, template library.

#### A10. Split View / Master-Detail Page ⬜ → **P1**
- **Purpose:** List on one side, live detail/preview on the other — triage-heavy workflows.
- **Use when:** high-volume review where context-switching to a full detail page is costly (QC lots, inspection records, workflow task queue, complaint triage). **Don't when:** records are rich enough to deserve a full Detail page, or the list is small.
- **UX:** resizable divider (D-pattern), selection persists, keyboard up/down to move through list, detail scrolls independently, deep-linkable selected item. **Responsive:** below `lg`, collapses to list → push detail (back returns to list). **A11y:** selection announced; focus management between panes; divider keyboard-resizable.
- **Config API:** `items`, `selectedId` (v-model), `split` (ratio), `minPane`. **Slots:** `#list-item`, `#detail`, `#empty-detail`. **Stories:** selected / none-selected / resized / mobile-stack. **QMS examples:** QC lot capture, inspection records, workflow task inbox, complaint queue. **Mistakes:** non-resizable hard 50/50; losing selection on data refresh. **Extensibility:** three-pane (list → sublist → detail), preview-on-hover.
- **Build:** `BaseSplitView` (L2) + `useSplitView`/`useResizablePane` (L1) — also powers Inspector (B4) and Comparison (G6).

#### A11. Workspace / Multi-panel Page ⬜ → **P3**
- **Purpose:** Power-user canvas with several arrangeable panels (editor + inspector + outline + activity).
- **Use when:** complex authoring (workflow editor, form builder evolved). **Don't when:** standard CRUD — overkill.
- **UX:** dockable/resizable panels, layout persisted per user, panel show/hide. **Responsive:** degrade to tabs/stack below `lg`. **A11y:** each panel a labeled region; focus cycling; keyboard panel switch.
- **Config API:** `panels` descriptor, `layout` (persisted). **Slots:** `#panel-{id}`. **Stories:** default / panel-hidden / restored. **QMS examples:** Workflow editor, advanced form builder. **Mistakes:** building this before Split View + Inspector exist. **Extensibility:** user-saved layouts, pop-out panels.

#### A12. Landing / Marketing & Auth Pages ⬜ → **P3** (out of app-shell scope)
- Public marketing, login, invite-accept, error (404/500) pages. Own their viewport (no `BasePage`). Lowest priority for an internal QMS; track for completeness. Standardize at least the **auth shell** and **full-page error** (overlaps E-states).

---

### B. Navigation

#### B1. Left Navigation / Primary Sidebar 🟡 → **P1**
- **Purpose:** Primary module navigation. **Delta to finish:** add **mini/icon-only mode** (collapse to 64px rail with tooltips), section grouping with persisted expand state (have), active-route highlighting, permission-gated items (have via `isAllowed`).
- **UX:** hover-expand in mini mode; pin/unpin; keyboard nav. **Responsive:** overlay drawer on mobile (have). **A11y:** `nav` landmark, `aria-current="page"`, focus trap when mobile-overlay open. **Config API:** `items` (tree descriptor), `collapsed` (v-model), `mode`. **Stories:** expanded / mini / mobile-overlay / deep-active. **QMS examples:** the global sidebar. **Mistakes:** icon-only with no tooltips/labels (discoverability). **Extensibility:** favorites section (F7), recents (F6), badges per item.

#### B2. Secondary / Sub Navigation ✅🟡 → **P1**
- **Purpose:** In-page section switching (tabs) and module sub-areas. `BaseTabs`/`DetailTabs` cover tabs; **delta:** a routed sub-nav variant for Settings (A7) and multi-area modules (Audits: Standards/Programs/Instances).
- **UX:** URL-synced active tab (have in places — standardize), overflow → "More" menu when tabs exceed width. **Responsive:** scrollable tab strip → select dropdown on mobile. **A11y:** WAI-ARIA tabs (have). **Mistakes:** tab state not in URL (breaks deep-link/refresh). **Extensibility:** lazy panels (have via `keepAlive`), per-tab counts (have).

#### B3. Breadcrumbs 🟡 → **P1**
- **Purpose:** Hierarchical location + the cross-record trail. **Delta:** unify two systems — `BaseBreadcrumbs` (component) + `RecordTrailBreadcrumb` (cross-module trail) — behind one **route-metadata-driven** API so pages don't hand-build crumbs.
- **UX:** truncate long labels, collapse middle into "…" menu when narrow, last item `aria-current`. **Responsive:** show only last 1–2 on mobile. **A11y:** `nav[aria-label="Breadcrumb"]` + ordered list (have). **Config API:** route `meta.breadcrumb` resolver + explicit `items` override. **Mistakes:** building crumbs per page; not handling dynamic record titles. **Extensibility:** depends on B7 (route metadata).

#### B4. Inspector / Property / Information Panel ⬜ → **P1**
- **Purpose:** A *persistent, toggleable* context panel docked right (distinct from `DetailRail`, which is part of a detail page's own scroll). Shows properties/metadata for the current selection across list/split/editor contexts.
- **Use when:** selection-driven UIs (split view, tables, editors) need a stable place for "details of what's selected". **Don't when:** a detail page already owns a rail — don't double up.
- **UX:** open/closed state persisted, width persisted, header with title + close, sections via `BaseRailCard`/`BaseDescriptionList`, empty state when nothing selected. **Responsive:** becomes an overlay drawer below `lg`. **A11y:** `complementary` landmark; focus moves in on open; `Esc` closes when overlay. **Config API:** `open` (v-model), `width`, `title`, `sections`. **Slots:** `#header`, `#default`, `#empty`. **Stories:** open / closed / empty / overlay. **QMS examples:** QC lot inspector, workflow step properties, document metadata while editing. **Mistakes:** conflating with detail rail; non-persistent state. **Extensibility:** multiple inspector tabs (Properties/Activity/Comments) → composes C-panels.
- **Build:** `BaseInspector` (L2) on `useDisclosure` + `useResizablePane`.

#### B5. Bottom Panel ⬜ → **P3**
- **Purpose:** Horizontal dock for logs/console/validation results/bulk-progress (editor contexts).
- **Use when:** workflow/form editors needing a results tray. **Don't when:** content pages. **UX:** collapsible, resizable height, tabs within. **Responsive:** full-screen sheet on mobile. **A11y:** labeled region, keyboard toggle. **QMS examples:** form-builder validation, batch-op progress log. **Extensibility:** part of Workspace (A11).

---

#### B7. Route-Metadata System ⬜ → **P0 (enabler)**
- **Purpose:** Single source of truth for **title, breadcrumb trail, icon, permission, and active-nav** per route — so breadcrumbs (B3), document `<title>`, sidebar highlight, and permission gates stop being hand-wired per page.
- **Use when:** foundational; unblocks B1/B2/B3 and Recents/Favorites (F6/F7). **UX:** consistent titles + crumbs everywhere automatically. **A11y:** correct document title per route (screen-reader page identity). **Config API:** `meta: { title, breadcrumb(resolve), icon, permission, parent }` on auto-routes; a `useRouteMeta()` reader. **Mistakes:** duplicating titles in `PageHeader` and route meta — meta is canonical. **Extensibility:** the spine for command palette (C4) navigation entries and recents.

---

### C. Panels & Overlays

> **Consolidation:** "Right/Left Drawer" and "Slide-over" are one component (`BaseDrawer`, side+size variants) ✅. "Dialog/Modal" is one (`BaseDialog`) ✅. The net-new work is **contextual content panels** (activity/comments/attachments/approval/AI) and the **command palette**. Build these as content blocks that drop into `BaseDrawer`, `BaseInspector` (B4), or a detail tab — not as bespoke overlays.

#### C1. Activity / Timeline Panel 🟡 → **P1**
- **Purpose:** Reverse-chron feed of system + user events for a record. `BaseTimeline` exists; **delta:** a reusable `ActivityPanel` block (data → grouped, dated, actor-attributed entries with `BaseAuditTrailRow`).
- **Use when:** any record with a lifecycle (NC, CAPA, complaint, workflow, document). **Don't when:** static reference data. **UX:** date grouping ("Today/Yesterday/…"), load-more/infinite, filter by event type, deep-link to an entry. **Responsive:** full-width stack. **A11y:** ordered list, time elements, `aria-live` for new entries. **Config API:** `events` descriptor, `groupBy`, `filter`. **Slots:** `#entry-{type}`. **Stories:** populated / empty / loading / filtered. **QMS examples:** NC history, workflow instance timeline, document revisions. **Mistakes:** mixing audit trail (immutable) with editable comments. **Extensibility:** combine with Comments (C2) into a unified feed.

#### C2. Comments / Discussion Panel ⬜ → **P1**
- **Purpose:** Threaded discussion with mentions, attachments, edit/delete, resolve.
- **Use when:** collaborative records (NC, complaint, change request, audit finding). **Don't when:** single-user config data. **UX:** newest-last with sticky composer, @mentions, optimistic add then reconcile to live-query, edited/deleted markers. **Responsive:** composer pins to bottom. **A11y:** `log` role, focus to composer on open, announce new comments. **Config API:** `comments`, `canComment`, `mentionsSource`. **Slots:** `#composer`, `#comment`. **Stories:** thread / empty / mention / editing / readonly. **QMS examples:** complaint replies, NC notes, audit evidence discussion. **Mistakes:** non-optimistic UX feeling laggy; losing draft on close. **Extensibility:** reactions, resolve-thread, internal-vs-external visibility.

#### C3. Attachments Panel ⬜ → **P1**
- **Purpose:** Upload/list/preview/download files on a record, with drag-drop.
- **Use when:** evidence/document-bearing records (audit evidence, NC, document embeds, training materials). **Don't when:** no file association. **UX:** drag-drop zone + click-to-browse, upload progress, type/size validation, thumbnail/preview, inline rename/delete with confirm. **Responsive:** grid → list. **A11y:** keyboard-operable dropzone (button fallback), progress `aria-live`, labeled file actions. **Config API:** `files`, `accept`, `maxSize`, `canUpload`/`canDelete`. **Slots:** `#file-item`, `#empty`. **Stories:** empty / uploading / error / list / readonly. **QMS examples:** audit evidence, document attachments, complaint files. **Mistakes:** non-keyboard dropzone; no progress/error feedback. **Extensibility:** versioned files, preview pane (G7), virus-scan status. **Deps:** needs a `BaseFileUpload` primitive (currently missing).

#### C4. Command Palette ⬜ → **P0**
- **Purpose:** Cmd-K omnibox — navigate to any record/page and run any action by keyboard. The single biggest power-user/productivity lever.
- **Use when:** global. Foundational for navigation + actions + recents/favorites discovery. **Don't when:** n/a (always available). **UX:** fuzzy search, grouped results (Navigate / Records / Actions / Recent), keyboard-first (↑↓/Enter/Esc), recent + suggested when empty, nested action context. **Responsive:** full-screen sheet on mobile. **A11y:** `combobox` + `listbox` ARIA, `aria-activedescendant`, focus trap, restore focus on close. **Config API:** `commands` registry (descriptor: id, title, group, icon, perform, keywords, when), data-source adapters (routes via B7, records via search). **Slots:** `#result-{group}`, `#empty`. **Stories:** empty/recents / searching / grouped / action-mode / mobile. **QMS examples:** "Go to CAPA-2026-014", "Create non-conformance", "Open settings → notifications". **Mistakes:** colliding with the existing `/` search and the Cmd-K AI toggle — **resolve the keybinding conflict first** (the AI panel currently owns Cmd-K). **Extensibility:** module-contributed commands, parameterized actions, AI hand-off.
- **Build:** `useCommandRegistry` (L1) + `BaseCommandPalette` (L2). Depends on B7 for navigation entries and `useHotkeys` (F5).

#### C5. AI Assistant Panel 🟡 → **P2**
- **Purpose:** Docked AI chat/assistant. Exists (`ChatPanel`, Cmd-K). **Delta:** generalize into a `BaseAssistantPanel` (drawer/inspector content) with context injection (current record), streaming, and action proposals. **A11y:** chat `log` semantics, streaming announced politely. **Mistakes:** keybinding monopoly (see C4). **Extensibility:** tool-calls into command registry (C4).

#### C6. Notification Center ✅ → **P2 (polish)**
- Exists (`NotificationsBell` + panel). Delta: group by type/date, mark-all-read, deep-link to record (via B7), preferences link. Low urgency.

---

### D. Tables

#### D1. Standard Table ✅ (P0)
- `BaseTable` covers columns, type-aware sort, row-click, sticky header, selection/bulk slot, column-toggle, density, pagination, empty/loading. Solid. **Delta:** extract `useTable` (L1) so List/Split/Inspector reuse selection+sort+filter state headlessly.

#### D2. Tree Table ⬜ → **P2**
- **Purpose:** Hierarchical expandable rows. **Use when:** nested data (workflow steps, document hierarchies, org/site trees, BOM). **Don't when:** flat data. **UX:** expand/collapse with persisted state, lazy-load children, indent guides, select-cascades-to-children option. **Responsive:** indent shrinks; horizontal-scroll bounded. **A11y:** `treegrid` role, `aria-level`/`aria-expanded`/`aria-setsize`. **Config API:** `getChildren`, `expanded` (v-model), `lazy`. **Stories:** expanded / collapsed / lazy-loading / deep. **QMS examples:** workflow step hierarchy, document categories, site/department tree. **Mistakes:** loading entire deep tree eagerly. **Extensibility:** drag-reorder, virtualized tree (with D3).

#### D3. Virtual Table ⬜ → **P2** (deferred per current direction)
- **Purpose:** Windowed rendering for thousands of rows. **Use when:** lists >~1–2k rows (audit-trail explorer, all-records views). **Don't when:** typical QMS lists (<500) — `BaseTable` is fine. **Note:** `@tanstack/vue-virtual` was explicitly deferred; revisit only when a real large-data page appears. **A11y:** maintain row semantics + announce position despite windowing. **Extensibility:** as an opt-in `virtual` flag on `BaseTable`, not a fork.

#### D4. Master-Detail Table → see **A10 Split View** (same primitive).

#### D5. Bulk Actions ✅🟡 → **P1**
- Exists via `BaseTable` `selectable` + `bulk-actions` slot. **Delta:** standardize a **floating bulk action bar** (G-pattern): appears on selection with count, common actions (assign, status-change, export, delete), select-all-across-pages, undo. **A11y:** announce selection count; bar is a labeled toolbar. **QMS examples:** bulk-assign trainings, bulk-close NCs, bulk-export. **Mistakes:** per-page-only select-all that silently ignores other pages. **Extensibility:** → Bulk Edit (G10) / Batch Operations (G11).

#### D6. Saved Views ⬜ → **P2**
- **Purpose:** Named, shareable filter+column+sort presets. **Use when:** list pages users return to with the same lens ("My open NCs", "Overdue CAPAs"). **Don't when:** simple lists. **UX:** view switcher (tabs/dropdown), save/update/delete, default view, shared vs personal, URL-encodes state. **A11y:** view switcher as tabs/menu. **Config API:** `views`, `activeView` (v-model), `viewKey` (persistence), `canShare`. **Stories:** default / custom / shared / unsaved-changes. **QMS examples:** supplier risk views, NC dashboards by status. **Mistakes:** not encoding state in URL (unshareable). **Extensibility:** org-default views, per-role views. **Deps:** A3 + persistence layer.

#### D7. Filters ✅🟡 → **P1**
- `BaseFilterBar` + `BaseQuickFilterPills` exist. **Delta:** a descriptor-driven **filter system** (type-aware: select/multiselect/date-range/boolean/search), active-filter chips with individual clear, **URL sync**, and "Clear all". **Responsive:** filter row → bottom-sheet on mobile. **A11y:** each filter labeled; active-chip removal keyboard-operable. **Config API:** `filters` descriptor + `model` (v-model) + `urlSync`. **Mistakes:** ad-hoc per-page filter refs (current state). **Extensibility:** advanced query builder, saved views (D6).

#### D8. Column Manager ✅🟡 → **P2**
- Exists in-session via `columnToggle`. **Delta:** **persist** visibility + order + width (per user, per `viewKey`), drag-reorder, reset-to-default. **A11y:** reorder keyboard-operable. **Mistakes:** session-only (resets every reload). **Extensibility:** ties into Saved Views (D6).

---

### E. Forms & Detail Content

#### E1. Standard Form → see **A5**.
#### E2. Step Form → see **A6 Wizard**.

#### E3. Inline Editing ✅🟡 → **P1**
- Pattern established (bind-to-entity + debounced auto-save). **Delta:** a `BaseInlineEdit` wrapper so click-to-edit text/select fields stop being hand-rolled per page — read view ↔ edit view, Enter/Esc, save-on-blur, saving/error affordance, permission-gated. **A11y:** edit affordance is a real button; announce saved/error. **QMS examples:** supplier name, NC disposition, document title, audit scope. **Mistakes:** `div@click` edit triggers (not keyboard-operable); no error surface. **Extensibility:** optimistic + conflict handling.

#### E4. Read-only / Review / Approval Modes 🟡 → **P1**
- `BaseDetailField` + permission gating exist. **Delta:** make **mode** a first-class flag on Form Page (A5): `readonly` (display), `review` (display + decision controls), `approval` (display + e-sign + approve/reject). **A11y:** decision controls clearly labeled; e-sign dialog focus-managed. **QMS examples:** CAPA approval, NC closure, document change control, training verification. **Mistakes:** separate read-only and edit components drifting apart — one component, mode flag. **Extensibility:** diff/redline in review mode (G6).

#### E5. Detail Content Blocks (Overview / Metadata / Related Records / Version History / Audit Trail) 🟡 → **P1**
- **Overview/Metadata:** `BaseOverviewPanel`/`BaseDetailSection`/`BaseDescriptionList` ✅. **Related Records:** ⬜ a `RelatedRecordsPanel` (grouped links to cross-module records with status badges + count + "view all") — common (NC↔CAPA, complaint↔NC, finding↔NC). **Version History:** 🟡 generalize the documents revision UI into a `VersionHistoryPanel` (list + diff + restore). **Audit Trail:** `BaseTimeline`+`BaseAuditTrailRow` ✅ → wrap as Activity Panel (C1).
- **QMS examples:** every transactional record. **Mistakes:** rebuilding related-records UI per module. **Extensibility:** these are tabs/rail-cards dropped into `BaseDetailLayout`.

---

### F. Search & Productivity

#### F1. Global Search ✅ → **P1 (polish)**
- Exists (FTS over Documents/NC/CAPA, `/` focus). **Delta:** expand entity coverage, recent searches, "see all results" page, keyboard nav parity with palette. May merge UX with Command Palette (C4) (search = one palette mode). **Mistakes:** two divergent search affordances confusing users.

#### F2. Command Palette → see **C4 (P0)**.

#### F3. Quick Create ⬜ → **P2**
- **Purpose:** Create a record from anywhere without leaving context (palette action or "+" menu → minimal dialog). **Use when:** frequent capture (log an NC, raise a complaint). **Don't when:** creation needs a wizard. **UX:** minimal required fields, "create & open" vs "create & new", opens in `BaseFormDialog`. **A11y:** focus first field; standard dialog semantics. **QMS examples:** quick-log NC from any page. **Mistakes:** cramming the full form into quick-create. **Extensibility:** per-module quick-create registry (via C4).

#### F4. Quick Edit ⬜ → **P2**
- **Purpose:** Edit key fields in a popover/dialog without opening the full record (from a table row or split list). **UX:** subset of fields, save/cancel, optimistic. Overlaps Inline Edit (E3) and Bulk Edit (G10). **QMS examples:** change NC status/owner from the list. **Extensibility:** row-level action menus.

#### F5. Keyboard Shortcuts Infrastructure ⬜ → **P0 (enabler)**
- **Purpose:** A central hotkey registry + a "?" shortcut-help overlay (today only 2 hardcoded keys exist; Cmd-K is contended).
- **Use when:** foundational for C4, F1, list navigation, save (A5), wizard nav. **UX:** scoped shortcuts (global vs page vs panel), no conflicts, discoverable via `?` cheat-sheet. **A11y:** never trap keys away from AT; respect input focus; visible help. **Config API:** `useHotkeys(map, { scope })` + a registry feeding the help overlay. **Mistakes:** scattering `keydown` listeners (current state); clobbering native/AT keys. **Extensibility:** user-remappable keys.

#### F6. Recent Items ⬜ → **P2**
- **Purpose:** "Recently viewed" across modules (today `useRecordTrail` is session/trail-only). **Use when:** users revisit records. **UX:** in palette empty-state, sidebar section, and a "Recents" view; persisted per user. **A11y:** labeled list. **Deps:** B7 (route meta for titles/icons). **Extensibility:** feeds palette + dashboard.

#### F7. Favorites / Pinned Records ⬜ → **P2**
- **Purpose:** Star records/pages for quick return. **UX:** star toggle on detail header + lists; favorites in sidebar + palette. **A11y:** toggle button with state label. **Deps:** persistence + B7. **Extensibility:** pinned filters/views, team favorites.

---

### G. Feedback States & Advanced Enterprise

#### G0. Feedback States ✅🟡 → **P0**
- `BaseStatusState` (empty/error/success/notfound) ✅, `BaseSkeleton` ✅, `useToast` ✅. **Delta (P1):** add **Permission-Denied**, **Offline** (sync-engine aware — surface disconnected/syncing/synced), and **Maintenance** variants/components; standardize **per-region skeletons** that mirror real layouts (the `BaseDetailLayout` skeleton is the model). **A11y:** error `role="alert"`; offline/permission states focusable + actionable. **QMS examples:** denied module access, offline data-capture in inspections, scheduled maintenance banner. **Mistakes:** spinners where shaped skeletons belong; silent permission failures. **Extensibility:** retry/relogin actions baked into the state.

#### G1. Sticky Header ✅ → **P0**
- Shipped in `BaseDetailLayout` (scroll-aware chrome) and `BaseTable` (sticky thead). Generalize the scroll-shadow behavior as a `useStickyChrome` util for List/Form/Split. **A11y:** sticky element must not cover focus targets.

#### G2. Sticky Filters ⬜ → **P1**
- Filters bar stays pinned while the list scrolls (list pages). Part of A3 List Layout. **Responsive:** collapses to a compact pinned summary on mobile. **A11y:** keep filter controls reachable.

#### G3. Sticky Table Actions ⬜ → **P1**
- Pinned first/last column (row actions, selection) + sticky header during horizontal scroll. Opt-in on `BaseTable`. **A11y:** ensure pinned cells keep header association.

#### G4. Floating Action Bar ⬜ → **P2**
- Context-sensitive floating bar (e.g., editor selection actions, map/canvas tools). Distinct from save bar (G9) and bulk bar (D5). **QMS examples:** form-builder element actions. **Extensibility:** shared positioning util with bulk/save bars.

#### G9. Floating Save Bar ⬜ → **P1**
- **Purpose:** Sticky bottom bar for forms showing dirty state + Save/Discard + saving/error, with unsaved-changes navigation guard. **Use when:** any non-auto-save form, or to surface auto-save status. **Don't when:** pure read views. **UX:** appears on dirty, disabled while clean, shows last-saved time, confirm-on-leave. **Responsive:** full-width pinned. **A11y:** `aria-live` save status; buttons labeled. **Config API:** `dirty`/`saving`/`error`/`lastSaved`, `onSave`/`onDiscard`. **Stories:** clean / dirty / saving / error. **QMS examples:** supplier edit, document metadata, settings. **Mistakes:** letting users navigate away losing edits. **Extensibility:** per-section save, conflict resolution.

#### G6. Side-by-side Comparison ⬜ → **P2**
- **Purpose:** Two records/versions diffed side by side. **Use when:** document version diff, spec comparison, before/after review. **Don't when:** single record. **UX:** synced scroll, change highlights (add/remove/change), prev/next change nav. **Responsive:** stacks with a toggle on mobile. **A11y:** changes not color-only; announce diff summary. **QMS examples:** document revisions, audit standard versions, spec changes. **Deps:** A10 Split View primitive. **Extensibility:** N-way compare, inline vs side-by-side toggle.

#### G7. Preview Panel ⬜ → **P2**
- **Purpose:** Inline preview of a file/record without full navigation (PDF/image/doc). **Use when:** attachments (C3), document lists, search results. **UX:** lazy-load, fit/zoom for images/PDF, download/open-full actions. **A11y:** focus management; meaningful labels; keyboard zoom. **QMS examples:** evidence preview, document preview in search. **Deps:** file primitives. **Extensibility:** annotations.

#### G10. Bulk Edit ⬜ → **P2**
- **Purpose:** Edit a field across many selected rows at once. **Use when:** mass status/owner/site changes. **Don't when:** edits differ per record. **UX:** select rows → "Edit" → field picker → apply with preview of affected count + confirm + undo. **A11y:** announce affected count; confirm destructive. **QMS examples:** reassign trainings, re-site equipment, bulk-disposition NCs. **Deps:** D5 bulk selection. **Extensibility:** → Batch Operations (G11).

#### G11. Batch Operations ⬜ → **P3**
- **Purpose:** Long-running async operations over many records (bulk import, mass workflow launch, mass export) with progress + partial-failure reporting.
- **Use when:** server-side jobs over large sets. **Don't when:** small synchronous bulk edits (→ G10). **UX:** progress (bottom panel B5 / toast), per-item success/fail report, retry failures, downloadable result. **A11y:** progress `aria-live`; results as a table. **QMS examples:** bulk training assignment, data import, mass document state change. **Mistakes:** blocking UI; no partial-failure visibility. **Extensibility:** scheduled/queued jobs, audit logging.

---

### H. Overlay Primitives (consolidated)

All ✅ except context menu. One family, do not fork:
- **Dialog / Modal** ✅ `BaseDialog` (sizes), `BaseFormDialog`, `useConfirm`. **P0.**
- **Drawer / Slide-over (left/right)** ✅ `BaseDrawer`. **P0.**
- **Popover** ✅ `BasePopover` (Floating UI). **Tooltip** ✅ `BaseTooltip`. **Action menu** ✅ `BaseMenu`. **P0.**
- **Context (right-click) Menu** ⬜ → **P2.** `BaseContextMenu` reusing `BaseMenu` internals; positioned at cursor. **Use when:** power-user right-click on rows/items. **Don't when:** primary actions (must also be reachable without right-click). **A11y:** must have a keyboard-equivalent (Shift-F10 / a visible "⋮"). **Mistakes:** right-click as the *only* path to an action. **Extensibility:** nested submenus (also a `BaseMenu` gap).

---

### I. Responsive Strategy (cross-cutting, not a pattern)

Required of **every** pattern above. Breakpoints align with Tailwind (`md` 768, `lg` 1024).

- **Desktop (≥1280):** full multi-column (rail + content + inspector), persistent nav.
- **Laptop (1024–1280):** primary layout intact; inspector may auto-collapse.
- **Tablet (768–1024):** sidebars → overlays; detail rail stacks below content; split-view → list↔detail push nav; tables keep bounded horizontal scroll.
- **Mobile (<768):** single column; filters → bottom sheet; tabs → scrollable strip/select; tables → stacked cards or bounded scroll; floating bars → full-width pinned; dialogs/palette → full-screen sheets.
- **Rules:** no page-level horizontal scroll (only bounded regions); touch targets ≥44px; sticky elements never cover focus; honor `prefers-reduced-motion`.

### J. Accessibility Baseline (cross-cutting)

WCAG 2.1 AA for every pattern: semantic landmarks (`main`/`nav`/`complementary`/`region`), keyboard operability for everything (no `div@click`), visible focus rings, correct ARIA per WAI-ARIA APG (tabs/menu/dialog/combobox/treegrid/breadcrumb — most already correct), color never the sole signal, `aria-live` for async/state changes, focus management on overlay open/close, document title per route (B7), 4.5:1 contrast (tokens already tuned). Verified via Storybook `addon-a11y` + the human gate.

---

## Part IV — Prioritized Roadmap (P0 → P3)

### Dependency graph (build order matters)

```
P0 foundations
  BasePage ✅ ─┬─> List Layout (A3) ─┬─> Saved Views (D6)   [P2]
              │                     ├─> Column Mgr persist (D8) [P2]
              │                     └─> Sticky Filters (G2)  [P1]
  Detail Layout ✅ (template for all)
  Feedback States (G0) ✅🟡 ──> Permission/Offline/Maintenance [P1]
  useTable (D1 L1) ──> Bulk bar (D5) ──> Bulk Edit (G10) ─> Batch Ops (G11) [P3]
  Route Metadata (B7) ──┬─> Breadcrumbs (B3) [P1]
                        ├─> Recents (F6) / Favorites (F7) [P2]
                        └─> Command Palette (C4) [P0] <── Hotkeys (F5) [P0]
  Hotkeys (F5) ──> Command Palette (C4), Save Bar nav-guard, list nav
  Split View / useResizablePane (A10) ──┬─> Inspector (B4) [P1]
                                         ├─> Comparison (G6) [P2]
                                         └─> Preview (G7) [P2]
```

### P0 — Foundational (do first; everything leans on these)
1. **List Layout (A3)** — generalize `BaseListPage` → `useListLayout` + `BaseListLayout` (filter+URL+pagination+selection). *Highest reuse: ~95% of modules.*
2. **Route-Metadata System (B7)** — unblocks breadcrumbs, titles, nav highlight, palette, recents.
3. **Keyboard Shortcuts Infra (F5)** — central registry + `?` help; resolve the Cmd-K conflict.
4. **Command Palette (C4)** — the productivity multiplier; depends on B7 + F5.
5. **Finish Feedback States (G0)** — permission-denied / offline (sync-aware) / maintenance + layout-shaped skeletons.
6. *(Already shipped: BasePage, BaseDetailLayout, BaseTable, overlay family, tabs, toasts.)*

### P1 — High-leverage (used by most modules)
- **Form / Create-Edit Page (A5)** + **Floating Save Bar (G9)** + **Read-only/Review/Approval modes (E4)**.
- **Split View / Master-Detail (A10)** + **`useResizablePane`**.
- **Inspector Panel (B4)**.
- **Dashboard Page (A4)**.
- **Wizard (A6)** on `BaseStepper`.
- **Contextual panels:** Activity/Timeline (C1), Comments (C2), Attachments (C3, needs `BaseFileUpload`).
- **Detail content blocks:** Related Records, Version History (E5).
- **Inline Edit wrapper (E3)**.
- **Filter system + URL sync (D7)**, **Sticky Filters (G2)**, **Sticky Table Actions (G3)**, **Bulk Action Bar (D5)**.
- **Navigation finish:** mini sidebar (B1), unified breadcrumbs (B3), routed sub-nav (B2).
- **Global Search polish / merge with palette (F1)**.

### P2 — Valuable (fewer modules / power features)
- Settings Page (A7), Analytics Page (A8), Report Page (A9).
- Saved Views (D6), Column persistence (D8), Tree Table (D2), Virtual Table (D3, deferred).
- Quick Create (F3), Quick Edit (F4), Recents (F6), Favorites (F7).
- Comparison (G6), Preview Panel (G7), Bulk Edit (G10).
- Context Menu (H) + `BaseMenu` submenus.
- AI Assistant generalization (C5), Notification Center polish (C6).
- Primitives to unblock the above: **`BaseFileUpload`/dropzone**, **`BaseRichTextEditor`** (for comments/notes), **`BaseSegmentedControl`**.

### P3 — Speculative / future
- Workspace / multi-panel (A11), Bottom Panel (B5), Floating Action Bar (G4).
- Batch Operations (G11), user-arrangeable dashboards, saved layouts.
- Landing/marketing/auth shell standardization (A12).
- Drag-drop reorder primitives, three-pane split, pop-out panels.

### Suggested phasing
- **Phase 1 (P0 spine):** List Layout → Route Metadata → Hotkeys → Command Palette → Feedback states. *Outcome: every list page consistent; keyboard-first navigation; resilient states.*
- **Phase 2 (P1 record-work):** Form Page + Save Bar + modes → Split View + Inspector → Activity/Comments/Attachments → Dashboard → Wizard. *Outcome: every detail/edit/triage flow assembled from shared parts.*
- **Phase 3 (P2 power):** Settings/Analytics/Reports shells → Saved Views/Column persistence/Tree → Quick create/edit, Recents/Favorites → Comparison/Preview/Bulk-edit. *Outcome: enterprise power-user surface.*
- **Phase 4 (P3 frontier):** Workspace, batch ops, customizable dashboards.

---

## Part V — Net-new Primitives Required

These low-level pieces unblock multiple patterns and should be slotted in as their dependents come up:

| Primitive | Unblocks | Priority |
| --- | --- | --- |
| `useResizablePane` | Split View (A10), Inspector (B4), Comparison (G6) | P1 |
| `useHotkeys` + registry | Command Palette (C4), nav, save (F5) | P0 |
| `useListLayout` / `useTable` (L1) | List (A3), Split (A10), filters (D7), bulk (D5) | P0 |
| `useRouteMeta` | Breadcrumbs (B3), title, palette (C4), recents (F6) | P0 |
| `BaseFileUpload` / dropzone | Attachments (C3), Preview (G7) | P1 |
| `BaseRichTextEditor` | Comments (C2), notes, descriptions | P2 |
| `BaseSegmentedControl` | filters, view toggles, modes | P2 |
| `BaseContextMenu` + `BaseMenu` submenus | Context menu (H), bulk row actions | P2 |
| `useDisclosure` (generalized open/close+persist) | Inspector (B4), panels, sidebar | P1 |

---

## Appendix — Consolidations made (and why)

The original brief listed ~100 items; many are the same pattern under different names. A world-class system collapses these into one component with variants — fewer components, more consistency:

- **Dialog = Modal** → `BaseDialog` (size variants).
- **Right Drawer = Left Drawer = Slide-over** → `BaseDrawer` (`side` + `size`).
- **Right Context Rail = Inspector = Property = Information Panel** → `DetailRail` (in-page) + `BaseInspector` (persistent, selection-driven). Two, not four.
- **Activity = Timeline Panel** → one Activity Panel (C1) over `BaseTimeline`.
- **Master-Detail Table = Split View** → one `BaseSplitView` (A10).
- **Mini = Collapsible Sidebar** → one `MainSidebar` with a `mode`.
- **Global Search ↔ Command Palette** → likely one omnibox with modes (search results + commands), not two affordances.
- **Standard / Step / Inline / Review / Read-only / Approval Forms** → one Form Page (A5) with a `mode` flag + the `BaseInlineEdit` wrapper, not six form types.
- **Floating Action Bar / Save Bar / Bulk Bar** → share one positioning util; distinct content, common chrome.

> **The test for every addition:** *does this need a new component, or is it a variant/flag/slot of an existing one?* Default to the latter. The framework wins when modules compose, not fork.
