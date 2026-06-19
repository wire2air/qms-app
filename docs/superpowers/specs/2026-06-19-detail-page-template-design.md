# Detail Page Template (`BaseDetailLayout`) — Design Spec

> **Status:** Draft for review · **Date:** 2026-06-19 · **Author:** Product UX + Frontend
> **Type:** Product UX / page-template project (NOT a design-token project — tokens are frozen).
> **Vehicle:** Built and proven in **Storybook first**. The live app is not modified until this is reviewed and approved.

---

## 1. Context & motivation

Qability is a detail-page-heavy enterprise QMS. Nearly every module — Supplier, CAPA, Non-Conformance, Audit, Equipment, Document, Training — is, at its core, a record detail page. The current detail pages (built on `BaseDetailPage` + hand-rolled bodies) work but do not reach the enterprise bar set by Linear, Jira, GitHub, Azure Portal, and Vercel.

This spec defines a **next-generation Detail Page template** — `BaseDetailLayout` — that becomes the foundation for every detail module. It is the highest-priority page template in the UX program; the other templates (List, Create/Edit, Dashboard, Settings) follow in later specs.

The goal is **not prettier pages**. It is faster workflows, clearer information hierarchy, persistent context, and a premium, consistent enterprise experience.

### Diagnosis of the current detail page (evidence: `src/components/suppliers/SuppliersPageId.vue`, `resource/js/shared/components/BaseDetailPage.vue`)

1. **No action bar.** The `#actions` slot renders only a "Saving…/error" indicator. There are zero real workflow actions (Approve, Evaluate, Archive, Export). The primary workflow surface of an enterprise record page is absent.
2. **No persistent context — the biggest gap.** Owner, status, key dates, and related counts are buried inside the Overview tab. Leave Overview and you lose all record context. Linear/Jira/GitHub keep a persistent properties rail visible on every tab.
3. **Everything is tabs (8) over a flat full-width body.** No always-visible "at a glance" state, no grouping hierarchy inside tabs.
4. **Header and tabs are not structurally sticky.** The whole body scrolls, so identity + tabs scroll away on long records.
5. **Activity / comments / attachments / audit / approval are not first-class.** Only a `BaseAuditTrailRow` primitive exists; there is no composed module.
6. **Props-drilling full objects** (`:supplier="supplier"`) violates CLAUDE.md rule #4 (components receive an `id` and query via the syncEngine).
7. **Loading is a bare centered spinner**, not a skeleton of the layout — a jarring, non-premium load.

### Locked decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Visual character | Hybrid: airy shell, dense data (density system is existing token work — out of scope here; the template **consumes** density, does not define it). |
| Layout archetype | **Jira/Salesforce**: full-width sticky header + sticky tabs; **persistent right context rail across all tabs**; main = active tab. |
| v1 scope | **Shell + rail + states + Storybook examples** (Supplier & CAPA). Standard modules (Activity/Comments/Attachments/Approval/Audit) are **later specs**. |
| Activity / Comments / Audit home | **Dedicated "Activity" tab** (not the rail). |
| Edit model | Existing inline-edit + `useAutoSave` auto-save pattern (CLAUDE.md), indicator relocated into the header. |
| Configurability | **The template must power every QMS entity for 5–10 years without forking** — simple reference entities through complex approval workflows. Achieved via a three-layer architecture (§3). Every region is optional and composable. |
| Tokens | **Frozen.** This spec uses existing tokens/utilities only. No new color/space/type/elevation tokens. |

---

## 2. Goals & non-goals

### Goals
- A single `BaseDetailLayout` shell that **every** detail module adopts — from a 3-field reference entity to a 12-tab approval workflow — **without forking the template**. This is the primary success criterion.
- A composition model (§3) where header, actions, tabs, rail, content regions, and responsive behavior are all **configurable and optional**, never module-specific.
- A **persistent, slot-driven context rail** that keeps record state visible on every tab — and is fully omittable for entities that don't need one.
- A **smart action bar** driven by a generic action descriptor (priority → primary / secondary / overflow), not hard-coded buttons.
- **Sticky header + sticky tabs** with scroll-aware chrome.
- Premium **loading skeleton, not-found, error, and empty** states.
- Full **keyboard + WCAG AA accessibility** and a defined **mobile→ultrawide responsive** behavior.
- Proven in **Storybook** with examples spanning the complexity range (simple entity, Supplier, CAPA) before any app change.

