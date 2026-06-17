# Qability Design System — Canonical Roadmap (v2)

> Single ordered backlog for the `Base*` design-system. Reordered to **enterprise priority** per review feedback, then reconciled with codebase reality.
> Evidence + per-component scores: [design-system-audit.md](./design-system-audit.md). Typography design: §13 there.
>
> **Effort:** S ≈ <½ day · M ≈ 1–2 days · L ≈ 3–5 days · XL ≈ multi-batch sweep.
> **Status:** ⬜ todo · ✅ done.

---

## What changed from v1 (and why)

1. **Design Tokens elevated to Phase 1** (before Typography) — ✅ correct; foundation first.
2. **Storybook introduced in Phase 1** — ✅ every component built after gets a story + a11y check.
3. **Theme/CSS-variable system made part of the foundation** — ✅ for future white-label/multi-tenant.
4. **Reality corrections:**
   - Tokens stay **CSS variables (Tailwind v4 `@theme`)**, *not* `.ts` files — this is a **pure-JS project** (0 `.ts`, no tsconfig) and CSS vars are the idiomatic token layer (the shadcn model). A parallel TS token set would be a second, drifting source that doesn't feed Tailwind utilities.
   - **Light/dark theme already exists** (`.dark` wired in `tokens.css` + `base.css`). Foundation work = add **brand/tenant** overrides, not rebuild theming.
   - **"Replace Libraries" is not a build phase** — it's a decision table (below). Most swaps are declined: keep `v-calendar` (18 consumers), keep `@tabler/icons-vue` (371 files + CLAUDE.md rule #2), `@floating-ui/dom` + VueUse already installed. Only `vee-validate` vs `Vuelidate` (16 files) is a real *evaluation*.
   - **App-wide refactor moved to the end** — you can't sweep raw markup → components until the components are hardened. Build primitives first, sweep last.
   - Many "core components" **already exist** — those phases are *harden + fill gaps*, not *build from scratch*.

---

## Library strategy (decision table — settle once, no build phase)

| Concern | Decision | Why |
|---|---|---|
| Date/calendar | **Keep `v-calendar`** (wrap cleanly) | 18 consumers on a `DateTime` contract; swapping to VuePic = high risk, no gain |
| Icons | **Keep `@tabler/icons-vue`** | 371 files; CLAUDE.md rule #2 mandates it |
| Floating/positioning | **Standardize on `@floating-ui/dom`** (installed) | already the BasePopover engine; reuse for Tooltip |
| Utilities | **Standardize on `@vueuse/core`** (installed) | already standard |
| Overlay primitives | **Standardize on `@headlessui/vue`** (installed, underused) | use `Combobox`/`Menu`/`Listbox` (Phase 5) |
| Markdown | **`marked` + `dompurify`** (installed); drop `micromark` | one lib, sanitized |
| Validation | **Evaluate** `vee-validate`(+`zod`) vs staying on `Vuelidate` (16 files) | real migration + new dep — deliberate decision, not a casual swap |
| Charts (new) | **Add `apexcharts` (lazy)** or `chart.js` | none installed yet; lazy-load per report route |
| Virtual scroll (new) | **Add `@tanstack/vue-virtual`** when tables exceed page cap | headless, tiny, active |

---

## Phase 0 — Foundation Cleanup  ✅ DONE (editor lazy-load deferred)  `S–M` · risk: low

- [x] Deleted dead components `Loader.vue`, `BaseDateTimeDropMenu` (verified 0 consumers). **`BaseDateTimePicker` kept** — used by `DynamicForm.js` (folds into Phase 5).
- [x] Deleted dead composables `forwardRef.js` / `render.js` / `props.js`. Kept `validator.js`.
- [x] Deleted dead tokens `--space-*` / `--height-*`.
- [x] `WIcon` → `IconCalendar`; `BaseChip` size branch; `BaseToast` class-order; `BasePopover` dead `show`; `BaseTextarea` dead `type`; `BasePhoto` object-URL leak.
- [x] Dropped `micromark` → `marked`+`dompurify` (sanitized).
- [x] Dev-gated editor `console.warn`; **de-Quasared editor styles** (`--q-*` → project tokens — see Dark-mode below).
- [x] Bundle baseline captured (build green; top chunk `vendor-editor` 535 KB / 177 KB gz).
- [ ] **DEFERRED — Lazy-load `BaseRichTextEditor`** (the 535 KB chunk). Held for a browser smoke-test (`defineAsyncComponent` ref/expose forwarding across 23 call sites).

