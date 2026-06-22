# Detail Template Core & Config Contract (SP-1) — Design Spec

> **Status:** Draft for review · **Date:** 2026-06-22 · **Type:** Product UX / page-template project (tokens frozen).
> **Vehicle:** Built and proven in **Storybook first**. No app page is modified in SP-1.
> **Builds on:** [`2026-06-19-detail-page-template-design.md`](2026-06-19-detail-page-template-design.md) (the `BaseDetailLayout` foundation — L1/L2/L3 layers, descriptors, rail, states). This spec is the **next phase**: it does not replace that design, it extends it.

---

## 0. Where this sits

The `2026-06-19` spec defined and shipped the `BaseDetailLayout` shell (header + tabs + rail + states, driven by `useDetailLayout` + pure helpers, with Storybook stories and tests). A subsequent UX review added **twelve application-wide interaction patterns** the template must support so it can serve as the foundation for every QMS record "for the next 5–10 years without redesign."

Rather than implement all twelve plus the four missing content components at once (a 30-component platform initiative), the work is **decomposed into sub-projects**, each its own spec → plan → Storybook-first build:

| Sub-project | Contents | Status |
| --- | --- | --- |
| **SP-1 (this spec)** | Template core & config contract: `defineDetailConfig`, variant switch (#11), banner region (#6), AI/version **seams** (#5), anchor-nav, header morph, shell/rail convergence, Interaction Rules doc (#12) | **active** |
| SP-2 | Cross-cutting composables: command palette (#1), hotkeys (#9), view-state restoration (#10), unsaved-changes (#7), focus mode (#8) | planned |
| SP-3 | Relationship & peek: `BaseRecordPeek` + `useRecordPeek` (#2), `BaseRelatedRecords` | planned |
| SP-4 | `BaseWorkflowTimeline` (core feature) | planned |
| SP-5 | `BaseVersionHistory` (#4) + compare/`split` variant fill-in (#3) | planned |
| SP-6 | NC pilot migration → template-ize | planned |

**The longevity principle:** SP-1 defines the **config fields** for every later pattern (`commands`, `hotkeys`, `peek`, `version`, `ai`) so the contract shape never changes when their behavior lands. The seams exist from day one; the behavior arrives additively.

---

## 1. Goals & non-goals

### Goals
- A single declarative **config contract** — `defineDetailConfig()` — that every module writes against, paired with `BaseDetailLayout` **slot overrides** for custom content (the approved **hybrid** API).
- A **variant switch** on `BaseDetailLayout` (one component, no forks) covering `standard`, `readonly`, `embedded`, `print` as real behavior and `approval`, `workflow-review`, `split` as declared stubs.
- A **banner region** between header and content for contextual record states (read-only, archived, approval-pending, locked, workflow-waiting, unsaved, validation).
- **Reserved, empty seams** for AI (`#ai-summary` rail card, `#ai-panel` body) and version-history summary, gated by config flags (off by default).
- **Anchor-nav mode** for `DetailTabs` (scrollspy over one scroll spine) alongside the existing panel-tab mode, plus the sticky-header **full↔compact morph** wired to `useDetailLayout`'s `scrolled`.
- **Convergence:** `BaseDetailLayout` is the single canonical shell and `DetailRail`/`BaseRailCard` the single rail mechanism; `BaseDetailPage` and standalone `BaseOverviewPanel` are `@deprecated` (still functional).
- A written **Interaction Rules** decision matrix (#12).
- Everything proven in **Storybook** with stories for every variant, banner tone, nav mode, state, and breakpoint; pure logic unit-tested.

### Non-goals (SP-1)
- Behavior for commands / hotkeys / view-state / peek / workflow-timeline / version-history / compare — those are SP-2…SP-5. SP-1 ships only their **config shape and (where relevant) empty render seam**.
- Migrating any real app page (SP-6).
- Any design-token change (frozen).

---

## 2. The config contract — `defineDetailConfig()`

### 2.1 Form & placement

A **pure helper** in `resource/js/shared/composables/defineDetailConfig.js` that takes a partial config, applies defaults, validates shape (dev-only warnings), and returns a normalized config object. It holds **no entity vocabulary** and **no markup** — consistent with the §3.2 governing rules of the foundation spec. It is fully unit-tested like `detailLayoutHelpers.spec.js`.

`BaseDetailLayout` accepts the result via a single `:config` prop. The existing discrete props (`title`, `actions`, `tabs`, `railCards`, `width`, `headerVariant`, `loading`, `notFound`, `error`, …) **remain supported** and are internally normalized onto the same resolved model, so existing stories/consumers do not break. When both a discrete prop and the matching config field are provided, **`config` wins** and a dev warning fires.

### 2.2 Shape

```js
defineDetailConfig({
  // ── structure ──
  variant: 'standard',          // §4 — 'standard'|'readonly'|'embedded'|'print'|'approval'|'workflow-review'|'split'
  width: 'standard',            // inherited from BasePage
  headerVariant: 'full',        // 'full' | 'compact'
  rail: undefined,              // undefined = auto (true if rail content present)

  // ── identity (functions receive the record; may also be static) ──
  header: (record) => ({ title, subtitle, status, badges: [], icon, avatarName }),
  breadcrumbs: [ ... ] | (record) => [ ... ],

  // ── behavior descriptors (from foundation spec §3.3) ──
  actions: [ ActionDescriptor ],     // bucketed by useDetailLayout
  tabs:    [ TabDescriptor + { mode: 'anchor'|'panel' } ],   // §5
  sections:[ { id, label, icon, anchor?, lazy? } ],          // anchor-nav order + body order
  railCards:[ RailCardDescriptor ],  // ranked rail (optional convenience)

  // ── SP-1 new ──
  banners: (record) => [ BannerDescriptor ],   // §3 — function so it reacts to record state

  // ── seams (shape fixed in SP-1; behavior in later SPs) ──
  commands: [ CommandDescriptor ],   // SP-2 — validated & stored, not yet wired
  hotkeys:  { actionId: 'key' },     // SP-2
  peek:     { enabled: false },      // SP-3
  version:  { enabled: false },      // SP-5 — when true, renders a version-summary rail card seam
  ai:       { enabled: false },      // SP-5 — when true, exposes #ai-summary / #ai-panel slots
})
```

### 2.3 Defaults & degradation
- `defineDetailConfig({})` returns a valid minimal config → `BaseDetailLayout` renders header + single body slot, no tabs, no rail, no banners. (Matches the foundation spec's "everything is optional" rule.)
- `banners` defaults to `() => []`; `commands`/`hotkeys` to empty; `peek`/`version`/`ai` to `{ enabled: false }`.
- Normalization coerces static values and functions into a uniform internal form so the template never branches on "is this a function."

### 2.4 Descriptor additions (additive only)
- **`BannerDescriptor`** — `{ id, tone, icon?, title, message?, actions?: ActionDescriptor[], dismissible?: boolean }`. `tone ∈ 'info'|'warning'|'danger'|'neutral'`.
- **`TabDescriptor`** gains `mode: 'anchor' | 'panel'` (default `'panel'`, preserving current behavior).
- **`CommandDescriptor`** (seam) — `{ id, label, icon?, group?, run?, to? }`. Stored & validated in SP-1; registered into `BaseCommandPalette` in SP-2.

---

## 3. Banner region — `BaseBannerRegion` + `BaseBanner` (new)

Two new L3 primitives in `resource/js/shared/components/`:

- **`BaseBanner`** — a single contextual banner: `tone` (maps to existing tokens: `info` → `color-info-*`, `warning` → `color-warning-*`, `danger` → `color-danger-*`, `neutral` → `color-neutral-*`), optional `@tabler/icons-vue` icon, title, message, optional inline actions (real `<button>`s / `BaseButton`), optional dismiss (`<button aria-label="Dismiss">`). Root has `role="status"` + `aria-live="polite"` (`assertive` for `danger`).
- **`BaseBannerRegion`** — renders the resolved `config.banners(record)` array as a stack, placed **between the sticky header and the content** (`DetailHeader` → `BaseBannerRegion` → nav/main). Renders nothing when the array is empty (no reserved space). Not sticky by default.

A small set of **factory helpers** (pure, tested) produce the common QMS banners so modules don't re-author copy:
`readOnlyBanner()`, `archivedBanner()`, `approvalPendingBanner()`, `lockedBanner()`, `workflowWaitingBanner()`, `unsavedChangesBanner()`, `validationIssuesBanner(count)`. Modules compose them in `banners(record)` based on record state. (This replaces the hand-rolled "QC inspection origin" alert in the current NC page.)

---

## 4. Variant switch (#11)

One `variant` prop on `BaseDetailLayout`, resolved by a **pure `resolveVariant()` helper** (tested) that returns a structural descriptor `{ showBreadcrumbs, stickyHeader, showNav, showRail, columns, editable, linearized }`. No forked components; the existing primitives read the descriptor.

| Variant | Behavior in SP-1 | Descriptor |
| --- | --- | --- |
| `standard` | Default: header + nav + main + rail | full |
| `readonly` | Same skeleton, all inline-edit affordances suppressed (drives the existing `isEditable` gate to false) | `editable: false` |
| `embedded` | No breadcrumb/teleport, no sticky header/nav — for rendering a detail inside a drawer/peek (consumed by SP-3) | `showBreadcrumbs:false, stickyHeader:false, showNav:false` |
| `print` | Linearized single column, rail folded inline after main, nav hidden, nothing sticky — clean PDF/audit export | `linearized:true, showRail:true(inline), columns:1` |
| `approval` | **Stub** — renders `standard` + dev TODO marker; filled in a later SP | = standard |
| `workflow-review` | **Stub** — renders `standard` + dev TODO marker | = standard |
| `split` | **Stub** — renders `standard` + dev TODO marker; SP-5 fills compare | = standard |

**Mobile is not a variant.** Mobile/tablet behavior is automatic responsive output from `useDetailLayout`'s `isMobile`/`isTablet` (per foundation spec §6) and applies under every variant.

---

## 5. Anchor-nav + header morph

### 5.1 Anchor-nav mode (`DetailTabs` extension)
`DetailTabs` gains `mode: 'anchor' | 'panel'` per tab/section descriptor:
- **`panel`** (default) — today's behavior: swaps tab panels, URL `?tab=` sync. Used for heavy/separate datasets (Activity, Attachments, Related, History).
- **`anchor`** — renders a sticky scrollspy strip (`z-sticky`, positioned directly under the header via the foundation spec's single sticky-offset CSS var). Items are real `<a href="#section-id">`; clicking smooth-scrolls (honoring `prefers-reduced-motion`) with `scroll-margin-top` = header+nav height so headings aren't hidden. Active section tracked via `IntersectionObserver` (pure scrollspy helper, tested). Used for the core record spine (Details, Workflow, Disposition).

A page may mix modes: anchor items for the core spine, panel tabs for heavy datasets — the GitHub-issue model. Pure helper `resolveNavModel(sections, tabs)` produces the combined nav descriptor.

### 5.2 Header full↔compact morph
Wire `DetailHeader`'s existing `full`/`compact` variants to `useDetailLayout`'s already-computed `scrolled`: at rest → `full` (avatar + title + status + meta + actions); past threshold → `compact` (icon + title + status + primary action) with `shadow-raised` fading in. No new state — `scrolled` already exists.

---

## 6. Convergence + AI/version seams (#5, #6 placement)

### 6.1 Deprecation (kept functional)
- `BaseDetailPage` and standalone `BaseOverviewPanel`: add `@deprecated` JSDoc + a dev-only `console.warn` on mount pointing to `BaseDetailLayout` / `DetailRail`. **Not deleted** — consumers migrate in SP-6+; removal guarded later by `lint:layout`.
- The `BaseOverviewPanel` → `BaseDetailSection` → `BaseDetailField` section pattern is **folded into rail cards**: a `BaseRailCard` can render `BaseDetailSection`/`BaseDetailField` content, so `DetailRail`/`BaseRailCard` becomes the one rail mechanism. `BaseDetailSection`/`BaseDetailField` survive as reusable primitives inside rail cards and body sections.

### 6.2 Reserved seams (render nothing today)
- `#ai-summary` — a rail-card slot, rendered only when `config.ai.enabled` (false by default).
- `#ai-panel` — a body region slot below content, gated by `config.ai.enabled`.
- Version-summary rail card — rendered only when `config.version.enabled` (false by default); content lands in SP-5.

These exist so SP-5 adds behavior without touching the template's region structure.

---

## 7. Interaction Rules (#12) — decision matrix (documented, not code)

Written into this spec and surfaced in `CLAUDE.md`. The rule every module follows:

| Use… | When |
| --- | --- |
| **Full-page navigation** | Switching to a *different record* the user will work in; or a panel-mode tab within the same record (heavy dataset). |
| **Drawer (slide-over)** | Peeking a *related* record without leaving context (SP-3); a focused sub-task (assign, evaluate) that needs room but not a full page. |
| **Dialog (modal)** | A blocking, must-resolve decision: confirm destructive action, e-signature, required choice before proceeding. |
| **Popover** | Lightweight, dismiss-on-outside-click extra info or a small picker anchored to a control. |
| **Context menu** | Per-row / per-item secondary actions on right-click or a `⋯` trigger. |
| **Inline editing** | Editing a field of the *current* record (default edit model — autosave). |
| **Expandable section** | Optional detail within a section the user can collapse; rail cards. |
| **Right rail** | Glanceable, persistent record metadata + relationships (ranked). Never the full edit form, never large datasets. |
| **Bottom panel / sheet** | Mobile substitute for the rail and for peek/drawer content. |

---

## 8. Component & file inventory

### New (SP-1)
| Unit | Kind | Responsibility |
| --- | --- | --- |
| `defineDetailConfig.js` | composable/helper | Normalize + validate + default the config object (pure) |
| `BaseBannerRegion.vue` | L3 component | Render the resolved banner stack between header and content |
| `BaseBanner.vue` | L3 component | A single contextual banner (tone/icon/title/message/actions/dismiss) |
| `detailVariantHelpers.js` | helper | `resolveVariant()` → structural descriptor (pure) |
| `detailNavHelpers.js` | helper | `resolveNavModel()` + scrollspy resolution (pure) |
| `bannerFactories.js` | helper | `readOnlyBanner()` etc. (pure) |

### Extended (SP-1)
| Unit | Change |
| --- | --- |
| `BaseDetailLayout.vue` | Accept `:config`; render banner region; apply `variant` descriptor; expose AI/version seams; mount anchor-nav; wire header morph |
| `DetailTabs.vue` | Add `mode: 'anchor' \| 'panel'` + scrollspy |
| `DetailHeader.vue` | Bind `full`↔`compact` to `scrolled` |
| `useDetailLayout.js` | Surface variant descriptor + nav model (consume the new pure helpers) |
| `BaseRailCard.vue` | Accept `BaseDetailSection`/`BaseDetailField` content (rail convergence) |

### Deprecated (SP-1, kept working)
`BaseDetailPage.vue`, standalone `BaseOverviewPanel.vue` — `@deprecated` + dev warning.

---

## 9. States (unchanged from foundation, restated)
Loading (skeleton mirroring layout) > Error > NotFound > Ready precedence is owned by `resolveDetailState()`. SP-1 adds no new state; banners are **content within the Ready state**, not a state. Empty banner array renders nothing.

---

## 10. Accessibility (SP-1 additions)
- Banners: `role="status"`, `aria-live` polite/assertive by tone; dismiss is a labeled `<button>`; actions are real buttons.
- Anchor-nav: real `<a href="#…">` links; on activation, move focus to the target section heading (`tabindex="-1"`) and rely on `scroll-margin-top` so it isn't hidden under sticky chrome; `aria-current` on the active item.
- Variant `readonly`/`print`: no focusable edit controls; print variant removes sticky/`position` to avoid clipped focus.
- All else inherits the foundation spec's WCAG-AA checklist (tabs ARIA, focus-visible ring, reduced motion).

---

## 11. Storybook deliverable (acceptance for SP-1)

Story set extends `Templates/Detail Page`:
1. **Config-driven page** — a story built purely from `defineDetailConfig` + slot overrides (proves the hybrid API).
2. **Variants** — `standard`, `readonly`, `embedded`, `print` rendered from the same component; stubs (`approval`/`workflow-review`/`split`) show the TODO marker.
3. **Banners** — each tone; the QMS factory banners; multiple stacked; empty (renders nothing).
4. **Anchor-nav** — a record with an anchored core spine + panel tabs; scrollspy highlight; mixed mode.
5. **Header morph** — interaction/scroll story showing full→compact + shadow.
6. **AI/version seams** — `ai.enabled`/`version.enabled` on vs off (slots empty when off).
7. **Deprecation** — a docs note + the dev warning behavior for `BaseDetailPage`/`BaseOverviewPanel`.
8. **Responsive** — mobile/tablet/desktop for the config-driven page (banners + anchor-nav under each).

**Acceptance:** stories exist, `build-storybook` green, `addon-a11y` clean on primary stories, all variants render from one unmodified `BaseDetailLayout`, and (per project memory) the Storybook is **eyeballed on the running instance**, not merely built. Unit tests green for the pure helpers (`defineDetailConfig` normalization/validation, `resolveVariant`, `resolveNavModel`/scrollspy, `bannerFactories`).

---

## 12. Risks & mitigations
| Risk | Mitigation |
| --- | --- |
| Config + discrete props create two ways to do everything → confusion | `config` is canonical; discrete props are a documented compatibility layer that maps onto the same model; `config` wins + dev warning on conflict. Docs steer new code to `config`. |
| Seams (AI/version/commands) bit-rot or drift before behavior lands | Their **shape is unit-tested** in `defineDetailConfig` from SP-1; later SPs only add behavior, not shape. |
| Variant stubs silently look "done" | Stubs render a visible dev-only TODO marker in Storybook and a `console.warn`. |
| Anchor-nav scrollspy fights sticky offsets | Single sticky-offset CSS var (foundation spec) drives `scroll-margin-top`; scrollspy uses `IntersectionObserver` with a rootMargin derived from the same var. |
| Deprecation breaks live pages | Nothing deleted; `@deprecated` + dev warning only; real migration is SP-6 and verified on the running app. |

---

## 13. Out of scope → later sub-projects
SP-2 (command/hotkey/view-state/unsaved/focus behavior), SP-3 (peek + related records), SP-4 (workflow timeline), SP-5 (version history + compare), SP-6 (NC pilot migration + template-ization). Each gets its own spec → plan → Storybook-first build.