### Non-goals (this spec)
- The standard content modules themselves (Activity feed, Comments, Attachments, Approval, Audit history) — separate specs. v1 defines only their **slots/placement**.
- Migrating real pages — pilot migration is a follow-up after sign-off.
- Any design-token change.
- List / Create-Edit / Dashboard / Settings templates — later specs.

---

## 3. Composability & longevity architecture (the anti-fork contract)

The template must serve every QMS entity for the next decade without per-module forks. The mechanism is a **three-layer architecture** plus a small set of governing rules. Anyone building a new entity page picks the layer that fits and never copies the shell.

### 3.1 Three layers

| Layer | What it is | Who uses it |
| --- | --- | --- |
| **L1 — Headless core** (`useDetailLayout` composable) | State + behavior only: the loading/error/notFound/ready state machine, sticky header+tab offset math (one CSS var), responsive rail/tab-collapse breakpoints, action overflow bucketing, active-tab↔URL sync, rail-collapse persistence. **Zero markup, zero entity opinion.** | Power users building a bespoke layout; internally consumed by L2. |
| **L2 — Default composition** (`BaseDetailLayout`) | The batteries-included shell that 90% of entities use. Driven by **declarative descriptors** (`actions`, `tabs`) + **slots** for content + **capability flags** for structure. | Almost every detail page. |
| **L3 — Droppable primitives** (`DetailHeader`, `DetailActionBar`, `DetailTabs`, `DetailRail`, `BaseRailCard`) | The pieces `BaseDetailLayout` is assembled from, each usable standalone. | A complex page that needs a non-standard arrangement composes these directly instead of forking L2. |

The escape hatch is built in: if a page can't be expressed through L2's descriptors/slots, it drops to L3 primitives (still consistent, still themed) rather than hand-rolling — and if even that's too rigid, it builds on L1. **There is no scenario that requires copying the template.**

### 3.2 Governing rules

