# Date & Time Component System — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design); implementation pending plan
**Author:** Frontend / Design System

## Problem

Date and time UI is scattered across many overlapping implementations with inconsistent APIs, styling, and value shapes. This causes duplicated logic and ongoing maintenance pain.

### Current inventory (audited)

Core pickers (`resource/js/shared/components/`):

- `BaseDatePicker.vue` (~72 lines) — single date, wraps `v-calendar`. v-model: `DateTime | null`.
- `BaseDatePickerDropMenu.vue` (~44) + `BaseDatePickerDropMenuPanel.vue` (~150+) — popover + the actual `v-calendar` implementation, restyled by hacking the rendered DOM via a `MutationObserver`. Hard-coded shortcuts (TODAY, ENDOFMONTH, ENDQ1–Q4).
- `BaseDateTimePicker.vue` (~42) — composes `BaseDatePicker` + `BaseTimePicker`. v-model: `DateTime | null`.
- `BaseTimePicker.vue` (~112) — 12h time via `<select>`s. v-model: `timeInMins: Number`.
- `BaseDateRangeInput.vue` (~338) — range picker with 14 hard-coded presets. v-model: `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`.

Filters:

- `DateRangeFilter.vue` (`src/components/menus/`, ~52) — from/to range filter used in 20+ toolbars; bridges ISO strings ↔ `DateTime` for `BaseDatePicker`.
- `BaseFilterMenu.vue` / `BaseFilterFlyout.vue` / `BaseFilterItem.vue` — descriptor-driven cascading filter framework. **Date-agnostic today**; date filtering is bolted on beside it via `DateRangeFilter`.

Utilities:

- `src/extensions/datetime.js` — `DateTime.prototype.formatDate(mode)` (project-wide formatter, local time).
- `src/utils/listFilters.js` — `dateInRange(value, from, to)`.
- `src/components/form/DynamicForm.js` — renders `date`/`datetime`/`time` field types, converting ISO ↔ `DateTime`.

Out of scope (domain-specific, may consume `BaseCalendar` later but are not migrated here): `CronPicker.vue`, `AuditScheduleCalendar.vue`, `TimezoneDropdown.vue`, `BaseTimeline.vue`.

Dependencies: `luxon` 3.7.2 (canonical date lib), `v-calendar` 3.1.2 (to be removed). No flatpickr/dayjs/vuepic.

### Confirmed problems

- Inconsistent v-model shapes: `DateTime | null`, ISO strings, `Number` minutes, `{from,to}` strings.
- Duplicated preset/shortcut logic in 3+ places.
- `v-calendar` styled by DOM-hacking → inconsistent look, weak keyboard a11y.
- No real date operators in the advanced-filter system.

## Goals

A single, layered, prop-driven date/time system that replaces the seven core components, integrates first-class date operators into the advanced-filter framework, ships complete Storybook coverage, and removes the duplicate implementations and the `v-calendar` dependency.

## Non-goals

- TypeScript adoption. The codebase is 100% plain JS (`<script setup>`, JSDoc, `.stories.js`/`.spec.js` per `CLAUDE.md`); these components match that. (Brief requested TS; explicitly overridden to keep DS consistency.)
- App-wide timezone overhaul (`dt.formatDate`, stored values) — only an opt-in per-field `timezone` prop.
- Migrating the domain components listed above.

## Decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Language | Plain JS + JSDoc (match DS) |
| Sequencing | One architecture spec, built & migrated in reviewable slices |
| Value type | luxon `DateTime` by default; `valueFormat="iso"` opt-out |
| Calendar engine | Custom headless `BaseCalendar`; drop `v-calendar` |
| Architecture | 3 components + 1 composable |
| Migration depth | Replace 7 core pickers; add date operators to `BaseFilterMenu`; leave domain components alone |
| Relative dates | Stay dynamic (token-based, re-evaluated at run time) |
| Timezone | Optional `timezone` prop, default local |

## Architecture

