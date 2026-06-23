# Form System — design + migration guide (2026-06-23)

> The reusable form foundation: a small orchestration layer on top of the
> existing `Base*` primitives, plus a migration program to move every module
> onto it. **We did not rebuild the foundation — it already existed. We added a
> spine and we enforce it.**

## TL;DR

- Author forms as **`<BaseForm>` + `<FormSection>` + `<BaseFieldRow>` + `<BaseField>`** wrapping existing inputs.
- Validation goes through **`validate()` → `<ValidationSummary>` + `<BaseField :error>`**, never a pile of `toast.notify(...)`.
- Primary action lives in a **`<StickyFormFooter>`**, not the page header.
- The **`lint:forms`** guard (`scripts/check-form-system.mjs`) blocks new hand-rolled form cards and toast-validation. 83 legacy files are allowlisted; **remove a file from the allowlist when you migrate it.**

## The components (all in Storybook under `Forms/`)

| Component | File | Purpose |
|-----------|------|---------|
| `BaseForm` | `resource/js/shared/components/form/BaseForm.vue` | Spine: validate→summary→jump→submit, sticky footer, ⌘↵, unsaved guard, `mode="submit"|"autosave"`. Root is a `<div>` (rule #8). |
| `FormSection` | `…/form/FormSection.vue` | Titled section = `BaseCard` + `BaseSectionHeader`; `optional`/`collapsible`/anchor `id`. Dark-mode-safe (`bg-card`). |
| `ValidationSummary` | `…/form/ValidationSummary.vue` | Focusable list of all errors; each row jumps to its field. |
| `StickyFormFooter` | `…/form/StickyFormFooter.vue` | Bottom-pinned submit/cancel + dirty/loading/error status. |
| `AutosaveIndicator` | `…/form/AutosaveIndicator.vue` | Saving/Saved/Couldn't-save UI for `useAutoSave` (detail pages). |
| `FormProgressNav` | `…/form/FormProgressNav.vue` | Sticky section strip + completion status + scroll-spy. |
| `SegmentedControl` | `…/SegmentedControl.vue` | Accessible single-choice toggle (severity/priority/yes-no). |
| `BaseTagsInput` | `…/BaseTagsInput.vue` | Free-text chips (non-entity string lists). |
| `BaseAutocomplete` | `…/BaseAutocomplete.vue` | Typeahead / async-search combobox. |

**Reused as-is (do not duplicate):** `BaseField` (label/required/optional/hint/error/a11y), `BaseErrorText`, `BaseHelperText`, `BaseTooltip`, `BaseTextInput`, `BaseTextarea`, `BaseSelectMenu` + `XSelectMenu` triad, `BaseDateField`, `BaseCheckbox`/`BaseRadio`/`BaseSwitch`/`BaseOptionGroup`, `BaseUploader`, `BaseRichTextEditor`, `BaseSkeleton`/`BaseSpinner`, `BaseEmptyState`/`BaseStatusState`, `SimilarRecordsPanel`.

## Field type → component

| Need | Use |
|------|-----|
| text / number / password / email | `BaseTextInput` |
| multi-line | `BaseTextarea` |
| date / time / datetime / range | `BaseDateField` (`mode=…`) |
| enum select / entity select | `BaseSelectMenu` / the entity's `XSelectMenu` |
| single-choice toggle | **`SegmentedControl`** |
| checkbox / radio / switch | `BaseCheckbox` / `BaseRadio` / `BaseSwitch` / `BaseOptionGroup` |
| free-text chips | **`BaseTagsInput`** |
| typeahead / remote search | **`BaseAutocomplete`** |
| rich text | `BaseRichTextEditor` |
| file / image | `BaseUploader` / `BasePhoto` |

## How to migrate a form (step by step)

Migrate **by moving, not rewriting** — don't change behavior and structure in the same commit.

1. **Wrap the body in `<BaseForm>`.** Move the existing submit handler to `@submit`; pass `:loading`, `:dirty`, `:submitError`, `submitLabel`. Delete the header submit button.
2. **Replace each hand-rolled card** (`<div class="tw:bg-white tw:border … tw:rounded-lg tw:p-5">` + overline header) with `<FormSection title icon>`. Move `(optional)` from the header string to the `optional` prop. Long/optional sections → `collapsible`.
3. **Replace grids** (`tw:grid tw:grid-cols-2`) with `<BaseFieldRow :columns="2">` (collapses to 1 col on mobile automatically).
4. **Wrap every control in `<BaseField label … required>`** and spread the slot payload: `<template #default="field"><Control v-bind="field" v-model="…" /></template>`. Put the field `id` on `BaseField` (it flows into the control) so `ValidationSummary` can jump to it.
5. **Replace toast-validation with a `validate()`** returning `[]` or `[{ id, label, message }]`. `BaseForm` shows `ValidationSummary`, focuses it, and jumps to fields. Delete the `toast.notify({ message: 'X is required' })` calls.
6. **Replace bespoke toggle groups** (`<BaseButton v-for>` over severity/priority) with `<SegmentedControl>` (`nullable` for optional ones).
7. **Custom fields**: keep `CustomFieldsCreateSection` as a `FormSection`; persist in the `@submit` handler as before.
8. **Detail pages (autosave):** `mode="autosave"`, drop an `<AutosaveIndicator>` into `#footer-status`, keep `useAutoSave`.
9. **Remove the file from the `ALLOWLIST`** in `scripts/check-form-system.mjs` and run `npm run lint:forms` — it must stay green.
10. **Verify by running** (not just lint/build): drive the real form, confirm validation, submit, autosave.

### Before / after (NC create)

```vue
<!-- BEFORE: hand-rolled card + toast validation + header submit -->
<div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
  <BaseText variant="overline" class="tw:pb-3 tw:border-b tw:mb-4">Classification</BaseText>
  <div class="tw:grid tw:grid-cols-2 tw:gap-3">…</div>
</div>
// if (!form.severityId) { toast.notify({ type:'negative', message:'Severity is required' }); return }

<!-- AFTER -->
<BaseForm :validate="validate" :dirty="dirty" submitLabel="Raise NC" @submit="save">
  <FormSection title="Classification" :icon="IconCategory">
    <BaseFieldRow :columns="2">
      <BaseField label="Severity" required id="nc-severity">
        <template #default="field">
          <SegmentedControl v-bind="field" v-model="form.severityId" :options="SEVERITY" />
        </template>
      </BaseField>
    </BaseFieldRow>
  </FormSection>
</BaseForm>
```

## Responsive rules

- One **column of sections**; inside a section, **1–3 columns of fields** via `BaseFieldRow` (never a form-wide 2-col grid).
- Mobile `<640`: every row → 1 col; optional sections start collapsed; footer full-width; `FormProgressNav` collapses.
- Wide `≥1280`: optional right rail (AI / similar-records / progress) beside the `narrow` form column.

## Surface decision (create forms)

- **≤ 8 fields → `BaseFormDialog`** containing `BaseForm` (`:hideFooter` + dialog footer).
- **> 8 fields → full-page** `BasePage` (`fullHeight`) containing `BaseForm` with `StickyFormFooter`.
- **Editing an existing record → inline autosave** on the detail page (`mode="autosave"`).

## Enforcement: `lint:forms`

`scripts/check-form-system.mjs` (wired into `npm run lint`) fails on:

- **`no-handrolled-form-card`** — `bg-white + border + rounded + p-5` chrome → use `FormSection`.
- **`no-toast-validation`** — `toast.notify({ … 'is required' })` → use `ValidationSummary` + `BaseField :error`.

The `ALLOWLIST` holds the 83 not-yet-migrated files (the backlog). **Remove a file when you migrate it**; new/un-allowlisted files are blocked immediately.

## Migration phases (backlog: 83 files, 92 violations measured)

1. **NC create** (`NonconformancesCreate.vue`) — reference migration + template.
2. **High-traffic full-page creates** — Suppliers, Documents, Document Templates, Trainings.
3. **Dialog creates** — Products, Sites, Quality Events, Audit Programs (settle the ≤8-field rule).
4. **Detail pages (autosave)** — standardize `useAutoSave` + `AutosaveIndicator`; extract the duplicated severity group into `SegmentedControl`.
5. **The long tail** — settings/company cards, customer-complaints admin, etc.

## Open strategic question (deferred)

`BaseForm` (hand-authored) and `DynamicForm` (schema-driven, admin/custom-fields) are **kept separate for now**. Revisit whether hand-authored forms should eventually compile to the same schema engine once the migration matures.
