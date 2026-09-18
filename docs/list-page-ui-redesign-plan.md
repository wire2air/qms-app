# List-Page UI Redesign — Diagnosis & Plan

> Goal: make the list-page experience (Nonconformances as the flagship) feel like a world-class enterprise product (Linear / Atlassian / Azure Portal), and fix it at the **base-component layer first** so all 31 list pages improve at once — not page-by-page.

## Part 1 — Why it looks "ugly" (root-cause diagnosis)

Grounded in the actual components, not the layout:

### A. The form-control atoms are unstyled / inconsistent (the biggest offender)
- **Select triggers are bare badges.** `BaseSelectMenu`'s trigger (when nothing is selected) renders the placeholder inside a plain `BaseBadge` (`BaseSelectMenu.vue:255`). There is **no input chrome** — no consistent border, background, height, focus ring. So "— All statuses —" floats as thin grey text + a chevron. It reads as unfinished, not as a control.
- **Em-dash placeholders.** The convention `— All statuses —` / `— Select —` (`BaseSelectMenu.vue:21`) is dated and visually noisy. Enterprise apps say `Status` / `All statuses` / `Any`.
- **Native date inputs.** `DateRangeFilter` uses raw `<input type="date">` (`dd/mm/yyyy` + the browser's native calendar glyph) via `BaseTextInput type="date"`. Native controls never match a design system — different height, font, focus, icon. This is the most jarring control on the page.
- **No shared control height/shape.** Search input, select triggers, date inputs, and buttons don't share a height (≈36px), radius, border color, or focus treatment — so a row of them looks misaligned and "thrown together."

### B. Colour over-saturation (too many filled pills)
- Every table cell is a **solid filled badge** — Type = red, Status = blue, Severity = amber. Three saturated pills per row × 50 rows = visual noise with no calm baseline, so nothing reads as important. "Customer Return" in red implies danger when it's just a category.
- Fix belongs in the **badge components** (calm by default, strong colour reserved for genuinely important states), not per-cell overrides.

### C. Weak surface & hierarchy contrast
- KPI strip, toolbar, and table sit on near-identical light surfaces with hairline borders. Everything is low-contrast grey-on-white, so the eye has no anchor. We need deliberate elevation/spacing tiers (page → toolbar → table) rather than uniform cards.

### D. Density & rhythm (largely addressed in pass 1)
- Oversized KPI cards (fixed → `BaseStatStrip`), airy rows (fixed → compact default), horizontal overflow (fixed → dropped redundant column). Remaining: tune row height, header weight, alignment.

### E. Missing "workspace" affordances
- No inspector/preview (every click navigates away), no row selection/bulk, no sticky table header, no saved views. These are what make Linear/Azure feel productive vs. an admin CRUD list.

**Conclusion:** the page-level structure is now reasonable; the *perceived* ugliness is dominated by **A (control atoms)** and **B (badge saturation)** — both base-component problems. Fix those first and every list page benefits.

---

## Part 2 — The plan (base → composite → page → workspace)

Ordered so the highest-leverage, root-cause fixes land first.

### Phase A — Base form controls *(fix the atoms; highest leverage)*
- **A1. `BaseSelectMenu` trigger chrome.** Give the default trigger real control chrome: fixed height (≈36px / `sm` 32px), `border-divider`, `bg-card`, hover, `focus-visible` ring, chevron right-aligned, truncation. When a value is selected, still render the entity badge *inside* the control (not as the control). Add a `variant`: `control` (bordered, for toolbars/forms) vs `inline` (current bare, for table cells).
- **A2. Retire em-dash placeholders.** Default `nullLabel` → `All` / per-wrapper `All statuses`, `Any severity`, etc. One-line change per wrapper + the shared default.
- **A3. `BaseDatePicker` + `BaseDateRangePicker`.** Replace native `<input type="date">` with a styled trigger (matches A1) opening a `v-calendar` popover (already in the stack). `DateRangeFilter` consumes it. Localised display via `dt.formatDate()`.
- **A4. Control-height alignment.** Define one control height and apply across `BaseTextInput`, `BaseSelectMenu`, `BaseButton`, date picker so any toolbar row aligns perfectly. (Token, not magic numbers.)

### Phase B — Calmer visual language *(badges)*
- **B1. `BaseBadge` variants.** Add `tone`: `soft` (default — tinted bg, readable text), `solid` (reserved), `outline`, `subtle` (grey). Default everything to `soft`.
- **B2. Re-map the Nc badges.** Status → soft, with **solid colour only** for genuinely urgent states (e.g. Overdue/Rejected). Type → neutral/subtle (it's a category, not a severity). Severity → dot + text (already a dot on the title). Result: calm rows, colour means something.

### Phase C — Toolbar & surface polish *(composite)*
- **C1. Filters popover** refinement: header, grouped controls (now styled via A), sticky "Clear all" footer, optional "Apply".
- **C2. Active-filter chips** restyled to the calm badge language; consistent remove affordance.
- **C3. Surface hierarchy:** define the page → toolbar → table elevation/spacing recipe (subtle shadow on the table, flat toolbar on page bg, generous section spacing). Apply via `BaseListLayout` so all pages inherit it.

### Phase D — The data table *(the heart)*
- **D1.** Sticky header (have) + **sticky first column** (NC #) on horizontal scroll.
- **D2.** Refined row hover, **row selection + bulk-action bar** (wire `BaseListLayout`'s existing selection), **row actions revealed on hover**.
- **D3.** Typography hierarchy (title = primary; NC#/dates = secondary mono), tuned row height, divider/zebra treatment, clickable title (have).

### Phase E — Signature workspace features
- **E1. Inspector panel (B4).** Row-click opens a **right-hand preview panel** (resizable, keyboard-navigable) instead of navigating away — the single biggest "premium workspace" win. Falls back to full detail page via a button. Reusable `BaseInspector` + `useResizablePane`.
- **E2. Saved Views (D6) + Column Manager in toolbar (D8).** Named filter/column presets; persisted.

### Phase F — Shell & responsive
- **F1. Sidebar polish:** active-state treatment, group spacing/labels, icon alignment, **mini/icon mode**, collapse behavior — Linear/Azure-grade.
- **F2. Header context:** breadcrumb (wire B7) + count (have) + saved-view switcher + primary actions.
- **F3. Per-breakpoint:** desktop (rail + table + inspector), laptop (inspector auto-collapse), tablet (inspector → overlay, filters → sheet), mobile (rows → cards, toolbar → compact, filters → bottom sheet). Not just stacking.

---

## Part 3 — Sequencing & leverage

| Phase | Effort | Leverage | Notes |
| --- | --- | --- | --- |
| **A. Control atoms** | M | ★★★ all inputs everywhere | Fixes the exact thing the screenshots point at |
| **B. Calm badges** | M | ★★★ all badges everywhere | Biggest "calmer" win; touches detail pages too (verify) |
| **C. Toolbar/surfaces** | S | ★★ all list pages | Mostly in `BaseListLayout` |
| **D. Table** | M | ★★ all tables | In `BaseTable` |
| **E. Inspector + saved views** | L | ★★ flagship feel | Net-new framework pieces |
| **F. Sidebar + responsive** | L | ★★ whole app | Largest surface |

**Recommended order: A → B → C → D → E → F.** A and B are base-component fixes that instantly lift all 31 migrated pages; do them first. Each phase: TDD where logic exists, Storybook story, `lint:layout`/`lint:ds` green, then a screenshot checkpoint with you before moving on.

**Definition of done per phase:** build + unit tests + `lint` green, Storybook updated, and a screenshot review. No phase merges without your eyeball.
