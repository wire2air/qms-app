# Page Layout System — Design

**Date:** 2026-06-17
**Status:** Phase 0 implemented (foundation components + standards). Phases 1–3 are roadmap.
**Scope:** Authenticated app shell pages only. Auth/public pages (signin, signup, the public form filler, supplier portal) are explicitly out of scope and keep their centered-narrow layouts.

---

## 1. Problem

Pages set their own width, padding, and vertical rhythm by hand. Evidence from the current codebase:

- **183** occurrences of `tw:p-5` as a page-root padding, plus stragglers using `p-8`, `px-4 py-10`, `p-5 + mb-12 + gap-8`.
- **~13 distinct `max-w-*` values** in pages/components (`md`, `2xl`, `5xl`, `4xl`, `3xl`, `sm`, `6xl`, custom `360`/`105`/`175`/`85vw`…). Most app pages have **no** max-width at all and stretch edge-to-edge on wide monitors.
- Section spacing is `gap-3` on most `*Home.vue`, `gap-5` on Dashboard, `mb-12 + gap-8` on form-templates.
- Page headers: 42 files use the shared `PageHeader`; others hand-roll a title `<div>`.

Net effect: alignment, gutters, and rhythm differ page to page — the app reads as less polished than Linear / Stripe / GitLab.

The design-system foundation is otherwise healthy: Tailwind v4 (`tw:` prefix, `@theme` in `src/css/base.css`), a mature `Base*` library (`BaseSectionHeader`, `BaseTabs`, `BaseFilterBar`, `BaseTable`…), and a teleporting `PageHeader`. What's missing is **a single page container** that owns layout, plus two small layout primitives. The layout contract lives in `BasePage` (Tailwind's 4px scale), not loose CSS vars. (Note: an earlier audit claimed a dead `--space-*` token scale existed in `src/css/tokens.css`; a grep of `src/css` found no such tokens, so there is nothing to remove.)

---

## 2. Architecture

The shell (`App.vue` → `MainSidebar` + `MainHeader` + a `tw:flex-1 tw:overflow-auto` content area) is unchanged. Every page's root becomes a single `BasePage`, which is the **only** owner of max-width, padding, and section rhythm.

```text
AppLayout                     App.vue shell — sidebar + MainHeader + scroll area     (unchanged)
└── BasePage                  THE container: max-width · padding · vertical rhythm    (NEW)
    ├── PageHeader            teleports title + #actions into MainHeader              (existing, unchanged)
    ├── BaseFilterBar  (opt)  the page toolbar — search + #filters + #actions         (existing)
    ├── BaseTabs       (opt)  scrollable, ARIA-correct tab strip                       (existing)
    ├── [default slot]        page body — this IS "PageContent"
    ├── PageSection    (opt)  titled content group (wraps BaseSectionHeader + body)    (NEW)
    └── ContentGrid    (opt)  responsive auto-fill card/stat grid                      (NEW)
```

### De-duplication (YAGNI)

The brief sketched `PageToolbar`, `PageTabs`, `PageContent`, `PageContainer`, `PageActions`, `PageFooter`, `ResponsiveContainer`. After auditing the existing library, most already exist or collapse:

| Sketched component | Resolution |
| --- | --- |
| `PageToolbar` | **Use `BaseFilterBar`** — already search + `#filters` + `#actions`, responsive `flex-wrap`. |
| `PageTabs` | **Use `BaseTabs`** — already ARIA tabs + `overflow-x-auto` (scrollable on mobile). |
| `PageContent` / `PageContainer` / `ResponsiveContainer` | **Collapse into `BasePage`** (its default slot / the container itself). |
| `PageActions` | **Collapse into** `PageHeader #actions` + `BaseFilterBar #actions`. |
| `PageFooter` | **Dropped** until a real need appears. |

Net new components: **`BasePage`, `PageSection`, `ContentGrid`** — all in `resource/js/shared/components/` (auto-imported).

---

## 3. `BasePage` contract

```vue
<BasePage
  width="standard"        <!-- standard (default) | wide | narrow | full -->
  density="comfortable"   <!-- comfortable (default) | compact -->
  :fullHeight="false"     <!-- true → h-full flex for pages with internal scroll -->
  :padded="true"          <!-- false → edge-to-edge (rare; full-bleed tables) -->
>
  <PageHeader :icon="IconUsers" title="Users"><template #actions>…</template></PageHeader>
  <BaseFilterBar v-model:search="filters.search">…</BaseFilterBar>
  <!-- body -->
</BasePage>
```