**Goal:** clean, measured codebase.

## Phase 0.5 — Dark-mode hardening (cross-cutting)  ✅ DONE  `S` · risk: low

> Fixed at the common-component layer (so all usages benefit). Found via smoke-testing.
- [x] `BaseTextarea` theme-aware chrome (was inheriting forms-plugin gray border).
- [x] `BaseBadge` entity select triggers — theme-aware fill + `text-on-main` (status/colored triggers untouched).
- [x] Rich-text editor de-Quasared (`--q-background→--sidebar` etc.; content was white in dark).
- [x] `VDatePicker` `:isDark` binding (v-calendar dark theme; calendar numbers were invisible).
- [x] **`color-scheme: light/dark`** in `base.css` — native date/time inputs + their picker, native `<select>`, scrollbars now render dark.
- [x] `fix(suppliers)`: `lastEvaluationDate` → `DateTime` (pre-existing `formatDate` crash).

## Phase 1 — Design Tokens + Theme + Storybook (Foundation)  ⬜  `M–L` · risk: low ⭐

The foundation everything else consumes. **CSS variables, not `.ts`.**

- [ ] **Tokens:** rationalize `tokens.css` + `base.css @theme` into the single source of truth. Finalize: spacing (wire or delete `--space-*`), control heights (wire `--height-*` → `tw:h-btn` or delete), radius (keep Tailwind-governed), elevation/shadows (already wired), z-index scale (add — currently ad-hoc), animation/duration tokens (add).
- [ ] Document the token contract (one MD table: token → value → utility → usage).
- [ ] Optional **generated `tokens.js`** (reads CSS vars) for JS consumers only (chart colors, canvas). Not hand-maintained; CSS stays canonical.
- [ ] **Theme:** light/dark already wired ✅ → add **brand/tenant** layer: `[data-tenant]` scoped overrides of `--primary`/brand vars (white-label hook). Document how a tenant overrides tokens.
- [ ] **Storybook 8 (`@storybook/vue3-vite`) + `addon-a11y`** stood up; CI builds it. (Optional: Chromatic for visual regression later.)

**Goal:** one place to change any visual decision; tooling to see every component.

## Phase 2 — Typography Foundation  ✅ DONE (components)  `M` · risk: low

> Built + committed. `BaseLabel.help` uses a native `title` until `BaseTooltip` lands in Phase 5.

- [x] `typography/typography.js` variant→token map (wired `--text-*` + semantic colors) + `overline` variant.
- [x] `BaseHeading` (semantic `level` + visual `as`), `BaseText`, `BaseCaption`, `BaseLabel`, `BaseHelperText`, `BaseErrorText` — 25 unit tests, eslint clean.
- [ ] Stories (deferred to Phase 1 Storybook setup).
- [ ] Retire `.ds-label`/`.ds-label-sm` utilities → tracked as a Phase 7 Bucket-B follow-up.

## Phase 3 — BaseField  ✅ DONE  `M–L` · risk: medium ⭐

The enterprise field wrapper — `<BaseField label required hint error><BaseInput/></BaseField>`.

- [x] `BaseField` composes `BaseLabel`+`BaseHelperText`+`BaseErrorText`; owns generated `id` + `for`/`aria-describedby`/`aria-invalid` (+ `id` prop on `BaseTextInput`). 8 unit tests.
- [x] `BaseTextInput`/`BaseTextarea` → `defineModel`; stable id wired to `<label for>` ↔ input id; `aria-invalid`/`aria-describedby` + error routed through `BaseErrorText` (`role=alert`). 6 unit tests.
- [x] `focus-visible` ring (BaseCheckbox peer-focus, BaseSwitch → primary) + `motion-reduce` (BaseSpinner, BaseSkeleton) + skeleton dark-mode bg.
- [ ] Stories (deferred to Phase 1 Storybook setup) + visual a11y check on dev server.