```
src/utils/dateRanges.js          pure resolvers: presets + relative tokens → { start, end }; resolveDateFilter(token, now)
src/composables/useDateField.js  headless: parse/normalize per mode, range state machine, manual input, preset resolution
resource/js/shared/components/
  BaseCalendar.vue               headless grid: day/month/year views, keyboard nav, ARIA, min/max/disabled, range highlight
  BaseDateField.vue              input + popover field, mode-driven (composes BaseCalendar + time panel)
  BaseDateFilter.vue             operator editor for advanced filters (composes BaseDateField)
```

`BaseFilterMenu` gains a `type: 'date'` descriptor node; `BaseFilterFlyout`/`BaseFilterItem` render `BaseDateFilter` for it. The token is stored in the existing flat filter model keyed by group id.

Each unit has one responsibility and a well-defined interface:

- `dateRanges.js` — pure functions, no Vue. Testable in isolation.
- `useDateField` — all stateful field logic, no markup. Shared by field and filter so neither duplicates parsing/range logic.
- `BaseCalendar` — grid + navigation + selection only. No input, no popover.
- `BaseDateField` — composes the above into a complete field.
- `BaseDateFilter` — operator semantics on top of the field.

## Value contract

- Default v-model: luxon `DateTime` or `null`. `valueFormat="iso"` makes the component emit/accept ISO strings (`YYYY-MM-DD` for date/month/year, full ISO for datetime, `HH:mm` for time).
- Shape by `mode`:
  - `date` / `datetime` / `time` / `month` / `year` → `DateTime`
  - `multiple` (date mode) → `DateTime[]`
  - `range` → `{ start: DateTime|null, end: DateTime|null }`
- Display: `dt.formatDate()` by default; `displayFormat` (luxon format) overrides.

## `BaseDateField` API

Props (curated from the brief; bloat pruned):

- `modelValue` — see value contract.
- `mode` — `date` (default) | `datetime` | `time` | `range` | `month` | `year`.
- `valueFormat` — `datetime` (default, luxon `DateTime`) | `iso`.
- `displayFormat` — optional luxon format string for the trigger text.
- `minDate`, `maxDate` — `DateTime | ISO string`.
- `disabledDates` — array of dates **or** a predicate `(DateTime) => boolean`.
- `disabled`, `readonly`, `clearable`, `required` — booleans.
- `multiple` — boolean (date mode multi-select).
- `placeholder` — string.
- `size` — `sm` | `md` (default) | `lg`.
- `density` — `comfortable` (default) | `compact`.
- `error` — string | boolean (validation display).
- `helperText` — string.
- `loading` — boolean.
- `autofocus` — boolean.
- `allowManualInput` — boolean (default `true`) — type-to-fill with parse.
- `weekNumbers` — boolean.
- `firstDayOfWeek` — luxon weekday `1`=Mon … `7`=Sun (default `1`).
- `showToday` — boolean (Today shortcut button).
- `presets` — array of preset descriptors (range mode); default set below; `[]` disables.
- `timezone` — IANA string; when set, calendar math + display use `setZone`; default local.
- `locale` — optional luxon locale pass-through.

Events: `update:modelValue`, `change`, `clear`, `focus`, `blur`, `open`, `close`.

**Pruned from the brief:** standalone `validation` function prop — errors are surfaced via `error`/`helperText` + events, matching the project's save-then-show-error inline-edit pattern. `format` folded into `displayFormat` (display) + `valueFormat` (emitted type).

## `BaseCalendar` API

Headless grid primitive.

Props: `modelValue` (`DateTime | DateTime[] | {start,end}`), `selectionMode` (`single` | `multiple` | `range`), `view` (`day` | `month` | `year`, internal nav state), `minDate`, `maxDate`, `disabledDates`, `firstDayOfWeek`, `weekNumbers`, `showToday`, `timezone`, `locale`.

Events: `update:modelValue`, `navigate` (view/focus changes).

