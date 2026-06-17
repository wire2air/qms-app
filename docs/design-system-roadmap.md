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

## Phase 0 — Foundation Cleanup  ⬜  `S–M` · risk: low

- [ ] Delete dead components: `Loader.vue`, `BaseDateTimeDropMenu` (0 consumers, verified). ⚠️ **`BaseDateTimePicker` is NOT dead** — `DynamicForm.js` imports it and renders `h(BaseDateTimePicker, …)`; keep it (it folds into the Phase 5 date consolidation instead).
- [ ] Delete dead composables (`forwardRef.js`, `render.js`, `props.js` — 0 importers). Keep `validator.js` (16–17 importers).
- [ ] Resolve dead tokens `--space-*`/`--height-*` (wire or delete — see Phase 1).
- [ ] Fix `WIcon` → `IconCalendar` (`BaseDatePicker.vue:61`, 18 sites); fix `BaseChip` dead size branch, `BaseToast` `hover:tw:` order, `BasePopover` dead `show` prop, `BaseTextarea` dead `type` prop, `BasePhoto` object-URL leak.
- [ ] Lazy-load `BaseRichTextEditor`; dev-gate its `console.*`; replace `--q-*` Quasar tokens.
- [ ] Drop `micromark` (use `marked`+`dompurify`).
- [ ] **Bundle analysis** (rollup-plugin-visualizer) — baseline before/after.

**Goal:** clean, measured codebase.

## Phase 1 — Design Tokens + Theme + Storybook (Foundation)  ⬜  `M–L` · risk: low ⭐

The foundation everything else consumes. **CSS variables, not `.ts`.**

- [ ] **Tokens:** rationalize `tokens.css` + `base.css @theme` into the single source of truth. Finalize: spacing (wire or delete `--space-*`), control heights (wire `--height-*` → `tw:h-btn` or delete), radius (keep Tailwind-governed), elevation/shadows (already wired), z-index scale (add — currently ad-hoc), animation/duration tokens (add).
- [ ] Document the token contract (one MD table: token → value → utility → usage).
- [ ] Optional **generated `tokens.js`** (reads CSS vars) for JS consumers only (chart colors, canvas). Not hand-maintained; CSS stays canonical.
- [ ] **Theme:** light/dark already wired ✅ → add **brand/tenant** layer: `[data-tenant]` scoped overrides of `--primary`/brand vars (white-label hook). Document how a tenant overrides tokens.
- [ ] **Storybook 8 (`@storybook/vue3-vite`) + `addon-a11y`** stood up; CI builds it. (Optional: Chromatic for visual regression later.)

**Goal:** one place to change any visual decision; tooling to see every component.

## Phase 2 — Typography Foundation  🚧 IN PROGRESS  `M` · risk: low

> Pulled forward (the `--text-*` tokens are already wired, so no token blocker). `BaseLabel.help` uses a native `title` until `BaseTooltip` lands in Phase 5.

- [ ] `typography/typography.js` variant→token map (maps to wired `--text-*` + semantic colors).
- [ ] `BaseHeading` (semantic `level` + visual `as`), `BaseText`, `BaseCaption`, `BaseLabel`, `BaseHelperText`, `BaseErrorText` + barrel + tests + **stories**.
- [ ] Retire `.ds-label`/`.ds-label-sm` utilities.
- [ ] No raw `text-sm`/`text-lg`/`font-bold`/`text-red` in *new* code (sweep is Phase 7).

## Phase 3 — BaseField  ⬜  `M–L` · risk: medium ⭐

The enterprise field wrapper — `<BaseField label required hint error><BaseInput/></BaseField>`.

- [ ] `BaseField` composes `BaseLabel`+`BaseHelperText`+`BaseErrorText`; owns generated `id` + `for`/`aria-describedby`/`aria-invalid`.
- [ ] Migrate `BaseTextInput`/`BaseTextarea` to `defineModel`; route chrome through `BaseField`.
- [ ] One `focus-visible` ring token + `motion-reduce` across primitives.
- [ ] Story + a11y check.

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

## Phase 7 — App-Wide Refactor / Sweep  ⬜  `XL` · risk: medium

> **Last** — all primitives now exist. Batched by domain, verified per batch.
- [ ] Replace `<label>` → `BaseLabel`/`BaseField`; `<h1..6>` → `BaseHeading`; `<p>`/`text-[Npx]`/`text-sm` → `BaseText`/`BaseCaption`; error `<p>` → `BaseErrorText`.
- [ ] Replace raw `<select>`/`<input>`/clickable `<div>` → the hardened Base controls.
- [ ] Retire the ~417 `text-[Npx]` magic numbers.
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

`0 → 1 → 2 → 3 → 4 → 5 → 6 → 7`, then `8`, `9` as capacity allows.
Foundation (0–1) and the typography/field stack (2–3) are the critical path; overlays (5) can run in parallel with core controls (4); the big sweep (7) only starts once 2–6 land.

**Outcome:** a CSS-variable-tokened, Storybook-documented, accessible, white-label-ready internal design system — shadcn/Ant/MUI-class, but native to this Vue 3 + Tailwind v4 stack.