## Phase 3.5 — Composition / layout primitives (whole-app sweep)  🚧 IN PROGRESS  `M–L` · risk: low

> The `PageHeader`/`BaseLabel` tier — **compositions of primitives** that DRY copy-pasted page/layout markup across all 770 `.vue` files. Evidence + full list: audit [§15](./design-system-audit.md). Tier-1 (cheap, high-frequency, unblock the scaffolds) built first, with unit tests.

- [x] **`BaseDetailField`** — read-only label-over-value pair (`—` fallback; not a `<label>`). 68-file pattern. 7 tests.
- [x] **`BaseDialogFooter`** — standardized Cancel/Submit footer (loading/disabled/inline-error). ~118 dialogs. 6 tests.
- [x] **`BaseFormDialog`** — `BaseDialog` + body + footer preset for create/edit dialogs. ~50–60 dialogs. 3 tests.
- [x] **`BaseSectionHeader`** — title (+icon/subtitle) + actions card/section header. ~100+ blocks. 6 tests.
- [x] **`BaseTabs` / `BaseTabPanel`** — accessible tabs (role=tablist/tab/tabpanel, roving tabindex, Arrow/Home/End). 14 hand-rolled bars, 0 ARIA. 9 tests. (Also closes the §3 `BaseTabs` gap.)
- [ ] **Tier-2:** `BaseDescriptionList`/`BaseDescriptionItem` (`<dl>` metadata, ~20–30), `BaseListPage` (39+ `*Home.vue`), `BaseDetailPage` (30+ `*PageId.vue`), `BaseFieldRow` (~30).
- [ ] **Tier-3:** `BaseQuickFilterPills` (3), `BaseAuditTrailRow` (~15–20).
- [ ] **Adoption gaps (no new component):** finish `PageHeader` rollout (32 raw title / 55 raw actions — gated on `BaseDetailPage`); migrate `EquipmentHome`/`FormAssignmentsHome` off raw `<select>` → `BaseFilterBar`; consolidate ~84 hand-rolled delete dialogs onto `useConfirm`.
- [ ] Stories + a11y for each (deferred to Phase 1 Storybook setup).

## Phase 4 — Core Controls: harden + fill gaps  ⬜  `L` · risk: medium

> Most exist — this is **hardening + BaseField integration + a11y**, plus the few genuinely new.
- [ ] Harden existing: `BaseButton`, `BaseTextInput`, `BaseTextarea`, `BaseSelectMenu`, `BaseCheckbox`, `BaseSwitch`, `BaseDatePicker`, `BaseOptionGroup` (fix `readonly≡disabled`, add `radiogroup`).
- [ ] Fix rule-#8 violations: `BaseBadge` (clear/selectable), `BaseSwitcher`, `BaseStepper`, `BaseTable` rows/sort, `BaseUploader` dropzone.
- [ ] **New:** `BaseRadio`, `BaseAutocomplete` (Combobox-based).
- [ ] Stories + a11y for each.

## Phase 5 — Overlay Components (a11y headline)  ⬜  `L` · risk: medium ⭐

> Moved *before* the app-wide refactor — the sweep depends on these.
- [ ] Rebuild `BaseSelectMenu` on HeadlessUI **`Combobox`**, `BaseMenu` on **`Menu`** (free roles/keyboard/focus). Move auto-select logic out of the primitive.
- [ ] Reduce `BasePopover` to a positioner; de-dupe portal branches; default `flip:true`.
- [ ] **New:** `BaseTooltip` (floating-ui), `BaseDrawer` (BaseDialog variant). `BaseDialog` already strong — add `ariaLabel`/`initialFocus`.
- [ ] Normalize toast taxonomy (`positive/negative` → `success/error`); rename `ConfirmDialog` → `BaseConfirmDialog`; fix live-region placement.

## Phase 6 — Data Components  ⬜  `L–XL` · risk: low–med