Keyboard: arrows move focus by day; PageUp/PageDown by month; Shift+PageUp/Down by year; Home/End to week bounds; Enter/Space select; Esc closes (handled by field); roving `tabindex` + `aria-selected`/`aria-disabled` + `role="grid"`.

## `BaseDateFilter` API & token model

v-model is a token (stays dynamic so saved filters re-evaluate):

```js
{
  operator: 'eq' | 'neq' | 'before' | 'after' | 'onBefore' | 'onAfter'
          | 'between' | 'notBetween' | 'empty' | 'notEmpty' | 'relative',
  value,        // DateTime (or ISO when serialized) — single-date operators
  value2,       // DateTime — for between / notBetween
  relative: { dir: 'past' | 'next' | 'this', unit: 'day'|'week'|'month'|'quarter'|'year', count }
}
```

`resolveDateFilter(token, now)` (in `dateRanges.js`) returns a normalized `{ start, end }` window and/or a predicate `(DateTime) => boolean`, replacing scattered `dateInRange` usage. Relative tokens are stored verbatim and resolved at filter run time.

UI mirrors Linear/Jira: operator dropdown → contextual value control (single date, two dates for between, count+unit for relative, nothing for empty/notEmpty).

## Defaults (centralized constants)

Range presets (`presets` default): Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month, This Quarter, Last Quarter, This Year, Last Year, Custom.

Filter relative options: Today, Yesterday, Last X Days, Next X Days, Current/Previous Month, Current Quarter, Current Year.

Both live in one constant module so they are reusable everywhere and defined once.

## Storybook coverage

Per component, stories for every state from the brief: Default; each `mode` (Date, DateTime, Time, Range, Month, Year); Disabled; Readonly; Loading; Validation Error; Min Date; Max Date; Multiple; Presets; Advanced Filter; Table/Compact (compact density in a narrow container); Mobile (narrow viewport); Keyboard Navigation; Empty; Prefilled; Dark Mode (if the DS themes dark).

## Testing

Vitest specs:

- `dateRanges.spec.js` — every preset and relative token resolves to the correct `{start,end}`; `resolveDateFilter` for each operator including boundaries (inclusive on/before/after).
- `useDateField.spec.js` — value normalization per mode, ISO ↔ DateTime round-trip, range state machine, manual-input parse/reject.
- `BaseCalendar.spec.js` — keyboard navigation, min/max/disabled gating, range highlight, view switching.
- `BaseDateField.spec.js` — mode behaviors, clearable/required, emitted value shapes, `valueFormat="iso"`.
- `BaseDateFilter.spec.js` — token serialization per operator, contextual value controls.

## Migration plan (slices)

Each slice is independently reviewable and leaves the app green.

1. **Primitives** — `dateRanges.js` + `useDateField` + `BaseCalendar` (+ stories/specs). No consumer changes yet.
2. **Field** — `BaseDateField` (all modes) + stories/specs. Drop-in replace `BaseDatePicker`, `BaseDateTimePicker`, `BaseTimePicker`, `BaseDateRangeInput` at call sites; update `DynamicForm.js` date/datetime/time field rendering.
3. **Filter** — `BaseDateFilter` + `BaseFilterMenu` `type:'date'` node (+ flyout/item rendering). Migrate the 20+ toolbars off `DateRangeFilter`; route their filtering through `resolveDateFilter`.
4. **Cleanup** — delete `BaseDatePicker`, `BaseDatePickerDropMenu`, `BaseDatePickerDropMenuPanel`, `BaseDateTimePicker`, `BaseTimePicker`, `BaseDateRangeInput`, `DateRangeFilter`; remove the `v-calendar` dependency; grep/lint clean; final Storybook pass.

## Risks

- **Custom calendar a11y/keyboard** is the highest-effort, highest-value piece — covered by dedicated specs and a Keyboard Navigation story.
- **Toolbar migration breadth** (20+ call sites) — mechanical but wide; do per-file with verification, since these are auth-gated pages the user must eyeball.
- **`DynamicForm` ISO bridging** — must preserve current stored-string behavior via `valueFormat="iso"`.
