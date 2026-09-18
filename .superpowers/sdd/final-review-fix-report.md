# Final Review Fix Report — SP-6 NC Migration

Date: 2026-06-22

## Fixes Applied

### Fix 1 (Critical) — `BaseDetailLayout` honors `section.visible`
**File:** `resource/js/shared/components/BaseDetailLayout.vue`

Added `const visibleSections = computed(() => effSections.value.filter((s) => s.visible !== false))`.

Used `visibleSections` (not `effSections`) in:
- The `v-if="vd.showNav && visibleSections.length"` guard (was `effSections.length`)
- `DetailAnchorNav :sections="visibleSections"` (was `effSections`)
- `v-for="s in visibleSections"` section loop (was `effSections`)
- `setupSpy()` — early-return length check and `.forEach` loop

`effSections` input to `useDetailLayout` is left unchanged (correct — the layout state machine still sees all sections).

### Fix 2 (Important) — `DetailActionBar` passes action `title` as tooltip
**File:** `resource/js/shared/components/DetailActionBar.vue`

- Added `:title="a.title"` to the visible `<BaseButton>` — passes through to the rendered `<button>` via Vue's inherited attrs.
- Added `title: a.title` to the `overflowItems` map objects.

### Fix 3 (Important) — Approve & Close carries `completing` in-flight state
**Files:**
- `src/components/nonconformances/ncDetailConfig.js` — destructured `completing` from `gates`; approve action now sets `disabled: !canMarkComplete || !!completing` and `loading: !!completing`.
- `src/components/nonconformances/NonconformancesPageId.vue` — added `completing: completing.value` to the gates object passed to `buildNcActions`.

### Fix 4 (Minor) — Open NC shows spec'd loading spinner
**File:** `src/components/nonconformances/ncDetailConfig.js`

Added `loading: !!saving` to the `open` action (alongside the existing `disabled: !!saving`).

---

## Test Additions

### Test 1 — `BaseDetailLayout` section visibility (TDD red→green)
**File:** `resource/js/shared/components/BaseDetailLayout.spec.js`
```
it('does not render a section nav item or section body when section.visible is false')
```
- Red: `#section-b` existed in DOM despite `visible: false`.
- Green: After adding `visibleSections` computed + template changes.

### Test 2 — `DetailActionBar` title tooltip (TDD red→green)
**File:** `resource/js/shared/components/DetailActionBar.spec.js`
```
it('passes the action title onto the visible button as a tooltip')
```
- Red: `btn.attributes('title')` returned `undefined`.
- Green: After adding `:title="a.title"` to `<BaseButton>`.

### Tests 3 & 4 — `buildNcActions` completing + open loading (added to existing spec)
**File:** `src/components/nonconformances/ncDetailConfig.spec.js`
```
it('approve action is disabled and loading while completing is true')
it('open action has loading=true while saving is true')
```
Both passed green immediately (pure function, no TDD red phase needed separately — implementation was written simultaneously with tests).

---

## Verify Command Outputs

### Tests (all 3 spec files):
```
Test Files  3 passed (3)
Tests  36 passed (36)
Start at  19:38:51
Duration  887ms
```

### ESLint:
```
(no output — clean)
```
Note: `eslint-auto-import.js` in the worktree was stale (missing `defineDetailConfig` and related composables added by the feature branch). Copied the up-to-date version from the main checkout — this is a pre-existing issue, not introduced by this fix.

### Build:
```
✓ built in 31.93s
(chunk size warnings only — pre-existing, not introduced by this fix)
```

---

## Deferred / Blocked

Nothing deferred. All 4 fixes are implemented, tested green, lint-clean, and build-verified.