- **Slots for content, descriptors for behavior, flags for structure.** Content (what a tab shows, what's in the rail, the meta line) is always a slot. Behavior that the shell must reason about (action priority/overflow, tab order/visibility/counts) is a typed descriptor. Structural presence (rail? tabs? header?) is a capability flag.
- **Everything is optional.** No rail, no tabs, no actions, no breadcrumbs, no avatar are each independently valid. The shell degrades gracefully: zero tabs → render the default body slot with no tab bar; no rail → main spans full width; one action → no overflow menu.
- **No entity vocabulary in the API.** The shell knows "title, status slot, meta slot, actions, tabs, rail" — never "supplier", "code", "evaluate". Entity concepts live entirely in the consumer's slot content and descriptor data.
- **Additive evolution only.** New capabilities arrive as new optional descriptor fields / slots / flags with safe defaults — never as breaking changes to existing consumers. The descriptor types are versionable.
- **Scoped slots expose state, not internals.** Every content slot receives `{ state, isMobile, density, activeTab }` so consumers can react to layout state without reaching into the shell.

### 3.3 Descriptor models (the typed, behavior-driving config)

**Action descriptor** — the shell decides primary/secondary/overflow placement and responsive collapse from `priority`; the consumer never positions buttons manually:

```js
// actions: ActionDescriptor[]
{
  id: 'evaluate',
  label: 'Evaluate',
  icon: IconClipboardCheck,        // @tabler/icons-vue, imported by consumer
  variant: 'primary',              // 'primary' | 'secondary' | 'danger'
  priority: 100,                   // higher = more likely to stay out of overflow
  visible: () => canEvaluate.value,// predicate — hidden actions never reserve space
  disabled: () => isArchived.value,
  loading: () => isEvaluating.value,
  onSelect: () => openEvaluateDrawer(),
  // OR `to:` for nav, OR `menu:` for a split/dropdown action
}
```

**Tab descriptor** — order, lazy-mount, live counts, and per-role visibility are all data, so adding/removing a tab never touches the shell:

```js
// tabs: TabDescriptor[]
{
  value: 'documents',
  label: 'Documents',
  icon: IconFile,                  // optional
  count: () => docCount.value,     // optional live badge
  visible: () => isAllowed(['documents:read']), // optional — gated tabs
  lazy: true,                      // mount panel on first activation
}
```

**Rail** is a slot by default (`#rail` → stacked `BaseRailCard`s). A descriptor-driven rail (`railCards: RailCardDescriptor[]`) is an *optional* convenience for the common Properties/People/Dates shape; the slot always wins when both are present.

### 3.4 Capability flags & structural props

| Prop | Default | Effect |
| --- | --- | --- |
| `rail` | `true` if `#rail`/`railCards` present, else `false` | Show/omit the context rail; when off, main spans full width. |
| `tabs` | `[]` | Empty → no tab bar; the default slot renders as the sole body. |
| `density` | inherits app density | `comfortable` \| `compact` — consumes the existing density system; the shell does not define it. |
| `width` | `standard` | `narrow` \| `standard` \| `wide` \| `full` — inherited from `BasePage`. |
| `headerVariant` | `full` | `full` (avatar+title+meta+actions) \| `compact` (title+actions only — for simple entities). |
| `stickyHeader` / `stickyTabs` | `true` | Allow opting out of sticky behavior for short pages. |

### 3.5 Complexity range it must cover (validated in Storybook)

| Entity shape | How the one template expresses it |
| --- | --- |
| **Simple reference** (e.g. an Option Set: name + a few fields, no workflow) | `headerVariant="compact"`, `tabs=[]`, `rail=false` → just header + a single body slot. No fork. |
| **Standard record** (e.g. Supplier) | Full header, 6–8 tab descriptors, slot rail with Properties/People/Dates/Related. |
| **Complex workflow** (e.g. CAPA / Audit with approvals, sub-records, gated tabs) | Full header, action descriptors incl. an approval split-action, role-gated `visible()` tabs with live counts, rich rail + an approval-status region, an Activity tab. Still L2; nothing bespoke. |
| **Truly exotic** (a future entity with a non-standard arrangement) | Drops to L3 primitives (`DetailHeader` + custom middle + `DetailRail`) — consistent, themed, still no copy of the shell. |

---

## 4. Anatomy

The diagram below shows the **standard-record configuration** (full header + tabs + rail). It is one composition of the §3 layers, not a fixed shape — the same shell also renders the compact (no tabs/no rail) and complex-workflow configurations from §3.5. Every zone here maps to an optional flag/slot/descriptor.

```
┌─ Top bar (PageHeader teleport): Suppliers / Acme Corp ───────────────────┐   Zone 1
├──────────────────────────────────────────────────────────────────────────┤
│ ▣ Acme Corp   ● Active            [Evaluate ▾] [Archive] [⋯]   Saved ✓     │   Zone 2 (sticky)
│ code · Supplier · updated 2d ago                                           │
│ Overview  Company Profile  Locations  Documents  Activity  …               │   Zone 3 (sticky)
├───────────────────────────────────────────────┬──────────────────────────┤
│                                                │  PROPERTIES               │
│   Active tab content                           │  Owner    …               │   Zone 4
│   (PageSection / BaseCard groups)              │  Status   ●               │
│                                                │  Type     …               │
│                                                │  ─────────────            │
│                                                │  PEOPLE                   │
│                                                │  DATES / LIFECYCLE        │
│                                                │  RELATED RECORDS          │
│                                                │  QUICK ACTIONS            │
│              main  minmax(0,1fr)               │      rail  ~340px         │
└────────────────────────────────────────────────┴──────────────────────────┘
```

### Zone 1 — Top bar (unchanged)
Breadcrumb trail teleported into the app bar via `PageHeader` (existing mechanism). No change.

### Zone 2 — Sticky header
- **Identity row**: entity icon/avatar · inline-editable title (`useAutoSave`) · key status badge(s) (entity `XBadgeById`/`XSelectMenu`) · muted meta line (`code · type · "updated {relative}"`).
- **Smart action bar** (right-aligned): exactly **1 primary** (filled `BaseButton`) + up to **2 secondary** (outline) + a `⋯` **overflow `BaseMenu`** for the remainder. The save-state indicator ("Saving…/Saved ✓/error") lives here.
- **Scroll-aware chrome**: a subtle bottom border/`shadow-raised` appears **only after scroll** (`useScroll` from VueUse on the body scroll region).

### Zone 3 — Sticky tabs
- `BaseTabs` (existing — already ARIA `tablist`/`tab`/`tabpanel`, roving tabindex, Arrow/Home/End).
- **Horizontally scrollable** on overflow (no wrap); active tab auto-scrolls into view.
- Optional **per-tab count badge** (e.g. `Documents 12`) via a tab-item `count` field.
- Active tab persists to the URL query (`?tab=…`) — existing pattern in `SuppliersPageId`.

### Zone 4 — Two-column body
- CSS grid `grid-template-columns: minmax(0, 1fr) 340px` with a token-driven gap; main is `minmax(0,1fr)` so tables inside can scroll without blowing out the grid.
- **Main**: the active tab's content (the consumer's tab panels). Content uses `PageSection`/`BaseCard` for grouping.
- **Context rail** (right): `position: sticky; top: <header+tabs height>`; its own overflow if it exceeds the viewport. **Persists across every tab.** Slot-driven stack of `BaseRailCard`s; each card optional.