- [ ] `BaseTable`: skeleton loading + `manual`/server mode (fixes pagination correctness) + `scope`/`aria-sort` + virtualization hook (`@tanstack/vue-virtual`).
- [ ] **New:** `BasePagination` (extract from table), `BaseStatCard`, `BaseCard`, unified `BaseStatusState` (empty/error/success/not-found).
- [ ] Merge `BaseChip` → `BaseBadge`; extract `BaseRailItem` behind `BaseStepper`+`BaseTimeline`; `BaseBreadcrumbs` → `nav/ol/aria-current`.
- [ ] Stories + a11y.

## Phase 7 — App-Wide Refactor / Sweep  🚧 IN PROGRESS  `XL` · risk: medium

> **Label/eyebrow/heading sweep LARGELY DONE** — ~380 raw `<label>` → `BaseField`, section eyebrows → `BaseText overline`, small section headings → `BaseText as=hN`, across ~22 domains + `src/pages` (NC, suppliers, qcInspection, documents, customerComplaints, inspectionsLogs, capas, workflow, changeRequests, formTemplate, equipment, formAssignment, company, groups, users, roles, form, form-builder, editor, taskInstance, records, products, auth, audits, rcaTemplate, …). Every commit lint-clean; ~155 `<label>` remain, all intentional leaves (below).
- [x] Raw `<label>` field blocks → `BaseField`; eyebrows → `BaseText overline`; small headings → `BaseText`.
- [ ] **Bucket B follow-up — retire `ds-label`/`ds-label-sm` → `BaseLabel`** (~20 labels; mostly suppliers cards). Cosmetically fine today (already a DS utility); converting unifies on `BaseLabel`.
- [ ] **Bucket B follow-up — read-only field captions → `BaseCaption`** (~95: `<label>`/`<div class="text-xs text-secondary">` above read-only values, inline-edit grid cells, composite-control captions; mostly suppliers / documents / detail-page rails).
- [ ] _Intentional leaves (do NOT convert):_ ~25 checkbox/switch/radio-wrapping `<label>`s; `<th>` table headers; `BaseCheckbox`-nested question labels.
- [ ] Replace raw `<select>`/`<input>`/clickable `<div>` → hardened Base controls (after Phase 4/5).
- [ ] Retire the ~417 `text-[Npx]` magic numbers (separate token task; heading/label-related ones already folded into the sweep above).
- [ ] **CI guardrail:** fail on `text-[\d+px]` and on raw `<label` / `<h[1-6]` in `src/` outside DS components.

## Phase 8 — Advanced Components  ⬜  `XL` · risk: med (mostly lazy-loaded)

- [ ] `RichTextEditor` (lazy, de-Quasar — relocate out of Base layer), `BaseFileUpload`/`useFileUploader`, image cropper, **Charts** (apexcharts, lazy), Markdown render, Signature pad, PDF viewer (pdfjs, lazy), Barcode/QR.
- [ ] Each heavy dep lazy-loaded + measured against the Phase 0 bundle baseline.

## Phase 9 — Composables  ⬜  `M` · risk: low

- [ ] New: `useDate` (wraps luxon + `dt.formatDate`), `useTable`, `usePagination`, `useFileUploader`, `useChecklistModel`.
- [ ] Already exist (keep/standardize): `useConfirm`, `useToast` (=notification), `useDialog` (extract from BaseDialog), `useClipboard` (=VueUse).
- [ ] Consolidate the two `uploadFile` contracts into one service; shared `CameraCaptureDialog`.

---

## Execution order

`0 → 1 → 2 → 3 → 3.5 → 4 → 5 → 6 → 7`, then `8`, `9` as capacity allows.
Foundation (0–1) and the typography/field stack (2–3) are the critical path; overlays (5) can run in parallel with core controls (4); the big sweep (7) only starts once 2–6 land.

**Outcome:** a CSS-variable-tokened, Storybook-documented, accessible, white-label-ready internal design system — shadcn/Ant/MUI-class, but native to this Vue 3 + Tailwind v4 stack.