**Scroll ownership.** The shell content area is `tw:flex-1 tw:overflow-auto`. By default `BasePage` grows with content and the shell scrolls (natural document flow). For pages with their own internal scroll region (sticky table headers, split panes, kanban), pass `fullHeight`: `BasePage` becomes `tw:h-full tw:min-h-0` and a child marked `tw:flex-1 tw:min-h-0 tw:overflow-auto` scrolls instead. `box-border` (Tailwind default) keeps padding inside `h-full`, so full-height pages never double-scroll the shell.

Rendered container classes:
`tw:mx-auto tw:flex tw:w-full tw:flex-col` + width + gap + padding (+ `tw:h-full tw:min-h-0` when `fullHeight`).

---

## 4. Standards (the centralized spacing system)

Tailwind's 4px scale **is** the token system; `BasePage`/`ContentGrid`/`PageSection` encapsulate *which* values are allowed so pages stop hand-picking.

### Content width (centered, `mx-auto`)

| `width` | Max-width | Use for |
| --- | --- | --- |
| `wide` | `96rem` (1536px) | dashboards, wide tables, kanban/matrix |
| `standard` *(default)* | `max-w-7xl` (80rem / 1280px) | most list/index pages |
| `narrow` | `max-w-3xl` (48rem / 768px) | detail pages, forms, settings panels |
| `full` | uncapped | escape hatch (rare) |

### Spacing

| Concern | Value |
| --- | --- |
| Horizontal page padding | `tw:px-4 tw:sm:px-6 tw:lg:px-8` → 16 / 24 / 32px |
| Vertical page padding | `tw:py-6 tw:lg:py-8` → 24 / 32px |
| Section gap (`comfortable`) | `tw:gap-6` (24px) |
| Section gap (`compact`) | `tw:gap-4` (16px) |
| Intra-section gap (`PageSection`) | `tw:gap-4` (16px) |
| Grid gap (`ContentGrid`) | `tw:gap-4` comfortable / `tw:gap-2` compact |

### Breakpoints (Tailwind v4 defaults, named for the team)

| Name | Range | Layout behavior |
| --- | --- | --- |
| Mobile | `< 640` | 1-col, sidebar overlay, toolbar stacks/wraps, tabs scroll |
| Tablet (`sm`–`md`) | `640–1024` | 2-col grids/forms, sidebar still overlay |
| Laptop (`lg`) | `1024–1280` | sidebar static, full padding, multi-col |
| Desktop (`xl`) | `1280–1536` | content hits the `standard` cap |
| Ultrawide (`2xl+`) | `> 1536` | centered gutters grow; `wide` caps at 1536 |

Touch targets ≥ 44×44px on interactive controls within the layout primitives.

---

## 5. Responsive strategy (per element type)

| Element | Mobile | Desktop | Mechanism |
| --- | --- | --- | --- |
| Cards / stats | 1 col | auto-fill N col | `ContentGrid` (`minmax(min(100%, min), 1fr)` — never overflows) |
| Forms | 1 col | 2 col | `tw:grid tw:gap-4 tw:md:grid-cols-2` inside a `PageSection` |
| Tables | horizontal scroll inside a bounded wrapper | full columns | `BaseTable` wrapper `tw:overflow-x-auto`; `padded=false` allowed |
| Toolbar | wraps, full-width controls | inline row | `BaseFilterBar` (`flex-wrap`) |
| Tabs | horizontal scroll, no wrap | inline | `BaseTabs` (`overflow-x-auto`) |
| Header actions | already teleported into top bar | same | `PageHeader #actions` |
| Empty states | centered | centered | `BaseEmptyState` |

Guarantees: no page-level horizontal scroll (only bounded table wrappers scroll); no layout shift (widths are class-driven, not JS); consistent gutters at every breakpoint.

---

## 6. Migration roadmap

- **Phase 0 — Foundation (this change).** Build `BasePage`, `PageSection`, `ContentGrid` (+ specs). Document the page-layout rule in `CLAUDE.md`. Remove dead `--space-*` tokens. ✅
- **Phase 1 — Pilot (prove it).** Migrate ~5 pages spanning every archetype and **verify by running** at all 5 breakpoints (not just build/lint):
  - list/index → `UsersHome.vue`
  - dashboard → `DashboardHome.vue`
  - a detail page (e.g. a document/record detail)
  - a settings page (e.g. `CompanySettingsIndex`)
  - a wide-table page (e.g. an audit-logs or records table) using `width="wide" fullHeight`