#### Rail card catalogue (recommended composition, all optional)
| Card | Built from | Holds |
| --- | --- | --- |
| **Properties** | `BaseDescriptionList` | owner, status, type, key ids, classification |
| **People** | `BaseAvatar` group | owner, approver, watchers |
| **Dates / lifecycle** | `BaseDescriptionList` | created, updated, due, next review |
| **Related records** | links + counts | linked CAPAs / NCs / documents / audits |
| **Quick actions** | `BaseButton` list | secondary verbs not in the top action bar |

The rail is **pure slots** — `BaseDetailLayout` ships the `#rail` slot and the `BaseRailCard` primitive; pages assemble the cards they need. No card is mandatory.

---

## 5. States (all first-class)

| State | Behaviour |
| --- | --- |
| **Loading** | A **skeleton mirroring the layout**: header bar skeleton (avatar + title + 2 action chips), tab strip skeleton, main content blocks, and rail-card skeletons. Replaces the centered `BaseSpinner`. Uses existing `BaseSkeleton`. |
| **Not found** | `BaseStatusState`/`BaseEmptyState` not-found (existing `BaseDetailPage` contract preserved: `notFound`, `notFoundTitle`, `notFoundIcon`). |
| **Error** | `BaseStatusState` error variant (load failure distinct from not-found). New `error` prop. |
| **Empty tab / empty rail card** | Each tab panel and each rail card renders its own empty state (consumer-provided), so an empty section reads as intentional, not broken. |

---

## 6. Responsive strategy

No horizontal **page** scroll at any width; only bounded table wrappers scroll.

| Breakpoint | Behaviour |
| --- | --- |
| **≥1280 (desktop / wide / ultrawide)** | Two columns; rail 340px; sticky header + tabs. On ultrawide, `BasePage width="wide"` caps content width — the layout does not stretch edge-to-edge. |
| **1024–1280 (laptop)** | Rail narrows to ~300px. |
| **768–1024 (tablet)** | Rail **stacks above** the main content as a **collapsible "Details" summary** (key Properties first, other cards collapsed). Tabs scroll horizontally. Single content column. |
| **<768 (mobile)** | Single column. Header compresses to **icon + title + status + primary action**; secondary/overflow collapse into `⋯`. Rail becomes a **collapsible "Details" panel** pinned at the top of the content (key Properties visible, rest expandable). Tabs are a horizontally scrollable strip. Touch targets ≥44px. |

Breakpoints map to the project's existing Tailwind breakpoints; the rail-collapse boundary is a single documented value reused by the template and its examples.

---

## 7. Interaction & micro-interactions (subtle, usability-first)

- **Scroll-aware header**: border/shadow fades in only once the body scrolls (not at rest).
- **Tab switch**: instant content swap, no heavy transition — keyboard-first feel.
- **Inline edit / auto-save**: title and rail properties edit in place via `useAutoSave`; the header shows `Saving… / Saved ✓ / error`.
- **Rail cards**: collapsible; collapsed/expanded state remembered per card (e.g. `useStorage`), so a user's preferred rail shape persists.
- **Reduced motion**: all transitions honour `motion-reduce:*` (project convention; no motion tokens needed).
- **Sticky offsets**: tabs stick directly beneath the header; the rail's sticky `top` equals header+tabs height so nothing overlaps.

