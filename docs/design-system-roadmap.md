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

## Phase 1 — Design Tokens + Theme + Storybook (Foundation)  ✅ DONE (tokens.js optional, deferred)  `M–L` · risk: low ⭐

The foundation everything else consumes. **CSS variables, not `.ts`.**

- [x] **Tokens rationalized.** Added the **z-index scale** as `--z-*` tokens (`tokens.css`) exposed via `@utility` `tw:z-raised…z-max` (`base.css`) — Tailwind v4 has no `--z-index` namespace; values match existing ad-hoc numbers so adopting a name is a visual no-op. Adopted in `BaseDialog`/`BasePhoto` (`z-modal`) + `BaseToastContainer` (`z-toast`); remaining ~25 feature-file `z-N` usages migrate in Phase 7. Spacing/heights stay deleted; radius stays Tailwind-governed; shadows/typography already wired. **No `--duration-*`/`--ease-*` tokens** — almost everything uses the default `transition-colors`, so named motion tokens would be dead (documented convention instead: `duration-150/200/300` + `motion-reduce:*`).
- [x] **Token contract documented** — [design-system-tokens.md](./design-system-tokens.md) (token → value(light/dark) → utility → usage; how-it's-wired; add-a-token checklist).
- [x] **Brand/tenant hook** — documented `[data-tenant]` scoped `--primary` override mechanism (template kept commented in `tokens.css`; real selector added on tenant onboarding, no dead CSS).
- [ ] Optional **generated `tokens.js`** (reads CSS vars) for JS consumers only (chart colors, canvas). Deferred — no JS-token consumer yet.
- [x] **Storybook + `addon-a11y` stood up** (`storybook`/`@storybook/vue3-vite`/`@storybook/addon-a11y` **v10** — Storybook 8 predated Vite 7; v10 supports it). `.storybook/main.js` mirrors the app's Vite plumbing via `viteFinal` (Tailwind `tw:` prefix, AutoImport, `unplugin-vue-components`, the 5 aliases) so stories mount `Base*` exactly like the app; `preview.js` loads `base.css` + a light/dark **Theme toolbar**. Scripts: `pnpm storybook` / `pnpm build-storybook` (`build-storybook` green). **Stories: ~all Base\* covered** — `Foundations/Tokens` (colors/typography/elevation/z-index) + Typography (6), Forms (incl. inputs, selects, date/time pickers), Primitives, Data, Navigation, Overlays, Layout, and the Composition tier — **52 `*.stories.js`**, all CSF3 + `autodocs`, lint-clean, build-green. `preview.js` also loads the `DateTime.prototype.formatDate` extension so date components render as in-app. **Intentionally skipped** (not meaningful in isolation): teleport-dependent page shells (`PageHeader`/`BaseListPage`/`BaseDetailPage`), global infra hosts (`ConfirmDialogHost`/`BaseToastContainer`), teleport utilities (`SafeTeleport`/`PrintTeleport`), and the audit-flagged dead date sub-components (`BaseDatePickerDropMenu(Panel)`). (Optional: Chromatic for visual regression later.) The "stories deferred" notes in Phases 2/3/3.5 are now resolved.

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
- [x] **Tier-2 built:** `BaseDescriptionList`/`BaseDescriptionItem` (semantic `<dl>/<dt>/<dd>`; inline/stacked, `divided`; ~20–30-file rail pattern; 14 tests), `BaseFieldRow` (responsive 1→N column form grid, mobile-collapsing; ~30 files; 6 tests), `BaseListPage` (`BasePage`+`PageHeader`+`#stats`/`#filters` slots + opt-in loading/empty; 39+ `*Home.vue`; 8 tests), `BaseDetailPage` (breadcrumb/title teleport + loading/not-found + internal-scroll body; 30+ `*PageId.vue`; 7 tests). *Adoption (sweeping pages onto them) tracked under Phase 7.*
- [x] **Tier-3 built:** `BaseQuickFilterPills` (single-select toggle pills as real `aria-pressed` buttons in a `role=group`; fixes the NC/CAPA/Complaints toolbars' zero-a11y `<button>` rows + dark-mode-breaking `bg-white`; 3 files; 7 tests), `BaseAuditTrailRow` ("by {actor} · {date}" line; actor via slot to stay decoupled from the user feature, date via `dt.formatDate`; ~15–20 sites; 7 tests). *Adoption tracked under Phase 7.*
- [ ] **Adoption gaps (no new component):** finish `PageHeader` rollout (32 raw title / 55 raw actions — gated on `BaseDetailPage`); migrate `EquipmentHome`/`FormAssignmentsHome` off raw `<select>` → `BaseFilterBar`; consolidate ~84 hand-rolled delete dialogs onto `useConfirm`.
- [ ] Stories + a11y for each (deferred to Phase 1 Storybook setup).

## Phase 4 — Core Controls: harden + fill gaps  🚧 IN PROGRESS  `L` · risk: medium

> Most exist — this is **hardening + BaseField integration + a11y**, plus the few genuinely new.
- [x] **Harden — `BaseOptionGroup`:** fixed `readonly≡disabled` (readonly stays focusable/submittable; the toggle is blocked via `@click.prevent` + the select() guard), added `role=radiogroup`/`group` + `aria-labelledby` (title no longer a stray `<label>`) + `aria-readonly`/`aria-disabled`, moved error/help to `text-bad`/`text-caption` tokens.
- [x] **rule-#8 fixes:** `BaseBadge` clear-X → real `<button aria-label>` (102 consumers; `clear` emit unchanged); `BaseSwitcher` → WAI-ARIA radiogroup (role=radiogroup/radio, aria-checked, roving tabindex, Arrow/Home/End, dropped `cursor-pointer!`); `BaseStepper` → `<ol>` + `aria-current="step"` + decorative `aria-hidden` connectors + clickable steps as real `<button>`s; `BaseTable` headers → `scope="col"` + `aria-sort` + sortable headers as keyboard `<button>`s + checkbox `aria-label`s.
- [x] **New: `BaseRadio`** — leaf radio (peer-focus pattern), the control `BaseOptionGroup`/`BaseChecklist` re-implement inline.
- [ ] **Remaining:** `BaseAutocomplete` (Combobox-based — pairs with the Phase 5 HeadlessUI work); `BaseTable` clickable-row keyboard (needs a row-interaction-model decision — deferred, not a no-op across 50+ usages); `BaseUploader` dropzone (rule #8); BaseField integration for the remaining inputs; harden `BaseButton`/`BaseTextInput`/`BaseTextarea`/`BaseSelectMenu`/`BaseCheckbox`/`BaseSwitch`/`BaseDatePicker`.
- [x] Stories + unit tests for each shipped item (BaseRadio story; BaseBadge/Switcher/Stepper/Table/OptionGroup specs; 34 new tests).

## Phase 5 — Overlay Components (a11y headline)  🚧 IN PROGRESS  `L` · risk: medium ⭐

> Moved *before* the app-wide refactor — the sweep depends on these.
- [x] **`BaseMenu` + `BaseSelectMenu` a11y.** Delivered the audit's headline outcome — **menu/listbox/option roles, `aria-selected`, `aria-activedescendant`, and full keyboard nav** (Arrow/Home/End/Enter, focus management) — **in place on the existing BasePopover foundation** rather than a ground-up HeadlessUI swap. Rationale: HeadlessUI `Menu`/`Combobox` don't do floating positioning (these get it from BasePopover) and a full swap would have to reimplement positioning *and* break the `#trigger`/`#button`/`#items`/`#item`/`#footer` slot contracts that ~25 `BaseMenu` + dozens of `XSelectMenu` consumers depend on — unacceptable without runtime verification. Auto-select logic left in place (entity wrappers rely on it); moving it out is a separate, consumer-affecting change. **⚠️ Needs in-browser verification before merge** (interactive keyboard/selection across real dropdowns).
- [ ] Reduce `BasePopover` to a positioner; de-dupe portal branches; default `flip:true`. *(deferred — BasePopover is the positioning engine the above now lean on; refactor separately.)*
- [x] **New: `BaseTooltip`** (floating-ui — hover+focus, role=tooltip + aria-describedby) and **`BaseDrawer`** (BaseDialog variant, slide-in). `BaseDialog` — added `ariaLabel` (title-less accessible name) + `initialFocus`.
- [x] Normalized toast taxonomy (`positive/negative` → `success/error`, legacy aliased — zero break) + live-region a11y (errors assertive `alert`, rest polite `status`; dismiss `aria-label`). `ConfirmDialog` → `BaseConfirmDialog` rename **deferred to Phase 7** (it's ~24 auto-imported template consumers — a sweep, not a swap).
- [ ] Stories + a11y for each shipped item (Tooltip/Drawer stories added; Menu/SelectMenu kept existing stories; ~39 new unit tests across the phase).

## Phase 6 — Data Components  🚧 IN PROGRESS  `L–XL` · risk: low–med

- [x] **New: `BaseCard`** (surface primitive — rounded-xl/border/bg-card/padding), **`BaseStatCard`** (KPI tile: icon box + value + label + trend + loading skeleton, on BaseCard + ContentGrid), **`BaseStatusState`** (unified empty/error/success/not-found via `variant`), **`BasePagination`** (rows-per-page + range + prev/next as a labelled `<nav>`, extracted from BaseTable and now consumed by it).
- [x] **`BaseBreadcrumbs` → `nav`/`ol`/`aria-current`** (22 consumers, additive — visual unchanged).
- [x] **Merged `BaseChip` → `BaseBadge`** (added `size` prop; migrated the 2 workflow consumers; deleted BaseChip). `scope`/`aria-sort` for BaseTable headers already shipped in Phase 4.
- [ ] **`BaseTable` skeleton + `manual`/server mode** — *deferred (owner asked to leave BaseTable alone this pass).* `@tanstack/vue-virtual` virtualization **declined** for now (no new dep). `BaseRailItem` dedup of `BaseStepper`/`BaseTimeline` **deferred** (both 0 consumers — pure internal cleanup).
- [x] Stories + unit tests for each shipped item (~46 new tests across the phase; build-storybook green).

## Phase 7 — App-Wide Refactor / Sweep  🚧 IN PROGRESS  `XL` · risk: medium

> **Label/eyebrow/heading sweep LARGELY DONE** — ~380 raw `<label>` → `BaseField`, section eyebrows → `BaseText overline`, small section headings → `BaseText as=hN`, across ~22 domains + `src/pages` (NC, suppliers, qcInspection, documents, customerComplaints, inspectionsLogs, capas, workflow, changeRequests, formTemplate, equipment, formAssignment, company, groups, users, roles, form, form-builder, editor, taskInstance, records, products, auth, audits, rcaTemplate, …). Every commit lint-clean; ~155 `<label>` remain, all intentional leaves (below).
- [x] Raw `<label>` field blocks → `BaseField`; eyebrows → `BaseText overline`; small headings → `BaseText`.
- [x] **`ConfirmDialog` → `BaseConfirmDialog`** rename (21 consumers + ConfirmDialogHost's render; host keeps its name). App build green.
- [x] **z-index migration** — 42 ad-hoc `tw:z-<number>` across 25 feature files → the Phase-1 named tokens (`tw:z-raised…z-max`). Verified no-op (token values = the numbers); no raw `tw:z-N` left in `src/`.
- [x] **CI guardrail shipped** — `npm run lint:ds` ([check-design-system.mjs](../scripts/check-design-system.mjs)) is a **regression ratchet**: counts raw `text-[Npx]` / `<label>` / `<h1-6>` in `src/` and fails only when a count rises above its baseline (362 / 153 / 127). Wired into `npm run lint`. Lower a baseline as you sweep; 0 = hard ban.
- [ ] Replace raw `<select>`/`<input>`/clickable `<div>` → hardened Base controls (after Phase 4/5).
- [ ] **Retire the ~362 `text-[Npx]` magic numbers** + `ds-label`→`BaseLabel` (~22) + read-only captions→`BaseCaption` (~95). **Deferred — large mechanical sweeps (hundreds of edits) that need a dedicated, in-app-verified pass; the ratchet now prevents the counts from growing in the meantime.**
- [ ] *Intentional leaves (do NOT convert):* ~25 checkbox/switch/radio-wrapping `<label>`s; `<th>` table headers; `BaseCheckbox`-nested question labels.

## Phase 8 — Advanced Components  🚧 IN PROGRESS  `XL` · risk: med (mostly lazy-loaded)

- [x] **`BaseChart`** — lazy ApexCharts wrapper (`vue3-apexcharts`) with brand defaults; `defineAsyncComponent` keeps apexcharts (~140KB → its own chunk, confirmed) off non-chart routes. Story (line/bar/donut).
- [x] **`BaseSignaturePad`** — draw-to-sign canvas (`signature_pad`); v-model = PNG data URL, HiDPI-scaled, `clear()`/`isEmpty()`. Story.
- [x] **`BaseImageCropper`** — crop/zoom on the installed `vue-advanced-cropper`; emits cropped data URL. Story.
- [ ] **Deferred (complex / blind-risk):** `BasePdfViewer` (pdfjs worker setup + existing `usePdfImport`), `RichTextEditor` lazy-load + relocate (23 call sites — `defineAsyncComponent` ref/expose forwarding), `BaseFileUpload`/`useFileUploader`, Markdown render, Barcode/QR.
- [x] Each heavy dep lazy-loaded (verified apexcharts is a separate chunk; charts/signature/cropper components carry browser-verify notes — render to canvas/SVG, checked in Storybook not jsdom).

## Phase 9 — Composables  🚧 IN PROGRESS  `M` · risk: low

- [x] **`useChecklistModel`** — extracted BaseChecklist's uniform-vs-nested value-shape state machine into a pure, unit-tested composable (audit §7; it was inline + unmountable to test). BaseChecklist consumes it (1:1, build-verified). 8 tests.
- [x] **`usePagination`** — extracted BasePagination's math (total pages / range label / clamped nav / page-size reset) into a reusable composable; BasePagination consumes it (spec safety-net passes). 7 tests.
- [ ] **Deferred:** `useDate` (near-dead — `dt.formatDate` is already a DateTime prototype method app-wide), `useTable` (would require refactoring BaseTable — out of scope), `useFileUploader` + consolidating the two `uploadFile` contracts (`useFileUpload.js` vs `uploadService.js`) + shared `CameraCaptureDialog` (a real refactor of untested upload components — needs a verified pass).
- [ ] Already exist (keep/standardize): `useConfirm`, `useToast`, `useDialog` (extract from BaseDialog), `useClipboard` (=VueUse).

---

## Execution order

`0 → 1 → 2 → 3 → 3.5 → 4 → 5 → 6 → 7`, then `8`, `9` as capacity allows.
Foundation (0–1) and the typography/field stack (2–3) are the critical path; overlays (5) can run in parallel with core controls (4); the big sweep (7) only starts once 2–6 land.

**Outcome:** a CSS-variable-tokened, Storybook-documented, accessible, white-label-ready internal design system — shadcn/Ant/MUI-class, but native to this Vue 3 + Tailwind v4 stack.