- **Phase 2 — Bulk (tracked).** Remaining feature areas migrated in batches (see §7). Each batch: swap the page root to `BasePage`, delete hand-rolled `p-5`/`max-w-*`/`gap-*`, run tests + visual check.
- **Phase 3 — Enforcement.** `CLAUDE.md` rule + a lint/grep guard flagging raw `tw:p-5` / `tw:max-w-*` / `tw:h-full tw:p-5` at page roots so new pages auto-conform.

---

## 7. Pages to refactor

Every feature `*Home.vue` / `*Index.vue` / detail page whose root is `tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5` (or a variant) must swap to `BasePage`. Recommended fix is the same shape each time:

```vue
<!-- before -->
<div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
  <PageHeader :icon="IconX" title="…" />
  …
</div>

<!-- after -->
<BasePage width="standard" fullHeight>   <!-- fullHeight only if the page has an internal scroll region -->
  <PageHeader :icon="IconX" title="…" />
  …
</BasePage>
```

Batched by area (priority: **P1** = high-traffic / most-inconsistent, **P2** = standard, **P3** = low-traffic/admin):

| Batch | Areas | `width` | Priority |
| --- | --- | --- | --- |
| A | `dashboard`, `users`, `records`, `documents`, `documentTemplates` | standard (records/docs tables → `wide fullHeight`) | P1 |
| B | `audits`, `capas`, `nonconformances`, `changeRequests`, `customerComplaints` | standard / wide for tables | P1 |
| C | `taskInstance`, `trainings`, `trainingInstances`, `trainingMatrix`, `trainingVerifications`, `myTraining` | wide for matrix, standard otherwise | P2 |
| D | `products`, `equipment`, `suppliers`, `sites`, `departments`, `groups`, `roles` | standard | P2 |
| E | `inspectionsLogs`, `qcInspection`, `riskAssessmentTemplate`, `rcaTemplate`, `formTemplate`, `workflow`, `workflowInstance` | standard / wide | P2 |
| F | `company` (settings), `apiKey`, `aiPat`, `ai`, `aiUsage`, `auditLog`, `optionSets`, `print`, `impersonate` | narrow (settings/forms) / standard | P3 |

Special cases that need per-page judgment (not a blind swap):

- `form-templates.vue` — uses `bg-main min-h-screen mb-12 gap-8`; drop the page-level background and margins, move to `BasePage`.
- Pages already centering with `max-w-5xl`/`mx-auto` (e.g. supplier-facing app views) — map to `narrow`/`standard` and remove the manual centering.
- Full-bleed table pages — `width="wide" :padded="false" fullHeight`.

The exhaustive per-file list is generated per batch during Phase 2 (each batch PR enumerates its files), so the list stays accurate as pages change.

---

## 8. Best practices (so future pages auto-conform)

1. **Every page root is `<BasePage>`.** Never set page-level padding, max-width, or section gap by hand.
2. **Pick a `width`:** `narrow` for detail/forms, `standard` for lists, `wide` for dashboards/wide tables.
3. **`fullHeight` only when the page owns an internal scroll region** (then mark the scrolling child `tw:flex-1 tw:min-h-0 tw:overflow-auto`).
4. **Reuse, don't rebuild:** `PageHeader` (title/actions), `BaseFilterBar` (toolbar), `BaseTabs` (tabs), `PageSection` (titled groups), `ContentGrid` (card grids), `BaseTable`, `BaseEmptyState`.
5. **No page-level horizontal scroll** — only bounded table wrappers scroll.
6. A Phase 3 lint/grep guard flags raw `p-5`/`max-w-*` at page roots in review.

---

## 9. Foundation components (Phase 0, implemented)

| File | Purpose |
| --- | --- |
| `resource/js/shared/components/BasePage.vue` | The page container (width / padding / rhythm / fullHeight). |
| `resource/js/shared/components/PageSection.vue` | Titled content group; wraps `BaseSectionHeader` + body; optional `card` chrome. |
| `resource/js/shared/components/ContentGrid.vue` | Responsive auto-fill card/stat grid. |
| `…/BasePage.spec.js`, `PageSection.spec.js`, `ContentGrid.spec.js` | Unit specs (15 tests, passing). |

Verified: `vitest` (15/15 pass), `eslint` (clean), `vite build` (compiles). Visual verification at all breakpoints happens in the Phase 1 pilot.