---

## 8. Component architecture

Mirrors the three-layer model from §3 — each layer is shippable and independently testable.

### New components & composable
| Layer | Unit | Responsibility | Composes / reuses |
| --- | --- | --- | --- |
| L1 | **`useDetailLayout`** (composable) | State machine (loading/error/notFound/ready), sticky-offset CSS var, responsive breakpoint state, action-overflow bucketing, active-tab↔URL sync, rail-collapse persistence. No markup. | `useScroll`, `useStorage`, `useRoute`/`useRouter` |
| L2 | **`BaseDetailLayout`** | The default shell: composes the L3 primitives, wires `useDetailLayout`, accepts `actions`/`tabs` descriptors + slots + capability flags, owns all four states. | L1 + all L3 primitives + `BasePage(fullHeight)`, `BaseSkeleton`, `BaseStatusState`/`BaseEmptyState` |
| L3 | **`DetailHeader`** | Identity row (avatar/icon/title/meta slots) + sticky/scroll-aware chrome. `full`/`compact` variants. | `PageHeader`, `BaseAvatar` |
| L3 | **`DetailActionBar`** | Renders an `ActionDescriptor[]` → primary/secondary/overflow with responsive collapse. | `BaseButton`, `BaseMenu` |
| L3 | **`DetailTabs`** | Renders a `TabDescriptor[]` → sticky, overflow-scrollable, counts, visibility, lazy mount, URL sync. | `BaseTabs` |
| L3 | **`DetailRail`** | The sticky rail region; renders `#rail` slot or `railCards` descriptors; owns responsive collapse to top "Details". | `BaseRailCard` |
| L3 | **`BaseRailCard`** | A collapsible, titled card sized for the rail. | `BaseCard`, optional `BaseSectionHeader` |

`BaseDetailLayout` **supersedes** `BaseDetailPage`'s role. `BaseDetailPage` is left intact and its consumers migrate incrementally; it is not deleted in this spec.

### Public API (`BaseDetailLayout`)
Per §3.2: **slots for content, descriptors for behavior, flags for structure.** All scoped content slots receive `{ state, isMobile, density, activeTab }`.

| Kind | Name | Purpose |
| --- | --- | --- |
| Slot | `#identity` (or `title`/`icon` props + inline-edit) | identity row content |
| Slot | `#meta` | the muted sub-line under the title |
| Slot | `#tab-{value}` (or `#default` when no tabs) | per-tab panel content |
| Slot | `#rail` | the stacked `BaseRailCard`s (wins over `railCards` if both set) |
| Slot | `#loading` / `#notFound` / `#error` | override the default state renderings |
| Descriptor | `actions: ActionDescriptor[]` | drives `DetailActionBar` (placement/overflow computed from `priority`) |
| Descriptor | `tabs: TabDescriptor[]` | drives `DetailTabs` (order, counts, `visible`, `lazy`, URL sync) |
| Descriptor | `railCards: RailCardDescriptor[]` | optional convenience rail for the common Properties/People/Dates shape |
| Flag | `rail` / `density` / `width` / `headerVariant` / `stickyHeader` / `stickyTabs` | structural toggles (defaults in §3.4) |
| State prop | `loading` / `notFound` / `error` | drive the state machine |
| Inherited | `breadcrumbs` / `width` / `fullHeight` | from the `BaseDetailPage`/`BasePage` contract |

### Data rules (CLAUDE.md compliance)
- Tab-panel children and rail-card children receive an **`id`** and query/mutate via `useLiveQuery`/`useLiveMutation` — **no full-object props** (fixes the current `:supplier="supplier"` drilling).
- Inline edits use `useAutoSave` + `instance.save()`; errors surfaced in the header.
- In **Storybook**, examples feed **static mock data** through the slot/prop contract (no live syncEngine). The template itself is data-agnostic — it takes slots, not queries.

---

## 9. Storybook deliverable (the actual output of v1)

Story set **`Templates/Detail Page`**, all CSF3 + `autodocs` + `addon-a11y`, built on the existing `.storybook` plumbing. The story set **must prove the anti-fork claim (§3.5)** — the same `BaseDetailLayout` rendering the full complexity range from identical primitives:

