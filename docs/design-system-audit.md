# Qability Base Component Library — Architecture Audit & Redesign

> Staff-level audit of the `Base*` design-system layer. Scope: 38 `Base*` components + the shared composable/token infrastructure that underpins them.
>
> **Framing correction:** the prompt says "Vue 3 + Quasar, keep Quasar as the underlying framework." The repo reality is the opposite — the `Base*` layer is a **Tailwind v4 (`tw:` prefix) design system that is actively replacing Quasar** (CLAUDE.md rule #3). This audit treats the `Base*` layer as the post-Quasar system and flags every remaining Quasar leak as debt to remove, **not** to build on.

---

## Executive summary

The library is **broad (38 components) but uneven (avg ≈ 5.5/10)**. The primitives that are small and presentational are good (`BaseClickableRow` 9, `BaseDialog` 8.5, `BaseFilterBar`/`PageHeader` 8). The components that carry interaction or data logic are where it breaks down — and they break down in the **same five ways everywhere**, which is good news: a handful of systemic fixes lift most scores at once.

**The five systemic problems (ranked by leverage):**

1. **Keyboard accessibility is broken across every overlay.** `BaseSelectMenu`, `BaseMenu`, `BaseInlineSelect` are built on HeadlessUI `Popover` (Esc + click-outside only) instead of `Combobox`/`Menu`/`Listbox`. Zero `role="listbox/option/menu/menuitem/combobox"`, zero arrow-key navigation, zero `aria-activedescendant` anywhere in the library. **The fix is already paid for** — `@headlessui/vue` (installed) ships `Combobox`/`Menu`/`Listbox` with all of this for free, and they're currently **unused**.
2. **The library violates its own clickable-element rule (CLAUDE.md #8) inside its own primitives.** `BaseClickableRow` exists to kill `<div @click>`, yet `BaseBadge` (clear-X + selectable host — **102 consumers**), `BaseSwitcher`, `BaseStepper`, `BaseTable` (rows + sort headers), and `BaseUploader` (dropzone) all re-implement click with no keyboard/role.
3. **No shared field chrome.** Label + hint + error is hand-rolled in `BaseTextInput`, `BaseTextarea`, `BaseOptionGroup`, `BaseChecklist`, `BaseSelectMenu` — with **divergent tokens** (error text is `text-red`/`text-red-500`, sized `text-14`/`text-12`/`text-xs`) and **no ARIA wiring** (`aria-invalid`/`aria-describedby`/`role=alert` absent everywhere; `for`/`id` association is broken in the text inputs).
4. **The design-token system is half-built.** `tokens.css` defines `--space-*`, `--height-*`, `--focus-ring` — but `--space-*` and `--height-*` have **0 consumers** (dead, exactly like the radius tokens removed in a prior batch), and only colors/shadows/typography are wired into Tailwind `@theme`. Spacing/radius/heights are still ad-hoc per component.
5. **The date/time cluster is a 7-component, 4-value-type, ~890-LOC mess** with two dead components, one pure-indirection layer, a runtime DOM-mutation hack against v-calendar, and a dead `WIcon` shipped to 18 call sites.

**Plus:** no `prefers-reduced-motion` anywhere; mislocated `Base*` files (3 outside the design-system folder); a redundant markdown lib (`micromark` alongside the installed `marked`+`dompurify`); two incompatible `uploadFile` contracts; and `BaseRichTextEditor` (853 LOC, ~13 tiptap pkgs) eagerly imported into the main bundle.

**What's genuinely good and should be the template:** `BaseClickableRow` (dual link/button, correct keyboard handling), `BaseDialog` (HeadlessUI focus-trap/return/Esc/scroll-lock), the **badge triad** pattern, `useToast`/`useConfirm` (clean module-level imperative services), and the color/shadow/type token scales.

---

## 1. Component Audit

### 1.1 Inventory (38 `Base*`)

| Domain | Components | Notes |
|---|---|---|
| Form controls | BaseTextInput, BaseTextarea, BaseCheckbox, BaseSwitch, BaseSwitcher, BaseOptionGroup | no shared field chrome; `defineModel` split |
| Selection/overlay | BaseSelectMenu, BaseInlineSelect, BaseMenu, BasePopover, BaseColorPicker | keyboard-a11y broken; 3 popovers, 1 positioner |
| Date/time | BaseDatePicker, BaseDatePickerDropMenu, BaseDatePickerDropMenuPanel, BaseDateRangeInput, BaseDateTimeDropMenu, BaseDateTimePicker, BaseTimePicker | **7 → 3**; 2 dead, 1 indirection |
| Data display/nav | BaseTable, BaseBadge, BaseChip, BaseClickableRow, BaseTimeline, BaseStepper, BaseBreadcrumbs | badge/chip dup; stepper/timeline dup; breadcrumb a11y |
| Overlay/feedback | BaseDialog, BaseToast, BaseToastContainer, BaseSpinner, BaseSkeleton, BaseEmptyState | live-region a11y; reduced-motion |
| Layout/media/file | BaseFilterBar, BasePhoto, BaseChecklist, BaseFileItem*, BaseUploader*, BaseRichTextEditor* | *3 mislocated outside DS folder |
| Non-`Base` but design-system | ConfirmDialog, ConfirmDialogHost, PageHeader, Loader, ErrorHeader, TeamAvatar, Switchback | naming/relocation |

### 1.2 Duplicates / same-problem

| Duplication | Evidence | Action |
|---|---|---|
| **BaseChip ≈ BaseBadge** | both rounded-full pill + slot + dismiss; **BaseChip 2 consumers vs BaseBadge 102** | Fold chip's `<button>`-remove + `size` prop into BaseBadge, **delete BaseChip** |
| **BaseStepper ≈ BaseTimeline** | identical node+connector vertical rail; duplicate status→class maps (`NODE` vs `COLOR`, divergent keys); both **0 consumers** | Extract shared `BaseRailItem`; dedupe before adoption locks divergence |
| **Loader ≈ BaseSpinner+BaseDialog** | `Loader.vue` is Quasar `WDialog`+spinner, **0 consumers** | **Delete** (`BaseSpinner` already used in `App.vue:174`) |
| **3 popovers** (SelectMenu/InlineSelect/Menu) | each re-implements trigger/panel/search/keyboard on `BasePopover` | Rebuild on HeadlessUI `Combobox`/`Menu`; reduce BasePopover to positioner |
| **Date↔Date / Date↔minutes bridges** | `nativeDate` / `timeInMins` computeds copy-pasted across 3–4 date files | One `dateBridge` util + one value type |
| **Two `uploadFile`** | `@/utils/uploadService.js` returns asset; `@/composables/useFileUpload.js` returns `{success,asset,error}` | Consolidate to one service |
| **Two markdown libs** | `micromark` (BaseTextInput) vs installed `marked`+`dompurify` | Drop micromark; use marked+dompurify (also fixes XSS) |
| **Two camera-capture impls** | `BasePhoto` inline modal vs editor's `CameraCaptureDialog` | Share one `CameraCaptureDialog` |

### 1.3 Dead code (confirmed by grep, 0 importers/consumers)

- Tokens: **`--space-*` (0), `--height-*` (0)** — defined in `tokens.css`, never consumed.
- Composables: **`forwardRef.js` (0), `render.js` (0), `props.js` (0)** — Quasar-derived primitives, no importers. (`validator.js` is alive: 14 importers, vuelidate 17.)
- Components: **`Loader.vue` (0), `BaseDateTimeDropMenu` (0), `BaseDateTimePicker` (0), `BaseStepper` (0), `BaseTimeline` (0)**; `BaseChip` (2, near-dead).
- Dead reference: **`WIcon`** in `BaseDatePicker.vue:61` — unregistered component shipped to 18 consumers.

### 1.4 Merge plan summary

`38 → ~32` net after merges/deletes, **before** adding the missing components: delete `Loader`, `BaseChip`, `BaseDateTimeDropMenu`, `BaseDateTimePicker`, `BaseDatePickerDropMenu`; merge stepper/timeline rail; collapse date cluster 7→3.

---

## 2. API Review (per component, with better API)

> Full per-component findings are in §12. This section calls out the **API-shape** problems and the recommended signatures.

### 2.1 `v-model` consistency — migrate to `defineModel`

- **Problem:** `BaseTextInput` and `BaseTextarea` still use the legacy `modelValue` + `update:modelValue` getter/emit pair (CLAUDE.md rule #6 ✗). Every other control (`BaseCheckbox`, `BaseSwitch`, `BaseSwitcher`, `BaseOptionGroup`, `BaseSelectMenu`) uses `defineModel` ✓.
- **Why it matters:** inconsistent mental model; the two laggards are also the ones with the broken `for`/`id` and missing ARIA — they're the migration tail.
- **Fix:** `const model = defineModel({ type: [String, Number], default: '' })`.

### 2.2 Field chrome props are divergent — unify under `BaseField`

- **Problem:** three names for "help text" (`instructions`, `hint`, both), two for error (`errorMsg` vs `error`+`errorMessage`), all re-implemented per component.
- **Recommended primitive:**

```vue
<!-- BaseField.vue — owns label + required* + hint + error + a11y wiring -->
<script setup>
const props = defineProps({
  label: String, hint: String, error: String,
  required: Boolean, size: { type: String, default: 'md' },
})
const id = useId()                  // Vue 3.5 built-in
const describedby = computed(() =>
  [props.hint && `${id}-hint`, props.error && `${id}-err`].filter(Boolean).join(' ') || undefined)
</script>
<template>
  <div class="tw:flex tw:flex-col tw:gap-1">
    <label v-if="label" :for="id" class="tw:text-label tw:font-medium">
      {{ label }}<span v-if="required" class="tw:text-bad"> *</span>
    </label>
    <slot :id="id" :aria-describedby="describedby" :aria-invalid="!!error" />
    <p v-if="hint" :id="`${id}-hint`" class="tw:text-caption tw:text-secondary">{{ hint }}</p>
    <p v-if="error" :id="`${id}-err`" role="alert" class="tw:text-caption tw:text-bad">{{ error }}</p>
  </div>
</template>
```

Every input becomes: `<BaseField v-bind="fieldProps"><template #default="f"><input v-bind="f" …/></template></BaseField>`. Kills 3 divergent error styles + missing ARIA + broken `for`/`id` in one move.

### 2.3 Keep business logic OUT of primitives

- **`BaseSelectMenu`** `watch(() => props.items)` (L131–168) auto-selects first item / drops stale / coerces required — opinionated data behavior in a primitive (mutates v-model on mount). Move to entity wrappers or gate behind `autoSelectFirst` prop.
- **`BaseDatePickerDropMenuPanel`** bakes quarter-shortcut business rules into the calendar. Pull out.
- **`BaseChecklist`** / **`BaseUploader`** hide whole state machines — extract composables (§7).

### 2.4 Naming normalizations

- `ConfirmDialog` → **`BaseConfirmDialog`** (it's a shared primitive over BaseDialog; 1 importer).
- Toast taxonomy `positive`/`negative` (Quasar `$q.notify` shape) → semantic **`success`/`error`** (tokens are already `--color-success/danger`).
- `BaseDialog`: two props for one concept (`size` + legacy `maxWidth`) — mark `maxWidth` `@deprecated`.
- `BaseMenu`: items carry `click` callbacks as data — acceptable, but document; add `variant: 'danger'`.

### 2.5 `expose` gaps

- `BaseTextarea` defines `focus()` but omits it from `defineExpose` (BaseTextInput exposes it) — inconsistent.
- `BasePopover` declares a `show` prop that is **never used** — dead controlled-open API; remove or implement.

---

## 3. Missing Base Components

Confirmed missing (grep): **BaseCard, BaseStatCard, BaseDrawer, BaseTabs, BaseAvatar, BasePagination, BaseTooltip, BaseAccordion, BaseRadio, BaseAutocomplete, BaseSearch, BaseImage, BaseErrorState, BaseSuccessState, BaseNotFound, BaseLoading/BaseLoadingOverlay, BaseDateRangePicker** (current `BaseDateRangeInput` is filter-preset-specific, not a general field).

Priority tiers:

**P0 — referenced/needed now**
- **BaseCard** — surface primitive (border/radius/elevation/padding tokens). Today every card is ad-hoc `<div class="tw:rounded-xl tw:border …">`; a BaseCard is the natural home for the unwired surface tokens.
- **BaseStatCard** — the dashboard KPI tiles (Open NCs / Overdue / …) are copy-pasted across NC/Complaints/Dashboard. One `BaseStatCard {label,value,icon,trend,variant}`.
- **BaseTooltip** — referenced as a need by `BaseSwitcher` (has a `TODO` to replace native `title`), `BaseTable` (cell truncation), `BaseBadge`. Build on `@floating-ui/dom` (installed) or `floating-vue`.
- **BasePagination** — extract from `BaseTable`'s inline pager so non-table lists can paginate.
- **BaseRadio** — `BaseChecklist`/`BaseOptionGroup` re-implement radios inline; a leaf `BaseRadio` (peer-focus pattern) would DRY them.

**P1 — enterprise polish**
- **BaseTabs** (roving tabindex, `role=tablist`), **BaseDrawer** (side panel = BaseDialog variant), **BaseAvatar** (initials/image/fallback — `TeamAvatar` already partially does this), **BaseAccordion** (`role` + keyboard), **BaseDateRangePicker** (general field, §1 date plan).

**P2 — status/error pages**
- **BaseErrorState / BaseSuccessState / BaseNotFound** — `BaseEmptyState` already exists; these are variants (icon + title + description + action). Implement as `variant` on a unified `BaseStatusState` rather than 4 components.

**Recommendation:** add as a unified `BaseStatusState` (empty/error/success/not-found via `variant`) + the P0 five. Avoid one-off `BaseNotFound`/`BaseSuccessState` files — they're the same layout.

---

## 4. Third-party Libraries

**Principle: use what's installed before adding.** Several gaps are already paid for and merely unused.

### 4.1 Already installed — USE them (no new dep)

| Need | Installed | Status / action |
|---|---|---|
| Combobox/Menu/Listbox a11y | `@headlessui/vue ^1.7` | **Unused for selects/menus.** Rebuild `BaseSelectMenu`→`Combobox`, `BaseMenu`→`Menu`. Biggest single a11y win, zero new bytes. |
| Floating/positioning | `@floating-ui/dom ^1.7` | Used by `BasePopover`. Reuse for `BaseTooltip`. |
| Calendar | `v-calendar ^3.1` | Keep; wrap via its **slots/theme**, not DOM mutation. |
| Date/time | `luxon ^3.7` | Standard. Make it the single date value type across the cluster. |
| Markdown + sanitize | `marked ^18` + `dompurify ^3.4` | **Replace `micromark`** in BaseTextInput with these (also fixes the unsanitized `v-html` XSS). |
| Validation | `@vuelidate/core ^2` | Alive (17 importers). Keep; `validator.js` already wraps it. |
| Utilities | `@vueuse/core ^14` | Standard. |
| Drag/sort | `sortablejs ^1.15` | Present; standardize DnD on it (BaseUploader hand-rolls dropzone DnD). |
| Icons | `@tabler/icons-vue ^3.41` | Standard (CLAUDE.md mandates it). |

### 4.2 Worth adding (with justification)

| Need | Recommend | Why / bundle / maintenance | Alternatives |
|---|---|---|---|
| **Virtual scrolling** (BaseTable at scale) | **`@tanstack/vue-virtual`** | Headless, ~10KB, Tanstack-maintained (very active), framework-agnostic core, pairs with any table markup. Needed once tables exceed the 50-row page cap. | `vue-virtual-scroller` (Akryum, stable but slower release cadence) |
| **Charts** (dashboards/reports) | **`apexcharts` + `vue3-apexcharts`** | Rich out-of-box (no D3 assembly), good a11y/data-table fallback, actively maintained. ~140KB gz — **lazy-load** per report route. | `chart.js`+`vue-chartjs` (lighter ~70KB, fewer chart types); `unovis` (modern, smaller community) |
| **Tooltip/positioning sugar** (if not hand-rolling on floating-ui) | **`floating-vue`** | Built on floating-ui, Vue-3 native, directive + component, ~15KB, Akryum-maintained. | Hand-roll `BaseTooltip` on the installed `@floating-ui/dom` (no new dep — **preferred** given floating-ui is already in) |
| **PDF view** (document module) | **`pdfjs-dist` (lazy)** | Mozilla, canonical, actively maintained. Lazy-load only on doc-preview routes (large). | `vue-pdf-embed` wrapper |
| **Clipboard** | `@vueuse/core` `useClipboard` | **Already installed** — no new dep. | — |

### 4.3 Avoid / remove

- **`micromark`** — redundant with `marked`+`dompurify`; remove after migrating BaseTextInput.
- **Don't** migrate v-calendar → `@vuepic/vue-datepicker`: 18 consumers depend on the current contract; little gain, real risk. Wrap v-calendar properly instead.
- **Don't** add PrimeVue/Reka/Radix-Vue as a *second* component framework — you already have HeadlessUI + a Tailwind DS; adding another headless lib fragments the system. (If you ever want a richer headless base than HeadlessUI 1.7, **Reka UI** is the modern successor to consider — but as a *replacement* strategy, not an addition.)
- **Timezone:** luxon already handles zones; no `moment-timezone` needed. But **add an explicit zone convention** — the date cluster uses system zone implicitly (latent bug for cross-tz QMS data).

---

## 5. UX Review

| Dimension | State | Worst offenders |
|---|---|---|
| **Focus-visible** | Largely **absent**. Only `BaseSwitch` references `focus-visible` (with a near-invisible `ring-white/75`). Hidden-input controls (`BaseCheckbox`, `BaseChecklist` radios) show **no keyboard focus at all**. | Checkbox, Checklist, Switcher, text inputs (use `focus:` not `focus-visible:`) |
| **Disabled** | Token drift: `opacity-50` (Checkbox) vs `opacity-60` (TextInput/OptionGroup) vs none (Switch/Switcher). | normalize to one token |
| **Loading** | `BaseTable` shows a bar, **no skeleton**; `BasePhoto.uploading` ref never renders; `BaseUploader` ok. | Table, Photo |
| **Error** | Visual-only; no `aria-invalid`/`role=alert` anywhere; 3 different error text styles. | all field components |
| **Empty** | `BaseEmptyState` good; `BaseTimeline`/`BaseTable`(false-empty during load) lack it. | Timeline |
| **Animations / reduced-motion** | **No `prefers-reduced-motion` anywhere** — `animate-spin`, `animate-pulse`, dialog/toast transitions all unconditional (vestibular-accessibility gap). | Spinner, Skeleton, Dialog, Toast |
| **Mobile** | Mixed; `BaseTable` relies on horizontal scroll (no responsive stack), `BaseFilterBar` relies on `flex-wrap`. | Table |
| **Affordance** | `BaseSelectMenu` shows selection by a tiny color dot only (color-only, low-contrast). | SelectMenu |

**Systemic UX fixes:** (1) one `tw:focus-visible:ring-2 tw:ring-primary/40` token applied everywhere (incl. `peer-focus-visible` for hidden inputs); (2) `tw:motion-reduce:animate-none` on every animated primitive; (3) normalize disabled to `opacity-60 cursor-not-allowed`.

---

## 6. Design Consistency & Token System

### 6.1 What's wired vs dead

- **Wired into Tailwind `@theme` (base.css):** color scales (success/warning/danger/info/neutral/changes), `--shadow-flat|raised|floating|overlay`, typography `--text-page-title…table-header`. ✅
- **Defined but DEAD (0 consumers):** `--space-0…16` (spacing scale), `--height-btn|input|table-row|…` (component heights), and previously `--radius-*` (already removed). `--focus-ring` has 1 consumer (the global `:focus-visible`).
- **Consequence:** spacing, radius, and control heights are **ad-hoc per component** — `min-w-125`, `h-[30px]`, `py-0!`, magic `24`px line-heights, `text-[10px]/[11px]` all over.

### 6.2 Inconsistencies found

| Token | Divergence |
|---|---|
| Error text | `text-red` vs `text-red-500`; `text-14` vs `text-12` vs `text-xs` |
| Disabled opacity | `50` vs `60` vs none |
| Surface bg | `bg-card`/`bg-sidebar` vs hardcoded `bg-white` (BaseDateRangeInput, breaks dark mode) |
| Skeleton bg | hardcoded `bg-neutral-200` (not theme-aware → invisible in dark mode) |
| Focus ring | `ring-white/75` vs `ring-primary/*` vs none |
| Icon sizes | `:size="10/14/16"` numeric vs `tw:size-4` utility — mixed |
| `!important` | `cursor-pointer!`, `py-0!`, `hover:text-primary!` — fighting base styles |

### 6.3 Recommended token actions

1. **Wire `--height-*` into `@theme`** (e.g. `--height-btn: 40px` → emit `tw:h-btn`) OR delete them and standardize on Tailwind heights — but stop having them defined-and-dead. Given `BaseButton`/inputs already encode 40/32/28, wiring matches reality.
2. **Decide spacing:** either wire `--space-*` into `@theme` (rare — Tailwind's `gap-*`/`p-*` already cover it) or **delete `--space-*`** as dead. Recommend delete; keep the 4px base as documentation.
3. **Add `--color-skeleton`** (theme-aware) and use it in BaseSkeleton.
4. **One error token + one focus-ring token + one disabled token**, applied via `BaseField` and a shared class.
5. **Keep radius governed by Tailwind utilities** (lg=8/xl=12/2xl=16) — do **not** re-add `--radius-*` (prior batch proved wiring them regresses 600+ corners).

---

## 7. Reusability — extract business logic

| Component | Logic to extract | Target |
|---|---|---|
| `BaseChecklist` (308) | uniform-vs-nested value-shape state machine (`getValue`/`setValue`, `hasUniformInputType`) — currently unmountable to unit-test, contract invisible | `useChecklistModel(modelValue, columns)` + explicit `valueShape` prop |
| `BaseUploader` (404) | size validation, DnD state, progress aggregation, result partitioning | `useFileUploader({fileType,maxSize,multiple})` |
| `BaseSelectMenu` | auto-select-first / stale-drop / required coercion | move to entity wrappers or `useSelectDefaults` |
| Date cluster | DateTime↔Date / DateTime↔minutes bridges (duplicated ×3–4) | one `dateBridge` util |
| `BasePhoto` / editor | camera capture (`getUserMedia`) duplicated | shared `CameraCaptureDialog` + `useCameraCapture` |
| Field chrome | label/hint/error markup ×5 | `BaseField` / `useField` (§2.2) |
| Stepper/Timeline | node+connector+status-map | `BaseRailItem` |

**Net:** these extractions remove the bulk of the duplicated LOC and make the components unit-testable in isolation.

---

## 8. Performance

| Issue | File | Fix |
|---|---|---|
| **`BaseRichTextEditor` eagerly bundled** — ~13 tiptap/ProseMirror pkgs, statically imported in 15+ files incl. global `DynamicForm.js`; ships to every route | `src/components/editor/BaseRichTextEditor.vue` | `defineAsyncComponent(() => import(...))` re-export; **biggest bundle win** |
| **DOM-mutation hack** — `customizeCalendarTitle` mounts+unmounts a throwaway Vue app per MutationObserver tick to inject one icon | `BaseDatePickerDropMenuPanel.vue:38-164` | Use v-calendar slots/theme; delete the observer |
| **Object-URL leak** — `URL.createObjectURL` inside a computed, never revoked for `File` values | `BasePhoto.vue:56` | Revoke previous URL in a watcher |
| **`micromark` per-render** on a hint string | `BaseTextInput.vue` | Drop markdown for hints (plain text) |
| **No virtualization** — `BaseTable` renders all page rows; `rowsPerPage<=0` renders ALL | `BaseTable.vue:105-110` | `@tanstack/vue-virtual` when needed; warn on render-all |
| Redundant explicit imports of auto-imported `computed`/`vue`/`useSlots` | BaseToastContainer, BaseSelectMenu | remove (CLAUDE.md #1) |
| Per-render helper calls (`getFileIcon` ×2, `getValue` ×3/cell) | BaseFileItem, BaseChecklist | `computed` once |
| Index-as-key on mutable list → state mis-association | `BaseUploader.vue:364` | stable `id` per file |
| Redundant double `setContent` on mount | BaseRichTextEditor:204,446 | drop one |

---

## 9. Accessibility (consolidated)

**The headline a11y debts (WCAG-relevant):**

1. **Keyboard operability (2.1.1)** — all overlays mouse-only; `BaseSelectMenu`/`BaseMenu`/`BaseInlineSelect` have no arrow/Enter/typeahead; `BaseSwitcher` is click-on-icon; `BaseTable` rows/sort headers and `BaseUploader` dropzone are `<div @click>`. **Fix:** HeadlessUI primitives + `BaseClickableRow`/real `<button>`.
2. **Name, Role, Value (4.1.2)** — no `role=listbox/option/menu/menuitem/combobox`; no `aria-expanded/selected/activedescendant`; icon-only buttons (toast dismiss, badge clear, switcher, bubble-menu) lack `aria-label`.
3. **Forms** — `for`/`id` broken (BaseTextInput/Textarea); no `aria-invalid`/`aria-describedby`/`role=alert`; `BaseOptionGroup` has no `fieldset/legend`/`radiogroup`; `readonly` implemented as `disabled` (drops from focus + submission).
4. **Focus visible (2.4.7)** — absent on most controls; invisible on hidden-input checkboxes/radios.
5. **Live regions (4.1.3)** — toast uses `role=alert` for ALL types (wrong for success/info); live region sits on dynamically-inserted nodes; skeleton emits one "Loading" per bar.
6. **Dialog naming** — title-less `BaseDialog` (which `useConfirm` triggers by default) has no accessible name.
7. **Reduced motion (2.3.3-adjacent)** — no `prefers-reduced-motion`.
8. **Structure** — `BaseBreadcrumbs` no `nav/ol/aria-current`; `BaseStepper`/`BaseTimeline` no list/`aria-current`; `BaseTable` no `scope`/`aria-sort`/`caption`.
9. **Images** — `BasePhoto` preview `alt=""` (treats content photos as decorative).
10. **Color-only meaning** — status badges & SelectMenu selection dot.

**Single highest-leverage a11y move:** rebuild the three overlays on HeadlessUI `Combobox`/`Menu`/`Listbox` (installed, unused) — fixes 1+2 for every entity `XSelectMenu` at once, since they're all wrappers.

---

## 10. Folder Structure

### 10.1 Problems

- **No barrel/index** in `resource/js/shared/components/` — location is the only discoverability signal, which makes the strays worse.
- **3 `Base*` mislocated:** `BaseFileItem`, `BaseUploader` (`src/components/common/`), `BaseRichTextEditor` (`src/components/editor/`).
- **`Base*` live under `resource/js/shared/` but the app runs from `src/`** — a split that confuses ownership.
- **Flat folder** of 35 mixed-domain files.

### 10.2 Recommended structure

```
shared/components/base/
  primitives/     BaseButton BaseField BaseClickableRow BaseBadge BaseChip→(merged) BaseCard BaseSpinner BaseSkeleton
  form/           BaseTextInput BaseTextarea BaseCheckbox BaseRadio BaseSwitch BaseOptionGroup BaseColorPicker
  select/         BaseSelectMenu BaseInlineSelect BaseMenu BasePopover  (+ useListbox)
  datetime/       BaseDatePicker BaseDateTimePicker BaseDateRangePicker BaseTimePicker  (+ dateBridge)
  data/           BaseTable BasePagination BaseTimeline BaseStepper (+ BaseRailItem)
  overlay/        BaseDialog BaseDrawer BaseConfirmDialog BaseToast BaseToastContainer
  feedback/       BaseStatusState (empty/error/success/notfound) BaseStatCard BaseTooltip
  nav/            BaseBreadcrumbs BaseTabs
  media/          BasePhoto BaseFileItem BaseUploader BaseAvatar  (BaseRichTextEditor → feature/editor, drop Base prefix)
  index.js        // barrel (even with auto-import, helps tooling + a Storybook)
```

- **Relocate** the 3 strays; **demote** `BaseRichTextEditor` → `RichTextEditor` (a tiptap+mentions+QMS-numbering editor is a *feature*, not a base primitive).
- Add a **Storybook/Histoire** workspace at the base layer — this is the missing DX piece for a "design system."

---

## 11. Code Quality

- **TypeScript:** project is JS + JSDoc. Not blocking, but the prop contracts (esp. `BaseChecklist`'s dual value shape, `BaseTable` columns) are exactly where TS would prevent footguns. Recommend at least richer JSDoc `@typedef`s for column/item/option shapes, or incremental `.ts` for composables.
- **Prop typing:** several validators reject valid values (`BaseSwitcher` rejects `value: 0`/`''`; `BaseDatePicker` missing `required` prop it's already passed).
- **Dead code:** `forwardRef.js`/`render.js`/`props.js` (Quasar-derived, 0 importers); `BaseTextarea` dead `type` prop; `BaseChip` dead size branch (both arms `text-xs`); `BasePopover` dead `show` prop; empty `<style lang="scss">` in `Loader`.
- **Console noise:** `BaseRichTextEditor` ships `console.warn/error` — dev-gate.
- **`!important` smell:** `cursor-pointer!`, `py-0!`, `hover:text-primary!`, `bg-transparent!` — fighting base styles; fix the base, not the override.
- **Quasar leaks:** `WIcon` (BaseDatePicker), `WDialog`+`q-*` classes (Loader), `--q-*` tokens + `:deep(.q-btn)` (BaseRichTextEditor).
- **Class-order bug:** `hover:tw:bg-black/5` (BaseToast) — wrong prefix order under `tw:`, may not compile.

---

## 12. Enterprise Readiness — per-component scores

> Rubric: 9-10 full a11y (ARIA+keyboard+focus-visible) + all states + token-driven + flexible + no business logic + documented · 7-8 solid, minor gaps · 5-6 usable, notable gaps · 3-4 significant · 1-2 barely reusable.

| Component | Score | Top problem(s) | Headline fix |
|---|---:|---|---|
| BaseClickableRow | **9** | value not captured library-wide | use it inside Table/Badge |
| ConfirmDialogHost | **8** | none structural | (optional queue) |
| BaseDialog | **8.5** | title-less = no a11y name; dual size/maxWidth | sr-only DialogTitle fallback |
| BaseFilterBar | **8** | search has no accessible name; rigid layout | `role=search` + `size`/`ariaLabel` |
| PageHeader | **8** | teleports `<h2>`; hardcoded icon color | single-instance guard; `iconClass` |
| BaseSpinner | **7.5** | no reduced-motion; dup template | `motion-reduce` |
| ConfirmDialog | **7.5** | not `Base*`; unnamed when title-less | rename `BaseConfirmDialog` |
| BaseTable | **7** | no skeleton; client/server pagination ambiguity (correctness); no `scope`/`aria-sort`; rows not keyboard | `manual` mode + skeleton + table a11y |
| BaseBadge | **7** | clear/selectable not keyboard (102 consumers); no `size` | button-remove + `BaseClickableRow` host |
| BaseCheckbox | **7** | invisible keyboard focus; unreliable native `indeterminate` | peer-focus ring + IDL prop |
| BaseEmptyState | **7** | prop-only icon/title (no slot); icon not hidden | add slots |
| BaseSkeleton | **6.5** | hardcoded non-theme bg; no reduced-motion; noisy aria | token bg + `motion-reduce` |
| BaseToastContainer | **6.5** | live region on dynamic nodes; renders 7 groups always | persistent live regions |
| BaseTextInput | **6** | broken `for`/`id`; no ARIA error; getter v-model; micromark XSS | `BaseField` + `defineModel` + drop micromark |
| BaseOptionGroup | **6** | `readonly≡disabled` bug; no `radiogroup`; prop sprawl | fieldset + separate readonly |
| BaseSwitch | **6** | hardcoded "Use setting" sr-only; weak focus ring; no disabled visuals | `label` prop + ring |
| BasePopover | **6** | portal/non-portal copy-paste; dead `show`; div trigger; no focus return | dedupe + flip default true |
| BaseToast | **6** | `role=alert` for all types; no dismiss label; no pause-on-hover | politeness by type |
| BaseFileItem | **6** | mislocated; JS `window.open` vs anchor; silent progress | relocate + `role=progressbar` |
| BaseRichTextEditor | **6** | eager bundle; `--q-*` tokens; console noise; fragile timer sync | lazy-load + de-Quasar |
| BaseTextarea | **5** | duplicated `<textarea>`; conditional autosize; JS focus tracking | dedupe + `focus-within` |
| BaseColorPicker | **5** | no accessible name; no disabled/label | `aria-label` + `disabled` |
| BaseTimeline | **5** | no list semantics; raw-string dates; no empty state | `<ol>` + accept DateTime |
| BaseStepper | **5** | no stepper a11y; clickable divs; muddy controlled model | `aria-current` + buttons |
| BasePhoto | **5** | hand-rolled modal (no a11y); object-URL leak; `alt=""` | BaseDialog + revoke URL |
| BaseChecklist | **5** | implicit dual value shape; invisible focus; logic in component | `useChecklistModel` |
| BaseUploader | **5** | banned div-click dropzone; index keys; logic in component; mislocated | `useFileUploader` + `<label>` dropzone |
| BaseSwitcher | **4** | click-on-icon, zero keyboard/ARIA (rule #8) | `role=radiogroup` of buttons |
| BaseSelectMenu | **4** | mouse-only; no combobox ARIA; business logic | HeadlessUI `Combobox` |
| BaseInlineSelect | **4** | trigger is a non-button `BaseBadge`; dup chips | keyboard trigger |
| BaseMenu | **4** | wrong primitive (Popover); no menu a11y | HeadlessUI `Menu` |
| BaseChip | **4** | redundant (2 vs 102); dead size branch; no aria | merge into BaseBadge |
| BaseDatePicker | **4** | dead `WIcon` (18 sites); missing `required`; min/max type drift | fix icon + `required` |
| BaseDateRangeInput | **4** | parallel impl; native input; weak a11y; `bg-white` | rebuild on Popover+v-calendar |
| BaseBreadcrumbs | **4** | none of the breadcrumb ARIA pattern (22 sites) | `nav/ol/aria-current` |
| BaseDatePickerDropMenu | **3** | pure indirection layer | delete/collapse |
| BaseDateTimeDropMenu | **3** | dead; partial API; dup bridges | delete/merge |
| BaseDateTimePicker | **3** | dead; hardcoded `minDate=now`; dup bridge | delete/merge |
| BaseDatePickerDropMenuPanel | **2** | DOM-mutation hack + mini-app-per-icon | rewrite on v-calendar slots |
| Loader | **2** | Quasar `WDialog`, 0 consumers, duplicate | **delete** |

**Distribution:** 1× 9, 4× 8–8.5, 7× 7–7.5, 7× 6–6.5, 7× 5, 9× 4, 3× 3, 2× 2. **Median 5.** The mass sits at 4–6: usable, not enterprise-ready, all for the same systemic reasons.

---

## 13. Typography System (BaseLabel + typography family)

> Goal: typography becomes **fully centralized** — a future design change touches one file, not hundreds. This is the vehicle that also retires the ~417 `text-[Npx]` magic numbers (§6) and supplies the chrome for `BaseField` (§2.2).

### 13.1 Verdict on the proposed components

**Yes — build all of them** (`BaseHeading`, `BaseText`, `BaseCaption`, `BaseLabel`, `BaseHelperText`, `BaseErrorText`), **but governed by ONE token map.** The named components are thin, semantic wrappers over a shared `typography.js` map. This gives both:
- **DX + semantics** — `<BaseErrorText>` self-documents and carries `role="alert"`; `<BaseHeading level="2">` carries document-outline semantics.
- **Single source of truth** — every size/weight/color lives in `typography.js`, mapped to the **already-wired `--text-*` tokens** (base.css `@theme`). No raw px anywhere.

`BaseCaption`/`BaseHelperText`/`BaseErrorText` are one-line wrappers over `BaseText` variants, so the family is cheap to maintain.

### 13.2 Single source of truth — `typography.js`

```js
// shared/components/base/typography/typography.js
// THE source of truth. Variants map to WIRED Tailwind utilities only
// (--text-* tokens live in base.css @theme; colors are semantic tokens).
// Change the design here → it propagates everywhere. No raw px in any component.

export const TEXT_VARIANT = {
  'page-title':    { tag: 'h1',   class: 'tw:text-page-title tw:font-bold tw:text-on-main tw:leading-tight' },
  'section-title': { tag: 'h2',   class: 'tw:text-section-title tw:font-semibold tw:text-on-main tw:leading-snug' },
  subheading:      { tag: 'h3',   class: 'tw:text-subheading tw:font-semibold tw:text-on-main' },
  body:            { tag: 'p',    class: 'tw:text-body tw:text-on-main' },
  caption:         { tag: 'span', class: 'tw:text-caption tw:text-secondary' },
  helper:          { tag: 'p',    class: 'tw:text-caption tw:text-secondary' },
  error:           { tag: 'p',    class: 'tw:text-caption tw:text-bad' },
}

export const HEADING_LEVEL = { 1: 'page-title', 2: 'section-title', 3: 'subheading', 4: 'subheading', 5: 'subheading', 6: 'subheading' }

export const LABEL_SIZE   = { xs: 'tw:text-caption', sm: 'tw:text-label', md: 'tw:text-body', lg: 'tw:text-subheading' } // 11/12/14/15px (wired)
export const TEXT_WEIGHT  = { normal: 'tw:font-normal', medium: 'tw:font-medium', semibold: 'tw:font-semibold', bold: 'tw:font-bold' }
export const TEXT_COLOR   = { default: 'tw:text-on-main', secondary: 'tw:text-secondary', primary: 'tw:text-primary', error: 'tw:text-bad', disabled: 'tw:text-placeholder' }
export const LINE_CLAMP   = { 1: 'tw:line-clamp-1', 2: 'tw:line-clamp-2', 3: 'tw:line-clamp-3', 4: 'tw:line-clamp-4' } // explicit map (Tailwind JIT won't emit dynamic `line-clamp-${n}`)
```

### 13.3 Component APIs

| Component | Tag | Props | Slots | Notes |
|---|---|---|---|---|
| **BaseHeading** | h1–h6 (`level`) | `level:1–6=2` · `as` (visual variant override) · `color` · `align` · `truncate` | default | `level` = semantic outline; `as` = visual size → **decouples structure from style** (fixes PageHeader's fixed-`h2`) |
| **BaseText** | `as`/variant tag | `variant='body'` · `as` · `color` · `weight` · `align` · `truncate` · `lines` (clamp) | default | the workhorse body/inline text |
| **BaseCaption** | span | (passthrough) | default | = `BaseText variant="caption"` |
| **BaseLabel** | `label` | see 13.4 | default, `help`, `description` | the only one that emits a `<label for>` |
| **BaseHelperText** | p | `id` | default | `BaseText variant="helper"`; `id` for `aria-describedby` |
| **BaseErrorText** | p | `id` | default | `BaseText variant="error"` + `role="alert"`; `id` for `aria-describedby` |

### 13.4 `BaseLabel` — build-ready

```vue
<!-- shared/components/base/typography/BaseLabel.vue -->
<script setup>
import { IconHelpCircle } from '@tabler/icons-vue'
import { LABEL_SIZE, TEXT_WEIGHT, TEXT_COLOR } from './typography.js'

const props = defineProps({
  for:         { type: String,  default: undefined },                       // label-for association
  size:        { type: String,  default: 'sm',     validator: v => v in LABEL_SIZE },   // xs|sm|md|lg
  weight:      { type: String,  default: 'medium', validator: v => v in TEXT_WEIGHT },
  color:       { type: String,  default: 'default',validator: v => v in TEXT_COLOR },   // SEMANTIC only
  required:    { type: Boolean, default: false },
  optional:    { type: Boolean, default: false },
  disabled:    { type: Boolean, default: false },
  error:       { type: Boolean, default: false },
  help:        { type: String,  default: '' },                              // tooltip → help icon
  description: { type: String,  default: '' },                              // subtitle line
  align:       { type: String,  default: 'left' },                          // left|center|right
  truncate:    { type: Boolean, default: false },
})
const colorClass = computed(() =>
  props.disabled ? TEXT_COLOR.disabled : props.error ? TEXT_COLOR.error : TEXT_COLOR[props.color])
</script>

<template>
  <label
    :for="props.for"
    :class="[
      'tw:inline-flex tw:flex-col tw:gap-0.5',
      LABEL_SIZE[size], TEXT_WEIGHT[weight], colorClass,
      align === 'center' && 'tw:text-center', align === 'right' && 'tw:text-right',
      disabled && 'tw:cursor-not-allowed',
    ]"
  >
    <span :class="['tw:inline-flex tw:items-center tw:gap-1', truncate && 'tw:min-w-0']">
      <span :class="truncate && 'tw:truncate'"><slot /></span>
      <!-- asterisk is decorative; real semantics come from the input's required/aria-required -->
      <span v-if="required" class="tw:text-bad" aria-hidden="true">*</span>
      <span v-else-if="optional" class="tw:text-secondary tw:font-normal tw:text-caption">(optional)</span>
      <BaseTooltip v-if="help || $slots.help" :content="help">
        <IconHelpCircle class="tw:size-3.5 tw:text-secondary" aria-hidden="true" />
        <template v-if="$slots.help" #content><slot name="help" /></template>
      </BaseTooltip>
    </span>
    <BaseText v-if="description || $slots.description" variant="caption">
      <slot name="description">{{ description }}</slot>
    </BaseText>
  </label>
</template>
```

Notes: (a) all sizes/weights/colors come from the map — **zero raw values**; (b) the `*` is `aria-hidden` — the accessible "required" must come from the control's `required`/`aria-required`, not a visual glyph; (c) `help` depends on **BaseTooltip** (a P0 missing component, §3) — until it exists, fall back to a native `title`.

### 13.5 Relationship to `BaseField` (important)

`BaseLabel` is the **primitive**; `BaseField` (§2.2) **composes** it with `BaseHelperText` + `BaseErrorText` and owns the generated `id` + `for`/`aria-describedby`/`aria-invalid` wiring. **Most form labels should flow through `BaseField`, not raw `BaseLabel`** — that keeps the id/ARIA contract in one place. Standalone `BaseLabel` is for bespoke layouts (grids, inline filters) where `BaseField`'s column layout doesn't fit.

### 13.6 Where BaseLabel should NOT be used (and why)

| Case | Use instead | Why |
|---|---|---|
| Read-only "field caption" in detail views (no control) | `BaseText`/`BaseCaption` | A `<label>` with no associated control is semantically wrong and misleads screen readers ("clicking does nothing"). |
| Table column headers | `<th>` + `text-table-header` token (or a `BaseTableHeaderCell`) | A `<label>` inside `<thead>` is invalid HTML; headers aren't form labels. |
| Page/section titles | `BaseHeading` | Headings carry document-outline semantics; labels don't. |
| Status pills / tags | badge triad + `text-badge` | Different token + interaction model. |
| Button / menu-item / tab text | the respective component | Not labels; wrapping breaks roles. |
| `aria-label` / `title` strings | the HTML attribute | Those are attributes, not rendered labels. |
| Inside a form field | route through `BaseField` | Centralizes `for`/`id`/ARIA; avoids scattering raw `BaseLabel`. |
| Half-migrated Quasar `W*`/`Q*` fields | migrate the whole field first | Don't bolt `BaseLabel` onto a `QInput`; finish the field migration. |

### 13.7 Folder structure

```
shared/components/base/typography/
  typography.js          # variant→token map (SINGLE SOURCE OF TRUTH)
  BaseHeading.vue
  BaseText.vue
  BaseCaption.vue        # = BaseText variant=caption
  BaseLabel.vue
  BaseHelperText.vue     # = BaseText variant=helper (+ id)
  BaseErrorText.vue      # = BaseText variant=error  (+ id, role=alert)
  index.js               # barrel
```

`BaseField` lives in `form/` and imports from `typography/`.

### 13.8 Migration / sweep strategy (how to replace hundreds of files safely)

1. **Build the 6 primitives + `typography.js` first** (this phase). Add unit tests asserting each renders the right tag + token classes.
2. **Retire the `.ds-label`/`.ds-label-sm` utilities** in base.css (superseded by `BaseLabel size`).
3. **Sweep in domain batches** (NC → CAPA → Documents → …), not one mega-PR — mirrors the prior batch workflow. Per batch:
   - Replace raw `<label class="…">` → `<BaseLabel>` (or move the field onto `BaseField`).
   - Replace heading/`text-[Npx]`/`font-*` text spans → `BaseHeading`/`BaseText`/`BaseCaption`.
   - Replace error/`text-red` paragraphs → `BaseErrorText`; hints → `BaseHelperText`.
4. **Guardrail:** add an ESLint/stylelint rule (or a `rg` CI check) that fails on `text-[\d+px]` and on raw `<label` in `src/` outside the typography/field components — prevents regressions.
5. **Verify** each batch in the running app (per the standing "verify by running" preference).

---

## 14. Phased roadmap

> **Canonical, ordered roadmap (now includes the typography workstream): [design-system-roadmap.md](./design-system-roadmap.md).** The original audit grouping is kept below for reference.

**Phase A — quick wins / correctness (low risk, do first)**
- Delete dead code: `Loader.vue`, `forwardRef.js`/`render.js`/`props.js`, dead `--space-*`/`--height-*` (or wire heights), `BaseDateTimeDropMenu`/`BaseDateTimePicker` (0 consumers).
- Fix `WIcon`→`IconCalendar` (18 sites), `BaseChip` dead size branch, `BaseToast` `hover:tw:` class order, `BasePhoto` object-URL leak, `BaseTextarea` dead `type` prop, `BasePopover` dead `show` prop.
- Lazy-load `BaseRichTextEditor` (biggest bundle win); dev-gate its console + replace `--q-*` tokens.
- Replace `micromark` with `marked`+`dompurify` (fixes XSS too).

**Phase B — systemic primitives (high leverage)**
- `BaseField` + migrate text/textarea/optiongroup/checklist/selectmenu chrome → fixes ARIA + 3 divergent error styles + `for`/`id` at once.
- One `focus-visible` token + `motion-reduce` across all animated/interactive primitives.
- Fix the rule-#8 violations: `BaseBadge`, `BaseSwitcher`, `BaseStepper`, `BaseTable` rows/sort, `BaseUploader` dropzone → `BaseClickableRow`/`<button>`.
- Migrate `BaseTextInput`/`BaseTextarea` to `defineModel`.

**Phase C — overlays a11y (the headline)**
- Rebuild `BaseSelectMenu`→HeadlessUI `Combobox`, `BaseMenu`→`Menu`; reduce `BasePopover` to a positioner. Fixes keyboard a11y for every `XSelectMenu` wrapper.
- Add `BaseTooltip` (on installed floating-ui).

**Phase D — date cluster consolidation (7→3)**
- Collapse to `BaseDatePicker` / `BaseDateTimePicker` / `BaseDateRangePicker`, single luxon `DateTime` value type, one `dateBridge`, kill the DOM-mutation hack, document timezone convention.

**Phase E — fill gaps + structure**
- Add P0 missing: `BaseCard`, `BaseStatCard`, `BasePagination`, `BaseRadio`, unified `BaseStatusState`.
- Merge `BaseChip`→`BaseBadge`, `BaseStepper`/`BaseTimeline`→`BaseRailItem`.
- Relocate the 3 stray `Base*`; add barrel + Storybook/Histoire.
- `BaseTable`: skeleton + `manual`/server mode + `scope`/`aria-sort` + virtualization hook.

**Phase F — composable extraction**
- `useChecklistModel`, `useFileUploader`, consolidate the two `uploadFile`s, shared `CameraCaptureDialog`.

---

## 15. App-wide composition layer (whole-app sweep)

> §1–§14 audit the **`Base*` primitive layer**. This section is a separate, whole-app sweep of all 770 `.vue` files for **copy-pasted page/layout/composition markup** — the tier that `PageHeader` (extracted from ~73 pages) and `BaseLabel` already live in. These are *compositions of primitives*, not primitives, so they're additive to §3's missing-primitive list.

### 15.1 Net-new components (quantified)

| Component | What it DRYs | Evidence (count) | Tier |
|---|---|---|---|
| **BaseDetailField** ✅ built | read-only "label-over-value" pair in detail views/side panels; `—` empty fallback. **NOT a `<label>`** (no control) — see §13.6 | `tw:text-secondary` + `mb-1` in **68 files**; e.g. `SuppliersBasicInfoCard.vue:32`, `ChangeRequestsPageId.vue:372` | 1 |
| **BaseDialogFooter** ✅ built | the Cancel + Save/Submit footer row (loading/disabled/inline-error) | ~**118** `BaseDialog` `#footer` slots; e.g. `ProductsCreateUpdateDialog.vue:195` | 1 |
| **BaseFormDialog** ✅ built | `BaseDialog` + body + `BaseDialogFooter` preset for create/edit dialogs | ~**50–60** form dialogs | 1 |
| **BaseSectionHeader** ✅ built | "title (+icon/subtitle) left, actions right" card/section header | ~**100+** flex-between header blocks | 1 |
| **BaseTabs / BaseTabPanel** ✅ built | accessible tabs (role=tablist/tab/tabpanel, roving tabindex, Arrow/Home/End) | **14** hand-rolled tab bars, **0** ARIA; `SuppliersPageId.vue`, `TrainingPageId.vue`, `AuditsHome.vue` | 1 |
| **BaseDescriptionList / BaseDescriptionItem** | grouped `<dl>` metadata sections (subsection dividers) | ~20–30 files; `ChangeRequestsPageId.vue:495` | 2 |
| **BaseListPage** | list/index shell: `PageHeader` + filter bar + table + empty/loading | 39+ `*Home.vue` | 2 |
| **BaseDetailPage** | detail shell: breadcrumb teleport + `#main-header-actions` + loading + tabs | 30+ `*PageId.vue` | 2 |
| **BaseFieldRow** | responsive multi-column form grid wrapper | ~30 files | 2 |
| **BaseQuickFilterPills** | toggle-pill quick filters (NC/CAPA/Complaints toolbars) | 3 files | 3 |
| **BaseAuditTrailRow** | "by {user} · {date}" actor/timestamp line | ~15–20 | 3 |

Tier-1 (the five marked ✅) are cheap, high-frequency, and unblock the bigger Tier-2 scaffolds; they were built first (with unit tests). `BaseTabs` also covers the `BaseTabs` gap noted in §3.

### 15.2 Adoption gaps (finish the migration — no new component)

- **PageHeader** — 42 pages adopted, but **32** still hand-roll `#main-header-title` and **55** hand-roll `#main-header-actions`. Detail pages stalled because they need the (Tier-2) `BaseDetailPage` shell, not bare `PageHeader`.
- **BaseFilterBar** bypassed by `EquipmentHome.vue`, `FormAssignmentsHome` (raw `<select>`).
- **useConfirm** used by ~31 files, but ~84 hand-roll "Are you sure?" delete dialogs — consolidate onto `useConfirm` rather than adding a component.

### 15.3 Relationship to §3

§3's `BaseCard` / `BaseStatCard` / `BaseStatusState` / `BaseAvatar` are **primitives** (Phase 6) and remain there. Note: `UserAvatar`/`UserAvatarById` already cover **19** files — only `TeamAvatar` (2) + ~9 ad-hoc initials need folding into a future `BaseAvatar`, so it's lower-urgency than §3 implies.