1. **Anatomy** — labeled zones + the three-layer model (docs page).
2. **Simple entity** (e.g. Option Set): `headerVariant="compact"`, no tabs, no rail — proves graceful degradation to header + single body.
3. **Supplier — standard record** (desktop): full header, 6–8 tab descriptors incl. an **Activity** tab, slot rail (Properties/People/Dates/Related/Quick actions), mock data.
4. **CAPA — complex workflow**: action descriptors incl. an approval split-action, role-gated `visible()` tabs with live counts, rich rail + approval-status region — proving the same shell handles workflow depth.
5. **L3 composition** — one story assembling `DetailHeader` + custom middle + `DetailRail` directly, proving the escape hatch stays consistent without forking.
6. **Variants**: rail on/off; few vs many tabs (overflow scroll); with/without per-tab counts; `comfortable` vs `compact` density.
7. **States**: loading skeleton; not-found; error; empty rail cards; empty tab.
8. **Responsive**: viewport stories at mobile / tablet / laptop / desktop / ultrawide showing rail collapse + header compression.

Acceptance for v1 = these stories exist, `build-storybook` is green, `addon-a11y` shows no violations on the primary stories, the simple/standard/complex examples all run on the **same unmodified `BaseDetailLayout`**, and the examples are reviewed and approved in Storybook.

---

## 10. Accessibility checklist (WCAG AA)

- Header is a landmark; tabs use the existing `BaseTabs` ARIA (`tablist`/`tab`/`tabpanel`, roving tabindex, Arrow/Home/End).
- Action bar items are real `<button>`s; overflow is a `BaseMenu` (menu/menuitem roles, keyboard nav).
- Inline-edit title is keyboard-operable (Enter to edit/commit, Esc to cancel) and labelled.
- Rail cards: collapse toggle is a `<button>` with `aria-expanded`/`aria-controls`; card has a heading.
- Sticky regions do not trap focus or hide focused content behind them (scroll-into-view accounts for sticky offsets).
- Contrast: uses existing AA-checked tokens only.
- Focus-visible ring on every interactive element (existing global rule).
- Respects `prefers-reduced-motion`.

---

## 11. Migration (after Storybook sign-off — not in v1)

1. Pilot: `SuppliersPageId` → `BaseDetailLayout` (rail = Properties/People/Dates/Related; Activity tab placeholder).
2. Then: Non-Conformance → CAPA → Audit → Equipment → Documents → Training.
3. Each migration is auth-gated — eyeball per page on the running app before merge (per project memory: verify by running, not just building).
4. `BaseDetailPage` retired only once all consumers move; guard with `lint:layout`.

---

## 12. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **Over-configuration / API-surface bloat** (the inverse failure: so many props/slots the template is unlearnable) | The descriptor types are small and fixed (§3.3); structure is a handful of flags with sensible defaults (§3.4); 90% of pages touch only `actions`, `tabs`, and the `#rail` slot. Complexity lives in L3 primitives, not in L2's surface. Each new capability must justify itself as additive with a safe default. |
| Rail crowds out main content on data-heavy tabs | Rail is fixed at 340px and persists on every tab (by design); main uses `minmax(0,1fr)` so wide tables scroll within their own bounds rather than expanding the grid. |
| Sticky header + sticky tabs + sticky rail offset miscalculation | Single source-of-truth CSS var for header+tabs height (owned by `useDetailLayout`); rail `top` and tab `top` derive from it. |
| Template diverges from real syncEngine data shapes | Examples across the complexity range (simple, Supplier, CAPA) modeled on actual fields; pilot migration validates against live data before broad rollout. |
| A future entity needs an arrangement L2 can't express → temptation to fork | The L3 primitives + L1 composable are the sanctioned escape hatch; §3.5's exotic row and the L3 Storybook story prove a non-standard layout stays consistent without copying the shell. |
| Scope creep into modules | Modules explicitly deferred; v1 ships only slots + placement. |

---

## 13. Out of scope → follow-up specs

- Standard modules: `ActivityTimeline`, `Comments`, `Attachments`, `ApprovalStatus`, `AuditHistory`.
- List Page, Create/Edit Form, Dashboard, Settings templates.
- Right-context-panel reuse outside detail pages (e.g. on list pages).
- Pilot and full migration of real detail pages.
