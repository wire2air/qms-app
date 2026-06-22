# Date & Time Component System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace seven scattered date/time components with a layered family — `BaseCalendar` + `BaseDateField` + `BaseDateFilter` (+ a `useDateField` composable and pure range utilities) — add first-class date operators to the advanced-filter framework, ship full Storybook coverage, migrate every call site, and delete the obsolete components and the `v-calendar` dependency.

**Architecture:** Pure resolvers (`dateRanges.js`) → headless composable (`useDateField.js`) → headless grid (`BaseCalendar.vue`) → field (`BaseDateField.vue`) → filter editor (`BaseDateFilter.vue`) → `BaseFilterMenu` `type:'date'` node. Built and migrated in four reviewable slices, each leaving the app green.

**Tech Stack:** Vue 3 (`<script setup>`, plain JS + JSDoc), Tailwind (`tw:` prefix), luxon `DateTime`, `@tabler/icons-vue`, `@floating-ui/dom` (already used by the flyout), Vitest 4, Storybook 10 (`@storybook/vue3-vite`).

## Global Constraints

Copied verbatim from `CLAUDE.md` and the spec. Every task's requirements implicitly include these.

- Plain JavaScript only — `<script setup>` with **no** `lang="ts"`. JSDoc for prop typing. (Brief asked for TS; explicitly overridden to keep DS consistency.)
- Components in `src/components/` and `resource/js/shared/components/`, Vue APIs (`ref`, `computed`, `watch`, `onMounted`, `provide`, `inject`, `nextTick`, `onBeforeUnmount`, `onUnmounted`), `vueuse`, and `vue-router` are **auto-imported** — no explicit imports for them in `.vue` files.
- Icons are **not** auto-imported: `import { IconCalendar } from '@tabler/icons-vue'`. Never any other icon library.
- Tailwind classes carry the `tw:` prefix: `tw:flex tw:gap-2`.
- No `<form>` elements. Clickable non-buttons must be keyboard-operable; prefer real `<button>`.
- Use `defineModel` for v-model. Define functions with the `function` keyword, not arrow consts.
- Dates are luxon `DateTime`; format only via `dt.formatDate('date'|'datetime')` — never `.toFormat()`/`.toISO()` for display in components.
- PascalCase component usage in templates. Reuse `Base*` before building.
- New shared components live in `resource/js/shared/components/`; each ships a `.stories.js` and a `.spec.js` sibling.
- The `@shared` import alias maps to `resource/js/shared` (used from `.js` render files like `DynamicForm.js`).
- Value contract: v-model is luxon `DateTime | null` by default; `valueFormat="iso"` emits/accepts ISO strings. Range = `{ start, end }`; `multiple` date = `DateTime[]`.
- Tests run with `npm run test` (`vitest run`); a single file with `npx vitest run <path>`.

---

## File Structure

**Create:**
- `src/utils/dateRanges.js` — pure preset + relative-token + operator resolvers.
- `src/utils/dateRanges.spec.js` — its tests.
- `src/composables/useDateField.js` — headless field logic (parse/normalize/range state).
- `src/composables/useDateField.spec.js` — its tests.
- `resource/js/shared/components/BaseCalendar.vue` (+ `.spec.js`, `.stories.js`)
- `resource/js/shared/components/BaseDateField.vue` (+ `.spec.js`, `.stories.js`)
- `resource/js/shared/components/BaseDateFilter.vue` (+ `.spec.js`, `.stories.js`)

**Modify:**
- `resource/js/shared/components/BaseFilterFlyout.vue` — render `BaseDateFilter` for `type:'date'` nodes.
- `resource/js/shared/composables/filterMenuHelpers.js` — treat a date node's token as an active group; helper to read/write its value.
- `src/components/form/DynamicForm.js:262-333` — swap the three legacy pickers for `BaseDateField`.
- `src/utils/listFilters.js` — re-implement `dateInRange` on top of `resolveDateFilter` (keep the signature).
- 7 filter toolbars + 8 list components (date migration) — enumerated in Slice 3/4.
- 1 `BaseDateRangeInput` consumer (`FieldRecordsList.vue`).
- ~18 form sites using `BaseDatePicker` (mechanical rename).
- `package.json` — remove `v-calendar`; `src/main.js` — remove its setup.

**Delete (Slice 4):** `BaseDatePicker.vue` (+`.stories.js`), `BaseDatePickerDropMenu.vue`, `BaseDatePickerDropMenuPanel.vue`, `BaseDateTimePicker.vue` (+`.stories.js`), `BaseTimePicker.vue` (+`.stories.js`), `BaseDateRangeInput.vue` (+`.stories.js`), `src/components/menus/DateRangeFilter.vue`.

---

# SLICE 1 — Pure primitives (no consumer changes)

### Task 1: `dateRanges.js` — preset resolvers

**Files:**
- Create: `src/utils/dateRanges.js`
- Test: `src/utils/dateRanges.spec.js`

**Interfaces:**
- Produces: `PRESETS` (array of `{ id, label, range(now?) → { start: DateTime, end: DateTime } }`), `resolvePreset(id, now?) → { start, end } | null`.
- Consumes: luxon `DateTime`.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/dateRanges.spec.js
import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { PRESETS, resolvePreset } from './dateRanges.js'

const NOW = DateTime.fromISO('2026-06-22T15:30:00') // a Monday

describe('resolvePreset', () => {
  it('today spans the start and end of the current day', () => {
    const { start, end } = resolvePreset('today', NOW)
    expect(start.toISO()).toBe(NOW.startOf('day').toISO())
    expect(end.toISO()).toBe(NOW.endOf('day').toISO())
  })

  it('last_7_days covers 7 days inclusive ending today', () => {
    const { start, end } = resolvePreset('last_7_days', NOW)
    expect(start.toISODate()).toBe('2026-06-16')
    expect(end.toISODate()).toBe('2026-06-22')
  })

  it('this_month starts on the 1st', () => {
    const { start, end } = resolvePreset('this_month', NOW)
    expect(start.toISODate()).toBe('2026-06-01')
    expect(end.toISODate()).toBe('2026-06-30')
  })

  it('last_quarter is the previous calendar quarter', () => {
    const { start, end } = resolvePreset('last_quarter', NOW) // Q2 → Q1
    expect(start.toISODate()).toBe('2026-01-01')
    expect(end.toISODate()).toBe('2026-03-31')
  })

  it('exposes a Custom preset with a null range and returns null for unknown ids', () => {
    expect(PRESETS.find((p) => p.id === 'custom')).toBeTruthy()
    expect(resolvePreset('nope', NOW)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dateRanges.spec.js`
Expected: FAIL — "Failed to resolve import './dateRanges.js'".

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/dateRanges.js
import { DateTime } from 'luxon'

/**
 * Pure date-range resolvers shared by BaseDateField (presets) and BaseDateFilter
 * (relative tokens / operators). No Vue. `now` is injectable for deterministic
 * tests; defaults to DateTime.now().
 *
 * A resolved range is always `{ start: DateTime, end: DateTime }` with `start`
 * at startOf('day') and `end` at endOf('day') (inclusive window).
 */

function dayStart(dt) {
  return dt.startOf('day')
}
function dayEnd(dt) {
  return dt.endOf('day')
}

/** Preset descriptors. `range(now)` returns null for the open-ended Custom row. */
export const PRESETS = [
  { id: 'today', label: 'Today', range: (n) => ({ start: dayStart(n), end: dayEnd(n) }) },
  {
    id: 'yesterday',
    label: 'Yesterday',
    range: (n) => {
      const d = n.minus({ days: 1 })
      return { start: dayStart(d), end: dayEnd(d) }
    },
  },
  {
    id: 'last_7_days',
    label: 'Last 7 Days',
    range: (n) => ({ start: dayStart(n.minus({ days: 6 })), end: dayEnd(n) }),
  },
  {
    id: 'last_30_days',
    label: 'Last 30 Days',
    range: (n) => ({ start: dayStart(n.minus({ days: 29 })), end: dayEnd(n) }),
  },
  {
    id: 'this_month',
    label: 'This Month',
    range: (n) => ({ start: n.startOf('month'), end: n.endOf('month') }),
  },
  {
    id: 'last_month',
    label: 'Last Month',
    range: (n) => {
      const d = n.minus({ months: 1 })
      return { start: d.startOf('month'), end: d.endOf('month') }
    },
  },
  {
    id: 'this_quarter',
    label: 'This Quarter',
    range: (n) => ({ start: n.startOf('quarter'), end: n.endOf('quarter') }),
  },
  {
    id: 'last_quarter',
    label: 'Last Quarter',
    range: (n) => {
      const d = n.minus({ quarters: 1 })
      return { start: d.startOf('quarter'), end: d.endOf('quarter') }
    },
  },
  {
    id: 'this_year',
    label: 'This Year',
    range: (n) => ({ start: n.startOf('year'), end: n.endOf('year') }),
  },
  {
    id: 'last_year',
    label: 'Last Year',
    range: (n) => {
      const d = n.minus({ years: 1 })
      return { start: d.startOf('year'), end: d.endOf('year') }
    },
  },
  { id: 'custom', label: 'Custom', range: () => null },
]

/** Resolve a preset id to a concrete `{ start, end }`; null if unknown or custom. */
export function resolvePreset(id, now = DateTime.now()) {
  const preset = PRESETS.find((p) => p.id === id)
  if (!preset) return null
  return preset.range(now)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/dateRanges.spec.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/dateRanges.js src/utils/dateRanges.spec.js
git commit -m "feat(ds): date-range preset resolvers"
```

---

### Task 2: `dateRanges.js` — relative tokens + `resolveDateFilter`

**Files:**
- Modify: `src/utils/dateRanges.js`
- Test: `src/utils/dateRanges.spec.js`

**Interfaces:**
- Consumes: `resolvePreset` (Task 1), luxon `DateTime`.
- Produces:
  - `resolveRelative({ dir, unit, count }, now?) → { start, end }` where `dir ∈ 'past'|'next'|'this'`, `unit ∈ 'day'|'week'|'month'|'quarter'|'year'`.
  - `resolveDateFilter(token, now?) → { start: DateTime|null, end: DateTime|null }` for a filter token `{ operator, value, value2, relative }`. `operator ∈ 'eq'|'neq'|'before'|'after'|'onBefore'|'onAfter'|'between'|'notBetween'|'empty'|'notEmpty'|'relative'`. `value`/`value2` are `DateTime | ISO string | null`.
  - `matchesDateFilter(date, token, now?) → boolean` — applies the token to a single `DateTime | ISO string`.
  - `OPERATORS` (array of `{ id, label }`).

- [ ] **Step 1: Write the failing test**

```js
// append to src/utils/dateRanges.spec.js
import { resolveRelative, resolveDateFilter, matchesDateFilter, OPERATORS } from './dateRanges.js'

describe('resolveRelative', () => {
  it('past 7 days ends today, starts 6 days earlier', () => {
    const { start, end } = resolveRelative({ dir: 'past', unit: 'day', count: 7 }, NOW)
    expect(start.toISODate()).toBe('2026-06-16')
    expect(end.toISODate()).toBe('2026-06-22')
  })
  it('next 3 days starts today, ends 2 days later', () => {
    const { start, end } = resolveRelative({ dir: 'next', unit: 'day', count: 3 }, NOW)
    expect(start.toISODate()).toBe('2026-06-22')
    expect(end.toISODate()).toBe('2026-06-24')
  })
  it('this month maps to the calendar month', () => {
    const { start, end } = resolveRelative({ dir: 'this', unit: 'month' }, NOW)
    expect(start.toISODate()).toBe('2026-06-01')
    expect(end.toISODate()).toBe('2026-06-30')
  })
})

describe('matchesDateFilter', () => {
  const at = (iso) => DateTime.fromISO(iso)
  it('before is exclusive of the boundary day', () => {
    const token = { operator: 'before', value: '2026-06-22' }
    expect(matchesDateFilter(at('2026-06-21T23:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-22T01:00'), token, NOW)).toBe(false)
  })
  it('onOrAfter includes the boundary day', () => {
    const token = { operator: 'onAfter', value: '2026-06-22' }
    expect(matchesDateFilter(at('2026-06-22T00:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-21T23:00'), token, NOW)).toBe(false)
  })
  it('between is inclusive on both ends', () => {
    const token = { operator: 'between', value: '2026-06-10', value2: '2026-06-20' }
    expect(matchesDateFilter(at('2026-06-10T00:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-20T23:00'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-21T00:00'), token, NOW)).toBe(false)
  })
  it('empty / notEmpty test presence', () => {
    expect(matchesDateFilter(null, { operator: 'empty' }, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-10'), { operator: 'empty' }, NOW)).toBe(false)
    expect(matchesDateFilter(at('2026-06-10'), { operator: 'notEmpty' }, NOW)).toBe(true)
  })
  it('relative re-evaluates against now', () => {
    const token = { operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } }
    expect(matchesDateFilter(at('2026-06-18'), token, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-01'), token, NOW)).toBe(false)
  })
  it('no operator matches everything (acts as no-op)', () => {
    expect(matchesDateFilter(at('2026-06-10'), null, NOW)).toBe(true)
    expect(matchesDateFilter(at('2026-06-10'), {}, NOW)).toBe(true)
  })
})

describe('OPERATORS', () => {
  it('lists the full operator set', () => {
    expect(OPERATORS.map((o) => o.id)).toEqual([
      'eq', 'neq', 'before', 'after', 'onBefore', 'onAfter',
      'between', 'notBetween', 'empty', 'notEmpty', 'relative',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/dateRanges.spec.js`
Expected: FAIL — "resolveRelative is not a function".

- [ ] **Step 3: Write minimal implementation**

```js
// append to src/utils/dateRanges.js

/** Operator catalogue for the advanced-filter editor (id + display label). */
export const OPERATORS = [
  { id: 'eq', label: 'Equals' },
  { id: 'neq', label: 'Not equals' },
  { id: 'before', label: 'Before' },
  { id: 'after', label: 'After' },
  { id: 'onBefore', label: 'On or before' },
  { id: 'onAfter', label: 'On or after' },
  { id: 'between', label: 'Between' },
  { id: 'notBetween', label: 'Not between' },
  { id: 'empty', label: 'Is empty' },
  { id: 'notEmpty', label: 'Is not empty' },
  { id: 'relative', label: 'Relative' },
]

/** Coerce DateTime | ISO string | null → DateTime | null. */
function toDateTime(v) {
  if (!v) return null
  if (DateTime.isDateTime(v)) return v.isValid ? v : null
  const dt = DateTime.fromISO(String(v))
  return dt.isValid ? dt : null
}

/**
 * Resolve a relative token to `{ start, end }`.
 *  - dir 'past': window of `count` `unit`s ending today (inclusive)
 *  - dir 'next': window of `count` `unit`s starting today (inclusive)
 *  - dir 'this': the current calendar `unit`
 */
export function resolveRelative({ dir, unit, count = 1 } = {}, now = DateTime.now()) {
  if (dir === 'this') {
    return { start: now.startOf(unit), end: now.endOf(unit) }
  }
  if (dir === 'next') {
    return { start: now.startOf('day'), end: now.plus({ [`${unit}s`]: count - 1 }).endOf('day') }
  }
  // 'past' (default)
  return { start: now.minus({ [`${unit}s`]: count - 1 }).startOf('day'), end: now.endOf('day') }
}

/**
 * Resolve a filter token to a `{ start, end }` window (either bound may be null
 * = unbounded). Boundary semantics: before/after are exclusive of the boundary
 * DAY; onBefore/onAfter and between are inclusive. empty/notEmpty/neq/notBetween
 * return an open window — use matchesDateFilter for the actual predicate.
 */
export function resolveDateFilter(token, now = DateTime.now()) {
  if (!token || !token.operator) return { start: null, end: null }
  const a = toDateTime(token.value)
  const b = toDateTime(token.value2)
  switch (token.operator) {
    case 'eq':
      return a ? { start: a.startOf('day'), end: a.endOf('day') } : { start: null, end: null }
    case 'before':
      return { start: null, end: a ? a.startOf('day').minus({ milliseconds: 1 }) : null }
    case 'onBefore':
      return { start: null, end: a ? a.endOf('day') : null }
    case 'after':
      return { start: a ? a.endOf('day').plus({ milliseconds: 1 }) : null, end: null }
    case 'onAfter':
      return { start: a ? a.startOf('day') : null, end: null }
    case 'between':
      return { start: a ? a.startOf('day') : null, end: b ? b.endOf('day') : null }
    case 'relative':
      return resolveRelative(token.relative, now)
    default:
      return { start: null, end: null }
  }
}

/** Apply a token to a single date. Returns true when the date passes the filter. */
export function matchesDateFilter(date, token, now = DateTime.now()) {
  if (!token || !token.operator) return true
  const d = toDateTime(date)
  if (token.operator === 'empty') return d == null
  if (token.operator === 'notEmpty') return d != null
  if (d == null) return false
  const ms = d.toMillis()

  if (token.operator === 'neq') {
    const a = toDateTime(token.value)
    if (!a) return true
    return !(ms >= a.startOf('day').toMillis() && ms <= a.endOf('day').toMillis())
  }
  if (token.operator === 'notBetween') {
    const a = toDateTime(token.value)
    const b = toDateTime(token.value2)
    const lo = a ? a.startOf('day').toMillis() : -Infinity
    const hi = b ? b.endOf('day').toMillis() : Infinity
    return !(ms >= lo && ms <= hi)
  }
  const { start, end } = resolveDateFilter(token, now)
  if (start && ms < start.toMillis()) return false
  if (end && ms > end.toMillis()) return false
  return true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/dateRanges.spec.js`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/utils/dateRanges.js src/utils/dateRanges.spec.js
git commit -m "feat(ds): relative-date tokens + resolveDateFilter / matchesDateFilter"
```

---

### Task 3: `useDateField.js` — value normalization + parsing

**Files:**
- Create: `src/composables/useDateField.js`
- Test: `src/composables/useDateField.spec.js`

**Interfaces:**
- Consumes: luxon `DateTime`.
- Produces (pure helpers, exported alongside the composable for unit testing):
  - `toModel(dt, mode, valueFormat) → DateTime | string | null` — convert an internal `DateTime` to the emitted value.
  - `fromModel(value, mode, valueFormat) → DateTime | null` — parse an incoming model value to an internal `DateTime`.
  - `parseManual(text, mode) → DateTime | null` — lenient parse of typed text (`yyyy-MM-dd`, `MM/dd/yyyy`, ISO, `HH:mm`).
  - `formatField(dt, mode, displayFormat) → string` — trigger text via `dt.formatDate`, or a luxon format if `displayFormat` given.
  - `useDateField(opts)` — composable returning `{ internal, displayText, commit, clear }` (used by `BaseDateField`).

- [ ] **Step 1: Write the failing test**

```js
// src/composables/useDateField.spec.js
import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import { toModel, fromModel, parseManual, formatField } from './useDateField.js'

const D = DateTime.fromISO('2026-06-22T09:05:00')

describe('toModel / fromModel round-trip', () => {
  it('default valueFormat keeps DateTime instances', () => {
    expect(toModel(D, 'date', 'datetime')).toBe(D)
    expect(fromModel(D, 'date', 'datetime')).toBe(D)
  })
  it('valueFormat iso emits ISO date for date mode', () => {
    expect(toModel(D, 'date', 'iso')).toBe('2026-06-22')
    expect(fromModel('2026-06-22', 'date', 'iso').toISODate()).toBe('2026-06-22')
  })
  it('valueFormat iso emits full ISO for datetime mode', () => {
    expect(toModel(D, 'datetime', 'iso')).toBe(D.toISO())
  })
  it('valueFormat iso emits HH:mm for time mode', () => {
    expect(toModel(D, 'time', 'iso')).toBe('09:05')
  })
  it('null passes through', () => {
    expect(toModel(null, 'date', 'datetime')).toBeNull()
    expect(fromModel(null, 'date', 'iso')).toBeNull()
  })
})

describe('parseManual', () => {
  it('parses ISO and US formats for date mode', () => {
    expect(parseManual('2026-06-22', 'date').toISODate()).toBe('2026-06-22')
    expect(parseManual('06/22/2026', 'date').toISODate()).toBe('2026-06-22')
  })
  it('parses HH:mm for time mode', () => {
    expect(parseManual('09:05', 'time').toFormat('HH:mm')).toBe('09:05')
  })
  it('returns null on garbage', () => {
    expect(parseManual('not a date', 'date')).toBeNull()
  })
})

describe('formatField', () => {
  it('uses dt.formatDate by default', () => {
    expect(formatField(D, 'date')).toBe(D.formatDate('date'))
    expect(formatField(D, 'datetime')).toBe(D.formatDate('datetime'))
  })
  it('honours an explicit displayFormat', () => {
    expect(formatField(D, 'date', 'yyyy/MM/dd')).toBe('2026/06/22')
  })
  it('returns empty string for null', () => {
    expect(formatField(null, 'date')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/useDateField.spec.js`
Expected: FAIL — cannot resolve `./useDateField.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/composables/useDateField.js
import { DateTime } from 'luxon'

/**
 * Headless logic for BaseDateField — keeps parsing/normalisation out of the
 * component so it is unit-testable and shared with BaseDateFilter.
 *
 * `mode`        : 'date' | 'datetime' | 'time' | 'range' | 'month' | 'year'
 * `valueFormat` : 'datetime' (luxon DateTime, default) | 'iso' (string)
 */

/** Internal DateTime → emitted model value. */
export function toModel(dt, mode, valueFormat = 'datetime') {
  if (!dt) return null
  if (valueFormat !== 'iso') return dt
  if (mode === 'time') return dt.toFormat('HH:mm')
  if (mode === 'datetime') return dt.toISO()
  return dt.toISODate() // date | month | year
}

/** Incoming model value → internal DateTime. */
export function fromModel(value, mode, valueFormat = 'datetime') {
  if (!value) return null
  if (DateTime.isDateTime(value)) return value.isValid ? value : null
  if (valueFormat === 'iso') {
    if (mode === 'time') {
      const dt = DateTime.fromFormat(String(value), 'HH:mm')
      return dt.isValid ? dt : null
    }
    const dt = DateTime.fromISO(String(value))
    return dt.isValid ? dt : null
  }
  const dt = DateTime.fromISO(String(value))
  return dt.isValid ? dt : null
}

const DATE_FORMATS = ['yyyy-MM-dd', 'MM/dd/yyyy', 'M/d/yyyy', 'LLL d, yyyy']
const TIME_FORMATS = ['HH:mm', 'h:mm a', 'h:mma']

/** Lenient parse of typed text into a DateTime, or null. */
export function parseManual(text, mode) {
  const t = (text || '').trim()
  if (!t) return null
  const formats = mode === 'time' ? TIME_FORMATS : DATE_FORMATS
  for (const f of formats) {
    const dt = DateTime.fromFormat(t, f)
    if (dt.isValid) return dt
  }
  const iso = DateTime.fromISO(t)
  return iso.isValid ? iso : null
}

/** Trigger display text. */
export function formatField(dt, mode, displayFormat) {
  if (!dt) return ''
  if (displayFormat) return dt.toFormat(displayFormat)
  if (mode === 'time') return dt.toFormat('h:mm a')
  return dt.formatDate(mode === 'datetime' ? 'datetime' : 'date')
}

/**
 * Composable used by BaseDateField. `opts` is a reactive bag of getters:
 *   { model, mode, valueFormat, displayFormat }
 * Returns the internal DateTime ref + commit/clear that write back through
 * toModel so the field component stays declarative.
 */
export function useDateField(opts) {
  const internal = computed(() => fromModel(opts.model.value, opts.mode.value, opts.valueFormat.value))
  const displayText = computed(() =>
    formatField(internal.value, opts.mode.value, opts.displayFormat?.value),
  )
  function commit(dt) {
    opts.model.value = toModel(dt, opts.mode.value, opts.valueFormat.value)
  }
  function clear() {
    opts.model.value = null
  }
  return { internal, displayText, commit, clear }
}
```

Note: `computed` is auto-imported in `.vue` files but **not** in plain `.js`. Add at top of this file: `import { computed } from 'vue'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/composables/useDateField.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useDateField.js src/composables/useDateField.spec.js
git commit -m "feat(ds): useDateField — value normalization + manual parse"
```

---

### Task 4: `BaseCalendar.vue` — grid rendering + selection

**Files:**
- Create: `resource/js/shared/components/BaseCalendar.vue`
- Test: `resource/js/shared/components/BaseCalendar.spec.js`

**Interfaces:**
- Consumes: luxon `DateTime`, `IconChevronLeft`/`IconChevronRight` from `@tabler/icons-vue`.
- Produces (props): `modelValue` (`DateTime | DateTime[] | {start,end} | null`), `selectionMode` (`'single'|'multiple'|'range'`, default `'single'`), `minDate`, `maxDate` (`DateTime`), `disabledDates` (`DateTime[]` or `(DateTime)=>boolean`), `firstDayOfWeek` (Number 1–7, default 1), `weekNumbers` (Boolean), `showToday` (Boolean), `timezone` (String), `locale` (String).
- Emits: `update:modelValue`. Each day cell carries `data-day="yyyy-MM-dd"`, `role="gridcell"`, `aria-selected`, `aria-disabled`, roving `tabindex`.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/BaseCalendar.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DateTime } from 'luxon'
import BaseCalendar from './BaseCalendar.vue'

const JUN = DateTime.fromISO('2026-06-15')

function cell(w, iso) {
  return w.find(`[data-day="${iso}"]`)
}

describe('BaseCalendar', () => {
  it('renders a full month grid for the focused date', () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN } })
    expect(cell(w, '2026-06-01').exists()).toBe(true)
    expect(cell(w, '2026-06-30').exists()).toBe(true)
  })

  it('marks the selected day aria-selected', () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN } })
    expect(cell(w, '2026-06-15').attributes('aria-selected')).toBe('true')
  })

  it('emits the clicked day as a DateTime (single mode)', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN } })
    await cell(w, '2026-06-20').trigger('click')
    const emitted = w.emitted('update:modelValue').at(-1)[0]
    expect(DateTime.isDateTime(emitted)).toBe(true)
    expect(emitted.toISODate()).toBe('2026-06-20')
  })

  it('disables days outside [minDate, maxDate]', async () => {
    const w = mount(BaseCalendar, {
      props: { modelValue: JUN, minDate: DateTime.fromISO('2026-06-10'), maxDate: DateTime.fromISO('2026-06-20') },
    })
    expect(cell(w, '2026-06-05').attributes('aria-disabled')).toBe('true')
    await cell(w, '2026-06-05').trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('builds a range across two clicks (range mode)', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: { start: null, end: null }, selectionMode: 'range' } })
    await cell(w, '2026-06-10').trigger('click')
    await cell(w, '2026-06-14').trigger('click')
    const r = w.emitted('update:modelValue').at(-1)[0]
    expect(r.start.toISODate()).toBe('2026-06-10')
    expect(r.end.toISODate()).toBe('2026-06-14')
  })

  it('ArrowRight moves focus to the next day', async () => {
    const w = mount(BaseCalendar, { props: { modelValue: JUN }, attachTo: document.body })
    const start = cell(w, '2026-06-15')
    start.element.focus()
    await start.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(document.activeElement.getAttribute('data-day')).toBe('2026-06-16')
    w.unmount()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseCalendar.spec.js`
Expected: FAIL — cannot resolve `./BaseCalendar.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- resource/js/shared/components/BaseCalendar.vue -->
<script setup>
/**
 * BaseCalendar — headless month grid on luxon. No popover, no input. Renders a
 * focusable, ARIA-correct day grid with month nav, min/max/disabled gating, and
 * single / multiple / range selection. Used by BaseDateField; reusable on its own.
 */
import { DateTime } from 'luxon'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'

const props = defineProps({
  modelValue: { type: [Object, Array, null], default: null }, // DateTime | DateTime[] | {start,end}
  selectionMode: { type: String, default: 'single' }, // 'single' | 'multiple' | 'range'
  minDate: { type: [Object, null], default: null },
  maxDate: { type: [Object, null], default: null },
  disabledDates: { type: [Array, Function, null], default: null },
  firstDayOfWeek: { type: Number, default: 1 }, // 1=Mon … 7=Sun (luxon weekday)
  weekNumbers: { type: Boolean, default: false },
  showToday: { type: Boolean, default: false },
  timezone: { type: String, default: null },
  locale: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

function now() {
  let dt = DateTime.now()
  if (props.timezone) dt = dt.setZone(props.timezone)
  if (props.locale) dt = dt.setLocale(props.locale)
  return dt
}

// Anchor DateTime that drives which month is shown + initial focus.
function anchorOf() {
  const v = props.modelValue
  if (DateTime.isDateTime(v)) return v
  if (Array.isArray(v) && v.length) return v[0]
  if (v && v.start) return v.start
  return now()
}
const viewMonth = ref(anchorOf().startOf('month'))
watch(
  () => props.modelValue,
  () => {
    viewMonth.value = anchorOf().startOf('month')
  },
)
// Pending range start while the user is mid-selection.
const rangeStart = ref(null)

const weekdayLabels = computed(() => {
  const base = viewMonth.value.set({ weekday: props.firstDayOfWeek })
  return Array.from({ length: 7 }, (_, i) => base.plus({ days: i }).toFormat('ccc'))
})

// 6×7 grid of DateTimes covering the visible month.
const weeks = computed(() => {
  const first = viewMonth.value.startOf('month')
  // back up to the configured first day of week
  let cursor = first
  while (cursor.weekday !== props.firstDayOfWeek) cursor = cursor.minus({ days: 1 })
  const out = []
  for (let w = 0; w < 6; w++) {
    const row = []
    for (let d = 0; d < 7; d++) {
      row.push(cursor)
      cursor = cursor.plus({ days: 1 })
    }
    out.push(row)
  }
  return out
})

function isDisabled(day) {
  if (props.minDate && day.startOf('day') < props.minDate.startOf('day')) return true
  if (props.maxDate && day.startOf('day') > props.maxDate.startOf('day')) return true
  if (typeof props.disabledDates === 'function') return !!props.disabledDates(day)
  if (Array.isArray(props.disabledDates))
    return props.disabledDates.some((d) => DateTime.isDateTime(d) && d.hasSame(day, 'day'))
  return false
}
function isSelected(day) {
  const v = props.modelValue
  if (DateTime.isDateTime(v)) return v.hasSame(day, 'day')
  if (Array.isArray(v)) return v.some((d) => DateTime.isDateTime(d) && d.hasSame(day, 'day'))
  if (v && (v.start || v.end)) {
    if (v.start && v.start.hasSame(day, 'day')) return true
    if (v.end && v.end.hasSame(day, 'day')) return true
  }
  return false
}
function isInRange(day) {
  const v = props.modelValue
  if (props.selectionMode !== 'range' || !v?.start || !v?.end) return false
  return day > v.start.startOf('day') && day < v.end.startOf('day')
}
function inMonth(day) {
  return day.hasSame(viewMonth.value, 'month')
}

function select(day) {
  if (isDisabled(day)) return
  if (props.selectionMode === 'single') {
    emit('update:modelValue', day.startOf('day'))
  } else if (props.selectionMode === 'multiple') {
    const cur = Array.isArray(props.modelValue) ? props.modelValue : []
    const exists = cur.find((d) => d.hasSame(day, 'day'))
    emit(
      'update:modelValue',
      exists ? cur.filter((d) => !d.hasSame(day, 'day')) : [...cur, day.startOf('day')],
    )
  } else {
    // range
    if (!rangeStart.value) {
      rangeStart.value = day.startOf('day')
      emit('update:modelValue', { start: day.startOf('day'), end: null })
    } else {
      const a = rangeStart.value
      const b = day.startOf('day')
      const start = a <= b ? a : b
      const end = a <= b ? b : a
      rangeStart.value = null
      emit('update:modelValue', { start, end })
    }
  }
}

function prevMonth() {
  viewMonth.value = viewMonth.value.minus({ months: 1 })
}
function nextMonth() {
  viewMonth.value = viewMonth.value.plus({ months: 1 })
}

// roving focus
function focusDay(iso) {
  nextTick(() => {
    const el = document.querySelector(`[data-day="${iso}"]`)
    el?.focus()
  })
}
function onKey(day, e) {
  const moves = {
    ArrowRight: { days: 1 },
    ArrowLeft: { days: -1 },
    ArrowDown: { days: 7 },
    ArrowUp: { days: -7 },
  }
  if (moves[e.key]) {
    e.preventDefault()
    const next = day.plus(moves[e.key])
    if (!next.hasSame(viewMonth.value, 'month')) viewMonth.value = next.startOf('month')
    focusDay(next.toISODate())
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(day)
  } else if (e.key === 'PageUp') {
    e.preventDefault()
    prevMonth()
  } else if (e.key === 'PageDown') {
    e.preventDefault()
    nextMonth()
  }
}
function selectToday() {
  select(now())
}
</script>

<template>
  <div class="tw:w-72 tw:select-none tw:p-2" role="application" aria-label="Calendar">
    <div class="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:px-1">
      <button
        type="button"
        aria-label="Previous month"
        class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
        @click="prevMonth"
      >
        <IconChevronLeft :size="16" />
      </button>
      <span class="tw:text-sm tw:font-semibold tw:text-on-main">
        {{ viewMonth.toFormat('LLLL yyyy') }}
      </span>
      <button
        type="button"
        aria-label="Next month"
        class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
        @click="nextMonth"
      >
        <IconChevronRight :size="16" />
      </button>
    </div>

    <div role="grid" class="tw:grid tw:grid-cols-7 tw:gap-0.5 tw:text-center">
      <span
        v-for="lbl in weekdayLabels"
        :key="lbl"
        class="tw:py-1 tw:text-micro tw:font-medium tw:uppercase tw:text-secondary"
      >
        {{ lbl }}
      </span>
      <template v-for="(week, wi) in weeks" :key="wi">
        <button
          v-for="day in week"
          :key="day.toISODate()"
          type="button"
          role="gridcell"
          :data-day="day.toISODate()"
          :tabindex="day.hasSame(viewMonth, 'month') && day.day === 1 ? 0 : -1"
          :disabled="isDisabled(day)"
          :aria-selected="isSelected(day) ? 'true' : 'false'"
          :aria-disabled="isDisabled(day) ? 'true' : 'false'"
          class="tw:flex tw:h-9 tw:items-center tw:justify-center tw:rounded-md tw:text-sm tw:outline-none tw:transition-colors tw:focus:ring-2 tw:focus:ring-primary/30 tw:disabled:cursor-not-allowed tw:disabled:opacity-30"
          :class="[
            isSelected(day)
              ? 'tw:bg-primary tw:text-on-primary tw:font-semibold'
              : isInRange(day)
                ? 'tw:bg-primary/10 tw:text-primary'
                : inMonth(day)
                  ? 'tw:text-on-main tw:hover:bg-main-hover'
                  : 'tw:text-placeholder tw:hover:bg-main-hover',
          ]"
          @click="select(day)"
          @keydown="onKey(day, $event)"
        >
          {{ day.day }}
        </button>
      </template>
    </div>

    <div v-if="showToday" class="tw:mt-2 tw:flex tw:justify-center">
      <button
        type="button"
        class="tw:rounded-md tw:px-3 tw:py-1 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-main-hover"
        @click="selectToday"
      >
        Today
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseCalendar.spec.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseCalendar.vue resource/js/shared/components/BaseCalendar.spec.js
git commit -m "feat(ds): BaseCalendar headless month grid"
```

---

### Task 5: `BaseCalendar.stories.js`

**Files:**
- Create: `resource/js/shared/components/BaseCalendar.stories.js`

**Interfaces:** Consumes `BaseCalendar` (Task 4).

- [ ] **Step 1: Write the stories file**

```js
// resource/js/shared/components/BaseCalendar.stories.js
import { ref } from 'vue'
import { DateTime } from 'luxon'
import BaseCalendar from './BaseCalendar.vue'

/**
 * BaseCalendar — headless month grid (day selection, range, min/max, keyboard).
 */
export default {
  title: 'Forms/Date/BaseCalendar',
  component: BaseCalendar,
  tags: ['autodocs'],
}

export const Default = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref(DateTime.now()) }),
    template: `<BaseCalendar v-model="model" />`,
  }),
}

export const RangeSelection = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref({ start: null, end: null }) }),
    template: `<BaseCalendar v-model="model" selectionMode="range" />`,
  }),
}

export const MultipleSelection = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref([]) }),
    template: `<BaseCalendar v-model="model" selectionMode="multiple" />`,
  }),
}

export const MinAndMaxDate = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({
      model: ref(DateTime.now()),
      min: DateTime.now().startOf('month'),
      max: DateTime.now().endOf('month'),
    }),
    template: `<BaseCalendar v-model="model" :minDate="min" :maxDate="max" />`,
  }),
}

export const WithTodayButton = {
  render: () => ({
    components: { BaseCalendar },
    setup: () => ({ model: ref(null) }),
    template: `<BaseCalendar v-model="model" :showToday="true" />`,
  }),
}
```

- [ ] **Step 2: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: build completes without errors referencing `BaseCalendar`.

- [ ] **Step 3: Commit**

```bash
git add resource/js/shared/components/BaseCalendar.stories.js
git commit -m "docs(ds): BaseCalendar stories"
```

---

# SLICE 2 — BaseDateField + drop-in field migration

### Task 6: `BaseDateField.vue` — field shell, date mode, clear/manual input

**Files:**
- Create: `resource/js/shared/components/BaseDateField.vue`
- Test: `resource/js/shared/components/BaseDateField.spec.js`

**Interfaces:**
- Consumes: `useDateField`, `formatField`, `parseManual` from `@/composables/useDateField.js`; `resolvePreset`, `PRESETS` from `@/utils/dateRanges.js`; `BaseCalendar` (auto-imported); `@floating-ui/dom`; icons `IconCalendar`, `IconClock`, `IconChevronDown`, `IconX`.
- Produces (props): `modelValue`, `mode` (default `'date'`), `valueFormat` (default `'datetime'`), `displayFormat`, `minDate`, `maxDate`, `disabledDates`, `disabled`, `readonly`, `clearable`, `required`, `multiple`, `placeholder`, `size` (`'sm'|'md'|'lg'`, default `'md'`), `density` (`'comfortable'|'compact'`, default `'comfortable'`), `error` (`String|Boolean`), `helperText`, `loading`, `autofocus`, `allowManualInput` (default `true`), `weekNumbers`, `firstDayOfWeek` (default 1), `showToday`, `presets` (Array, default = range PRESETS), `timezone`, `locale`.
- Emits: `update:modelValue`, `change`, `clear`, `focus`, `blur`, `open`, `close`.

> Note: With `mode="date"` and the default `valueFormat="datetime"`, `BaseDateField` is a **drop-in replacement** for the old `BaseDatePicker` (DateTime in/out, calendar popover, clearable). This is what makes Slice 2 migration mechanical.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/BaseDateField.spec.js
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js'
import BaseDateField from './BaseDateField.vue'

const mounted = []
function mountField(props = {}) {
  const w = mount(BaseDateField, { attachTo: document.body, props })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  document.body.innerHTML = ''
})

describe('BaseDateField (date mode)', () => {
  it('shows the placeholder when empty', () => {
    const w = mountField({ modelValue: null, placeholder: 'Pick a date' })
    expect(w.get('button').text()).toContain('Pick a date')
  })

  it('formats a DateTime value with dt.formatDate', () => {
    const d = DateTime.fromISO('2026-06-22')
    const w = mountField({ modelValue: d })
    expect(w.get('button').text()).toContain(d.formatDate('date'))
  })

  it('opens the calendar popover on click and emits open', async () => {
    const w = mountField({ modelValue: null })
    await w.get('button').trigger('click')
    await nextTick()
    expect(document.body.querySelector('[role="application"]')).not.toBeNull()
    expect(w.emitted('open')).toBeTruthy()
  })

  it('emits a DateTime when a day is picked', async () => {
    const w = mountField({ modelValue: DateTime.fromISO('2026-06-15') })
    await w.get('button').trigger('click')
    await nextTick()
    document.body.querySelector('[data-day="2026-06-20"]').click()
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(v.toISODate()).toBe('2026-06-20')
  })

  it('valueFormat=iso emits an ISO date string', async () => {
    const w = mountField({ modelValue: '2026-06-15', valueFormat: 'iso' })
    await w.get('button').trigger('click')
    await nextTick()
    document.body.querySelector('[data-day="2026-06-20"]').click()
    await nextTick()
    expect(w.emitted('update:modelValue').at(-1)[0]).toBe('2026-06-20')
  })

  it('clearable clears the value and emits clear', async () => {
    const w = mountField({ modelValue: DateTime.fromISO('2026-06-15'), clearable: true })
    await w.get('[aria-label="Clear"]').trigger('click')
    expect(w.emitted('update:modelValue').at(-1)[0]).toBeNull()
    expect(w.emitted('clear')).toBeTruthy()
  })

  it('does not open when disabled', async () => {
    const w = mountField({ modelValue: null, disabled: true })
    await w.get('button').trigger('click')
    await nextTick()
    expect(document.body.querySelector('[role="application"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseDateField.spec.js`
Expected: FAIL — cannot resolve `./BaseDateField.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- resource/js/shared/components/BaseDateField.vue -->
<script setup>
/**
 * BaseDateField — the unified date/time field. A trigger button shows the
 * formatted value (or placeholder); clicking opens a popover with BaseCalendar
 * (+ a preset rail for range mode and a time panel for datetime/time). v-model
 * is luxon DateTime by default; valueFormat="iso" switches to ISO strings.
 *
 * mode: 'date' | 'datetime' | 'time' | 'range' | 'month' | 'year'
 *
 * Replaces BaseDatePicker / BaseDateTimePicker / BaseTimePicker / BaseDateRangeInput.
 */
import { DateTime } from 'luxon'
import { computePosition, offset, flip, shift, autoUpdate } from '@floating-ui/dom'
import { IconCalendar, IconClock, IconChevronDown, IconX } from '@tabler/icons-vue'
import { useDateField, formatField, parseManual } from '@/composables/useDateField.js'
import { PRESETS, resolvePreset } from '@/utils/dateRanges.js'

const props = defineProps({
  mode: { type: String, default: 'date' },
  valueFormat: { type: String, default: 'datetime' }, // 'datetime' | 'iso'
  displayFormat: { type: String, default: null },
  minDate: { type: [Object, String, null], default: null },
  maxDate: { type: [Object, String, null], default: null },
  disabledDates: { type: [Array, Function, null], default: null },
  disabled: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: '' },
  size: { type: String, default: 'md' }, // 'sm' | 'md' | 'lg'
  density: { type: String, default: 'comfortable' }, // 'comfortable' | 'compact'
  error: { type: [String, Boolean], default: false },
  helperText: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
  allowManualInput: { type: Boolean, default: true },
  weekNumbers: { type: Boolean, default: false },
  firstDayOfWeek: { type: Number, default: 1 },
  showToday: { type: Boolean, default: false },
  presets: { type: Array, default: () => PRESETS },
  timezone: { type: String, default: null },
  locale: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue', 'change', 'clear', 'focus', 'blur', 'open', 'close'])

const model = defineModel({ type: [Object, Array, String, null], default: null })

const modeRef = computed(() => props.mode)
const valueFormatRef = computed(() => props.valueFormat)
const displayFormatRef = computed(() => props.displayFormat)
const { internal, commit, clear: clearInternal } = useDateField({
  model,
  mode: modeRef,
  valueFormat: valueFormatRef,
  displayFormat: displayFormatRef,
})

const open = ref(false)
const triggerEl = ref(null)
const panelEl = ref(null)

const selectionMode = computed(() => {
  if (props.mode === 'range') return 'range'
  if (props.multiple) return 'multiple'
  return 'single'
})

function coerceBound(v) {
  if (!v) return null
  return DateTime.isDateTime(v) ? v : DateTime.fromISO(String(v))
}
const minDt = computed(() => coerceBound(props.minDate))
const maxDt = computed(() => coerceBound(props.maxDate))

// Trigger display text (range shows "a – b"; otherwise the formatted value).
const displayText = computed(() => {
  if (props.mode === 'range') {
    const r = model.value || {}
    const f = r.start ? formatField(r.start, 'date', props.displayFormat) : ''
    const t = r.end ? formatField(r.end, 'date', props.displayFormat) : ''
    if (f && t) return `${f} – ${t}`
    if (f) return `From ${f}`
    return ''
  }
  return formatField(internal.value, props.mode, props.displayFormat)
})
const hasValue = computed(() =>
  props.mode === 'range' ? !!(model.value?.start || model.value?.end) : !!internal.value,
)

const sizeClass = computed(
  () => ({ sm: 'tw:h-7 tw:text-xs', md: 'tw:h-9 tw:text-sm', lg: 'tw:h-11 tw:text-base' })[props.size],
)
const TriggerIcon = computed(() => (props.mode === 'time' ? IconClock : IconCalendar))

function toggle() {
  if (props.disabled || props.readonly) return
  open.value = !open.value
  emit(open.value ? 'open' : 'close')
}
function close() {
  if (!open.value) return
  open.value = false
  emit('close')
}

function onCalendarUpdate(v) {
  // Single/datetime/month/year → DateTime; range → {start,end}; multiple → array
  if (props.mode === 'range' || props.multiple) {
    model.value = v
  } else {
    commit(v)
  }
  emit('change', model.value)
  // Close on a completed single pick (range closes only when both ends set).
  if (props.mode === 'range') {
    if (v?.start && v?.end) close()
  } else if (!props.multiple && props.mode !== 'datetime' && props.mode !== 'time') {
    close()
  }
}

function pickPreset(preset) {
  const r = resolvePreset(preset.id)
  if (!r) return // 'custom' — keep open
  model.value = { start: r.start, end: r.end }
  emit('change', model.value)
  close()
}

function clear() {
  if (props.mode === 'range') model.value = { start: null, end: null }
  else clearInternal()
  emit('clear')
  emit('change', model.value)
}

function onManualInput(e) {
  if (!props.allowManualInput) return
  const dt = parseManual(e.target.value, props.mode)
  if (dt) {
    commit(dt)
    emit('change', model.value)
  }
}

// floating positioning (mirror BaseFilterFlyout)
let stop = null
function place() {
  if (!triggerEl.value || !panelEl.value) return
  computePosition(triggerEl.value, panelEl.value, {
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    if (panelEl.value) Object.assign(panelEl.value.style, { left: `${x}px`, top: `${y}px` })
  })
}
watch(open, (v) => {
  if (v) {
    nextTick(() => {
      if (typeof window !== 'undefined' && window.ResizeObserver && triggerEl.value && panelEl.value) {
        stop = autoUpdate(triggerEl.value, panelEl.value, place)
      } else {
        place()
      }
    })
  } else if (stop) {
    stop()
    stop = null
  }
})
function onDocMouseDown(e) {
  if (!open.value) return
  if (triggerEl.value?.contains(e.target)) return
  if (e.target.closest?.('[data-date-panel]')) return
  close()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  if (props.autofocus) triggerEl.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  if (stop) stop()
})
</script>

<template>
  <div class="tw:inline-flex tw:flex-col tw:gap-1">
    <div ref="triggerEl" class="tw:inline-flex tw:items-center tw:gap-1">
      <button
        type="button"
        :disabled="disabled"
        aria-haspopup="dialog"
        :aria-expanded="open"
        class="tw:inline-flex tw:min-w-0 tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:bg-card tw:px-2.5 tw:text-on-main tw:transition-colors tw:focus:ring-2 tw:focus:ring-primary/20 tw:focus:outline-none tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
        :class="[
          sizeClass,
          open ? 'tw:border-primary' : error ? 'tw:border-red-400' : 'tw:border-divider tw:hover:bg-main-hover',
        ]"
        @click="toggle"
      >
        <component :is="TriggerIcon" :size="16" class="tw:shrink-0 tw:text-secondary" aria-hidden="true" />
        <span v-if="displayText" class="tw:truncate">{{ displayText }}</span>
        <span v-else class="tw:truncate tw:text-placeholder">{{ placeholder || 'Select…' }}</span>
        <BaseSpinner v-if="loading" size="sm" class="tw:ms-auto tw:shrink-0" />
        <IconChevronDown v-else :size="14" class="tw:ms-auto tw:shrink-0 tw:text-secondary" />
      </button>
      <button
        v-if="clearable && hasValue && !disabled"
        type="button"
        aria-label="Clear"
        class="tw:shrink-0 tw:rounded tw:p-1 tw:text-secondary tw:hover:text-on-main"
        @click="clear"
      >
        <IconX :size="14" />
      </button>
    </div>

    <p v-if="error && typeof error === 'string'" class="tw:text-xs tw:text-red-500">{{ error }}</p>
    <p v-else-if="helperText" class="tw:text-xs tw:text-secondary">{{ helperText }}</p>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelEl"
        data-date-panel
        role="dialog"
        aria-label="Choose date"
        class="tw:fixed tw:left-0 tw:top-0 tw:z-popover tw:flex tw:overflow-hidden tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:shadow-floating"
      >
        <!-- preset rail (range mode) -->
        <div
          v-if="mode === 'range'"
          class="tw:flex tw:min-w-36 tw:flex-col tw:gap-0.5 tw:border-r tw:border-divider tw:p-1"
        >
          <button
            v-for="p in presets"
            :key="p.id"
            type="button"
            class="tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:text-sm tw:text-on-main tw:hover:bg-main-hover"
            @click="pickPreset(p)"
          >
            {{ p.label }}
          </button>
        </div>

        <div class="tw:flex tw:flex-col">
          <BaseCalendar
            v-if="mode !== 'time'"
            :modelValue="mode === 'range' || multiple ? model : internal"
            :selectionMode="selectionMode"
            :minDate="minDt"
            :maxDate="maxDt"
            :disabledDates="disabledDates"
            :firstDayOfWeek="firstDayOfWeek"
            :weekNumbers="weekNumbers"
            :showToday="showToday"
            :timezone="timezone"
            :locale="locale"
            @update:modelValue="onCalendarUpdate"
          />

          <!-- manual text input -->
          <div v-if="allowManualInput && mode !== 'range' && mode !== 'time'" class="tw:border-t tw:border-divider tw:p-2">
            <input
              type="text"
              :placeholder="mode === 'datetime' ? 'yyyy-mm-dd' : 'Type a date'"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-transparent tw:px-2 tw:py-1 tw:text-sm tw:outline-none tw:focus:border-primary"
              @change="onManualInput"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
```

> Time-mode and datetime time-of-day editing land in Task 7; this task ships date/range/multiple/month/year + manual input + clear. The `mode==='time'` branch renders no calendar yet (Task 7 adds the time panel).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseDateField.spec.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseDateField.vue resource/js/shared/components/BaseDateField.spec.js
git commit -m "feat(ds): BaseDateField — date/range/multiple field with presets, manual input, clear"
```

---

### Task 7: `BaseDateField` — time panel (time + datetime modes)

**Files:**
- Modify: `resource/js/shared/components/BaseDateField.vue`
- Test: `resource/js/shared/components/BaseDateField.spec.js`

**Interfaces:**
- Produces: a `<select>`-based hour/minute/AM-PM panel. For `mode='datetime'` it sits beside the calendar and merges the picked time into the selected day. For `mode='time'` it is the whole popover and v-model is a `DateTime` whose date part is today (or the existing value's date).
- Consumes: existing `commit`/`internal` from Task 6.

- [ ] **Step 1: Write the failing test**

```js
// append to resource/js/shared/components/BaseDateField.spec.js
describe('BaseDateField (time / datetime)', () => {
  it('time mode renders hour/minute/meridiem selects and emits a DateTime', async () => {
    const w = mountField({ mode: 'time', modelValue: null })
    await w.get('button').trigger('click')
    await nextTick()
    const selects = document.body.querySelectorAll('[data-date-panel] select')
    expect(selects.length).toBe(3) // hours, minutes, am/pm
    selects[0].value = '9'
    selects[0].dispatchEvent(new Event('change'))
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(DateTime.isDateTime(v)).toBe(true)
    expect(v.hour).toBe(9)
  })

  it('datetime mode keeps the day and updates the time', async () => {
    const day = DateTime.fromISO('2026-06-15T00:00')
    const w = mountField({ mode: 'datetime', modelValue: day })
    await w.get('button').trigger('click')
    await nextTick()
    const selects = document.body.querySelectorAll('[data-date-panel] select')
    selects[0].value = '10'
    selects[0].dispatchEvent(new Event('change'))
    await nextTick()
    const v = w.emitted('update:modelValue').at(-1)[0]
    expect(v.toISODate()).toBe('2026-06-15')
    expect(v.hour).toBe(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseDateField.spec.js -t "time"`
Expected: FAIL — no `select` elements in the panel.

- [ ] **Step 3: Implement the time panel**

Add to `<script setup>` (after `onCalendarUpdate`):

```js
// --- time-of-day editing ---
const timeBase = computed(() => internal.value || DateTime.now().startOf('day'))
const hour12 = computed(() => {
  const h = timeBase.value.hour % 12
  return h === 0 ? 12 : h
})
const minute = computed(() => timeBase.value.minute - (timeBase.value.minute % 5))
const meridiem = computed(() => (timeBase.value.hour < 12 ? 'am' : 'pm'))

function setTime({ h12 = hour12.value, m = minute.value, mer = meridiem.value }) {
  let h = Number(h12) % 12
  if (mer === 'pm') h += 12
  const next = timeBase.value.set({ hour: h, minute: Number(m), second: 0, millisecond: 0 })
  commit(next)
  emit('change', model.value)
}
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)
```

Add the time panel to the template. For `mode === 'time'` (replace the empty time branch) and for `mode === 'datetime'` (beside the calendar), insert this block inside the `<div class="tw:flex tw:flex-col">` after `BaseCalendar`:

```vue
<div
  v-if="mode === 'time' || mode === 'datetime'"
  class="tw:flex tw:items-center tw:gap-1 tw:border-t tw:border-divider tw:p-2"
>
  <IconClock :size="16" class="tw:text-secondary" />
  <select
    :value="hour12"
    class="tw:rounded tw:border tw:border-divider tw:bg-transparent tw:px-1 tw:py-0.5 tw:text-sm"
    @change="(e) => setTime({ h12: e.target.value })"
  >
    <option v-for="h in HOURS" :key="h" :value="h">{{ h }}</option>
  </select>
  <span class="tw:text-secondary">:</span>
  <select
    :value="minute"
    class="tw:rounded tw:border tw:border-divider tw:bg-transparent tw:px-1 tw:py-0.5 tw:text-sm"
    @change="(e) => setTime({ m: e.target.value })"
  >
    <option v-for="m in MINUTES" :key="m" :value="m">{{ String(m).padStart(2, '0') }}</option>
  </select>
  <select
    :value="meridiem"
    class="tw:rounded tw:border tw:border-divider tw:bg-transparent tw:px-1 tw:py-0.5 tw:text-sm"
    @change="(e) => setTime({ mer: e.target.value })"
  >
    <option value="am">am</option>
    <option value="pm">pm</option>
  </select>
</div>
```

Also update the `BaseCalendar` render condition so datetime still shows the calendar (`v-if="mode !== 'time'"` already covers this — no change), and confirm `onCalendarUpdate` for `datetime` preserves the existing time: change the `commit(v)` path so datetime merges the day onto the existing time:

```js
function onCalendarUpdate(v) {
  if (props.mode === 'range' || props.multiple) {
    model.value = v
  } else if (props.mode === 'datetime') {
    const base = internal.value
    const merged = base ? v.set({ hour: base.hour, minute: base.minute }) : v
    commit(merged)
  } else {
    commit(v)
  }
  emit('change', model.value)
  if (props.mode === 'range') {
    if (v?.start && v?.end) close()
  } else if (!props.multiple && props.mode !== 'datetime' && props.mode !== 'time') {
    close()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseDateField.spec.js`
Expected: PASS (all date + time tests).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseDateField.vue resource/js/shared/components/BaseDateField.spec.js
git commit -m "feat(ds): BaseDateField time + datetime panels"
```

---

### Task 8: `BaseDateField.stories.js` — every state

**Files:**
- Create: `resource/js/shared/components/BaseDateField.stories.js`

- [ ] **Step 1: Write the stories file**

```js
// resource/js/shared/components/BaseDateField.stories.js
import { ref } from 'vue'
import { DateTime } from 'luxon'
import BaseDateField from './BaseDateField.vue'

/**
 * BaseDateField — unified date/datetime/time/range/month/year field.
 */
export default {
  title: 'Forms/Date/BaseDateField',
  component: BaseDateField,
  tags: ['autodocs'],
}

const wrap = (template, state = {}) => ({
  render: () => ({
    components: { BaseDateField },
    setup: () => ({ model: ref(state.model ?? null) }),
    template: `<div class="tw:max-w-sm tw:p-4">${template}</div>`,
  }),
})

export const Default = wrap(`<BaseDateField v-model="model" placeholder="Select date" />`)
export const Date = wrap(`<BaseDateField v-model="model" mode="date" />`, { model: DateTime.now() })
export const DateTime_ = { ...wrap(`<BaseDateField v-model="model" mode="datetime" />`, { model: DateTime.now() }), name: 'DateTime' }
export const Time = wrap(`<BaseDateField v-model="model" mode="time" />`, { model: DateTime.now() })
export const Range = { render: () => ({ components: { BaseDateField }, setup: () => ({ model: ref({ start: null, end: null }) }), template: `<div class="tw:max-w-sm tw:p-4"><BaseDateField v-model="model" mode="range" /></div>` }) }
export const Month = wrap(`<BaseDateField v-model="model" mode="month" />`)
export const Year = wrap(`<BaseDateField v-model="model" mode="year" />`)
export const Disabled = wrap(`<BaseDateField v-model="model" :disabled="true" />`, { model: DateTime.now() })
export const Readonly = wrap(`<BaseDateField v-model="model" :readonly="true" />`, { model: DateTime.now() })
export const Loading = wrap(`<BaseDateField v-model="model" :loading="true" />`)
export const ValidationError = wrap(`<BaseDateField v-model="model" error="This date is required" />`)
export const HelperText = wrap(`<BaseDateField v-model="model" helperText="Pick the inspection date" />`)
export const MinMaxDate = { render: () => ({ components: { BaseDateField }, setup: () => ({ model: ref(DateTime.now()), min: DateTime.now().startOf('month'), max: DateTime.now().endOf('month') }), template: `<div class="tw:max-w-sm tw:p-4"><BaseDateField v-model="model" :minDate="min" :maxDate="max" /></div>` }) }
export const Multiple = { render: () => ({ components: { BaseDateField }, setup: () => ({ model: ref([]) }), template: `<div class="tw:max-w-sm tw:p-4"><BaseDateField v-model="model" :multiple="true" /></div>` }) }
export const Clearable = wrap(`<BaseDateField v-model="model" :clearable="true" />`, { model: DateTime.now() })
export const Compact = wrap(`<BaseDateField v-model="model" size="sm" density="compact" />`, { model: DateTime.now() })
export const Empty = wrap(`<BaseDateField v-model="model" placeholder="Empty state" />`)
export const Prefilled = wrap(`<BaseDateField v-model="model" />`, { model: DateTime.now() })
export const IsoValueFormat = wrap(`<BaseDateField v-model="model" valueFormat="iso" />`, { model: '2026-06-22' })
```

- [ ] **Step 2: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: completes; all `BaseDateField` stories render.

- [ ] **Step 3: Commit**

```bash
git add resource/js/shared/components/BaseDateField.stories.js
git commit -m "docs(ds): BaseDateField stories (all states)"
```

---

### Task 9: Migrate `DynamicForm.js` date/datetime/time fields

**Files:**
- Modify: `src/components/form/DynamicForm.js` (imports at lines 18-20; cases at 262-333)
- Test: manual + existing form tests (`npx vitest run` for any DynamicForm spec; otherwise build check)

**Interfaces:** Consumes `BaseDateField`. The stored value contract stays ISO strings (forms persist strings) → use `valueFormat="iso"`. Time fields previously stored **minutes** (`timeInMins`); convert to/from a `HH:mm` ISO string via `BaseDateField` `mode="time" valueFormat="iso"`, then map to minutes at the boundary to preserve stored data.

- [ ] **Step 1: Replace the imports**

In `src/components/form/DynamicForm.js`, replace lines 18-20:

```js
import BaseDateField from '@shared/components/BaseDateField.vue'
```

(Delete the three old imports: `BaseDatePicker`, `BaseTimePicker`, `BaseDateTimePicker`.)

- [ ] **Step 2: Replace the `'date'` case (262-283)**

```js
case 'date': {
  const isDisabled = props.disabled || field.disabled
  return h('div', { class: 'tw:flex tw:flex-col' }, [
    field.label
      ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' }, field.label)
      : null,
    h(BaseDateField, {
      ...inputFieldProps,
      mode: 'date',
      valueFormat: 'iso',
      modelValue: scope.value || null,
      disabled: isDisabled,
      'onUpdate:modelValue': (v) => {
        scope.value = v || null
      },
    }),
  ])
}
```

- [ ] **Step 3: Replace the `'datetime'` case (285-333)**

```js
case 'datetime': {
  const isDisabled = props.disabled || field.disabled
  const mode = field.mode || 'datetime'
  const labelEl = field.label
    ? h('div', { class: 'tw:text-sm tw:font-medium tw:text-secondary tw:mb-1' }, field.label)
    : null

  if (mode === 'time') {
    // Stored as minutes-since-midnight; bridge to a HH:mm string for the field.
    const mins = Number(scope.value ?? 0)
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return h('div', { class: 'tw:flex tw:flex-col' }, [
      labelEl,
      h(BaseDateField, {
        mode: 'time',
        valueFormat: 'iso',
        modelValue: mins ? `${hh}:${mm}` : null,
        disabled: isDisabled,
        'onUpdate:modelValue': (v) => {
          if (!v) return (scope.value = 0)
          const [h2, m2] = String(v).split(':').map(Number)
          scope.value = h2 * 60 + m2
        },
      }),
    ])
  }

  return h('div', { class: 'tw:flex tw:flex-col' }, [
    labelEl,
    h(BaseDateField, {
      mode: mode === 'date' ? 'date' : 'datetime',
      valueFormat: 'iso',
      modelValue: scope.value || null,
      disabled: isDisabled,
      'onUpdate:modelValue': (v) => {
        scope.value = v || null
      },
    }),
  ])
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run` (whole suite — ensures no DynamicForm spec broke) and `npm run build`.
Expected: PASS / build OK. Manually load a form with date/datetime/time fields in Storybook or the app (auth-gated — flag for user verification).

- [ ] **Step 5: Commit**

```bash
git add src/components/form/DynamicForm.js
git commit -m "refactor(form): DynamicForm uses BaseDateField for date/datetime/time"
```

---

### Task 10: Migrate the ~18 `BaseDatePicker` form sites (mechanical rename)

**Files (modify each):**
```
src/components/changeRequests/ChangeRequestsCreate.vue
src/components/changeRequests/ChangeRequestsPageId.vue
src/components/suppliers/SuppliersAssetRequestDialog.vue
src/components/nonconformances/NonconformancesCreate.vue
src/components/nonconformances/NonconformancesPageId.vue
src/components/capas/CapaEffectivenessCheckRenewDialog.vue
src/components/capas/CapasPageId.vue
src/components/capas/CapasCreate.vue
src/components/capas/CapaEffectivenessCheckScheduleDialog.vue
src/components/customerComplaints/CustomerComplaintConvertToNcDialog.vue
src/components/apiKey/apiKeyCreateDialog.vue
src/components/documents/DocumentsMainContentRight.vue
src/components/documents/DocumentsCreateProperties.vue
src/components/documents/DocumentsCreateTrainingAssessmentSettings.vue
src/components/documents/DocumentsEditDialog.vue
src/components/aiPat/aiPatCreateDialog.vue
```
(`CustomerComplaintsFilterToolbar.vue` and `auditLog/AuditLogsFilters.vue` also use `BaseDatePicker` — handle them in Slice 3 with the other filter toolbars. `src/components/menus/DateRangeFilter.vue` is deleted in Slice 4.)

**Interfaces:** `BaseDateField mode="date"` (default) is a drop-in for `BaseDatePicker` — both bind `DateTime | null` and render a calendar popover.

**Recipe (identical at every site):** For each `<BaseDatePicker ... />`:
1. Rename the tag to `<BaseDateField>`.
2. Keep `v-model` / `:modelValue` + `@update:modelValue` as-is (same DateTime contract).
3. Map props: `:minDate`/`:maxDate`/`:disabled` carry over unchanged. `:showShortcuts="false"` → delete (BaseDateField shows no shortcuts in date mode). `:firstDayOfWeek` carries over.
4. Auto-import handles the rest — no `import` line to change (Base* are auto-imported).

- [ ] **Step 1: Do one file as the worked example — `ChangeRequestsCreate.vue`**

Before:
```vue
<BaseDatePicker v-model="form.dueDate" />
```
After:
```vue
<BaseDateField v-model="form.dueDate" mode="date" />
```

- [ ] **Step 2: Repeat the recipe for each remaining file in the list**

After editing all, verify none remain:

Run: `grep -rln "BaseDatePicker" src --include="*.vue" | grep -vE "FilterToolbar|AuditLogsFilters|DateRangeFilter"`
Expected: no output (all form sites migrated; the listed filter files are handled in Slice 3).

- [ ] **Step 3: Verify build + tests**

Run: `npx vitest run && npm run build`
Expected: PASS / OK.

- [ ] **Step 4: Commit**

```bash
git add src/components
git commit -m "refactor: migrate BaseDatePicker form sites to BaseDateField"
```

> Auth-gated pages — flag to the user for visual verification (per memory: real runtime testing, not just build/lint).

---

### Task 11: Migrate `BaseDateRangeInput` consumer (`FieldRecordsList.vue`)

**Files:**
- Modify: `src/components/inspectionsLogs/FieldRecordsList.vue`

**Interfaces:** Old `BaseDateRangeInput` v-model was `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }`. New `BaseDateField mode="range"` v-model is `{ start: DateTime, end: DateTime }`. Use `valueFormat="iso"` to keep ISO strings, but note range ISO shape is `{ start, end }` not `{ from, to }`.

- [ ] **Step 1: Read the current usage**

Run: `grep -n "BaseDateRangeInput\|from\|to\|dateInRange" src/components/inspectionsLogs/FieldRecordsList.vue`

- [ ] **Step 2: Replace the component + adapt the filtering**

Replace `<BaseDateRangeInput v-model="dateRange" />` with:
```vue
<BaseDateField v-model="dateRange" mode="range" valueFormat="iso" clearable placeholder="All time" />
```
Where the filter previously used `dateInRange(row.createdAt, dateRange.from, dateRange.to)`, change the model init to `{ start: '', end: '' }` and the filter to:
```js
import { matchesDateFilter } from '@/utils/dateRanges.js'
// …
matchesDateFilter(row.createdAt, { operator: 'between', value: dateRange.value.start, value2: dateRange.value.end })
```
(If either bound is empty, `matchesDateFilter` with `between` treats the missing side as unbounded.)

- [ ] **Step 3: Verify**

Run: `npx vitest run && npm run build`
Expected: PASS / OK. Flag for visual verification.

- [ ] **Step 4: Commit**

```bash
git add src/components/inspectionsLogs/FieldRecordsList.vue
git commit -m "refactor: FieldRecordsList uses BaseDateField range"
```

---

# SLICE 3 — Advanced-filter date operators

### Task 12: `BaseDateFilter.vue` — operator editor

**Files:**
- Create: `resource/js/shared/components/BaseDateFilter.vue`
- Test: `resource/js/shared/components/BaseDateFilter.spec.js`

**Interfaces:**
- Consumes: `OPERATORS` from `@/utils/dateRanges.js`; `BaseDateField`, `BaseSelectMenu` (auto-imported).
- Produces: v-model is a token `{ operator, value, value2, relative }` (see Task 2). Default token `{ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } }`. Emits `update:modelValue`.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/BaseDateFilter.spec.js
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseDateFilter from './BaseDateFilter.vue'

const mounted = []
function mountFilter(modelValue = null) {
  const w = mount(BaseDateFilter, { attachTo: document.body, props: { modelValue } })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  document.body.innerHTML = ''
})

describe('BaseDateFilter', () => {
  it('renders an operator selector with all operators', () => {
    const w = mountFilter()
    const opts = [...w.element.querySelectorAll('select[data-op] option')].map((o) => o.value)
    expect(opts).toContain('before')
    expect(opts).toContain('between')
    expect(opts).toContain('relative')
  })

  it('emits a token when the operator changes to before', async () => {
    const w = mountFilter({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } })
    const sel = w.get('select[data-op]')
    await sel.setValue('before')
    expect(w.emitted('update:modelValue').at(-1)[0].operator).toBe('before')
  })

  it('shows two value controls for between', async () => {
    const w = mountFilter({ operator: 'between', value: null, value2: null })
    await nextTick()
    expect(w.findAll('[data-value-field]').length).toBe(2)
  })

  it('shows count + unit controls for relative', async () => {
    const w = mountFilter({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } })
    await nextTick()
    expect(w.find('[data-rel-count]').exists()).toBe(true)
    expect(w.find('[data-rel-unit]').exists()).toBe(true)
  })

  it('shows no value control for empty', async () => {
    const w = mountFilter({ operator: 'empty' })
    await nextTick()
    expect(w.findAll('[data-value-field]').length).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseDateFilter.spec.js`
Expected: FAIL — cannot resolve `./BaseDateFilter.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- resource/js/shared/components/BaseDateFilter.vue -->
<script setup>
/**
 * BaseDateFilter — operator-driven date filter editor for the advanced-filter
 * framework. v-model is a token { operator, value, value2, relative }. Relative
 * tokens stay dynamic (resolved at filter run time by resolveDateFilter), so a
 * saved filter like "Last 7 days" re-evaluates every run. Composes BaseDateField.
 */
import { OPERATORS } from '@/utils/dateRanges.js'

const model = defineModel({ type: [Object, null], default: null })

const DEFAULT = { operator: 'relative', value: null, value2: null, relative: { dir: 'past', unit: 'day', count: 7 } }
const token = computed(() => ({ ...DEFAULT, ...(model.value || {}) }))

const UNITS = [
  { id: 'day', label: 'days' },
  { id: 'week', label: 'weeks' },
  { id: 'month', label: 'months' },
  { id: 'quarter', label: 'quarters' },
  { id: 'year', label: 'years' },
]
const DIRS = [
  { id: 'past', label: 'Last' },
  { id: 'next', label: 'Next' },
  { id: 'this', label: 'This' },
]

const needsOne = computed(() =>
  ['eq', 'neq', 'before', 'after', 'onBefore', 'onAfter'].includes(token.value.operator),
)
const needsTwo = computed(() => ['between', 'notBetween'].includes(token.value.operator))
const isRelative = computed(() => token.value.operator === 'relative')

function patch(next) {
  model.value = { ...token.value, ...next }
}
function setOperator(op) {
  patch({ operator: op })
}
function patchRelative(next) {
  patch({ relative: { ...token.value.relative, ...next } })
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2 tw:p-2 tw:min-w-64">
    <select
      data-op
      :value="token.operator"
      class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
      @change="(e) => setOperator(e.target.value)"
    >
      <option v-for="op in OPERATORS" :key="op.id" :value="op.id">{{ op.label }}</option>
    </select>

    <template v-if="isRelative">
      <div class="tw:flex tw:items-center tw:gap-1">
        <select
          data-rel-dir
          :value="token.relative.dir"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
          @change="(e) => patchRelative({ dir: e.target.value })"
        >
          <option v-for="d in DIRS" :key="d.id" :value="d.id">{{ d.label }}</option>
        </select>
        <input
          v-if="token.relative.dir !== 'this'"
          data-rel-count
          type="number"
          min="1"
          :value="token.relative.count"
          class="tw:w-16 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
          @input="(e) => patchRelative({ count: Number(e.target.value) })"
        />
        <select
          data-rel-unit
          :value="token.relative.unit"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
          @change="(e) => patchRelative({ unit: e.target.value })"
        >
          <option v-for="u in UNITS" :key="u.id" :value="u.id">{{ u.label }}</option>
        </select>
      </div>
    </template>

    <template v-else-if="needsOne">
      <div data-value-field>
        <BaseDateField
          :modelValue="token.value"
          valueFormat="iso"
          clearable
          placeholder="Pick a date"
          @update:modelValue="(v) => patch({ value: v })"
        />
      </div>
    </template>

    <template v-else-if="needsTwo">
      <div data-value-field>
        <BaseDateField
          :modelValue="token.value"
          valueFormat="iso"
          clearable
          placeholder="From"
          @update:modelValue="(v) => patch({ value: v })"
        />
      </div>
      <div data-value-field>
        <BaseDateField
          :modelValue="token.value2"
          valueFormat="iso"
          clearable
          placeholder="To"
          @update:modelValue="(v) => patch({ value2: v })"
        />
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseDateFilter.spec.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseDateFilter.vue resource/js/shared/components/BaseDateFilter.spec.js
git commit -m "feat(ds): BaseDateFilter operator editor (relative + concrete tokens)"
```

---

### Task 13: `BaseDateFilter.stories.js`

**Files:**
- Create: `resource/js/shared/components/BaseDateFilter.stories.js`

- [ ] **Step 1: Write the stories file**

```js
// resource/js/shared/components/BaseDateFilter.stories.js
import { ref } from 'vue'
import BaseDateFilter from './BaseDateFilter.vue'

/**
 * BaseDateFilter — operator-driven date filter (before/after/between/relative…).
 */
export default {
  title: 'Forms/Date/BaseDateFilter',
  component: BaseDateFilter,
  tags: ['autodocs'],
}

const story = (model) => ({
  render: () => ({
    components: { BaseDateFilter },
    setup: () => ({ token: ref(model), out: ref(model) }),
    template: `<div class="tw:max-w-xs tw:rounded-xl tw:border tw:border-divider tw:bg-card">
      <BaseDateFilter v-model="token" @update:modelValue="out = $event" />
      <pre class="tw:p-2 tw:text-micro tw:text-secondary">{{ token }}</pre>
    </div>`,
  }),
})

export const RelativeLast7Days = story({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } })
export const Before = story({ operator: 'before', value: null })
export const Between = story({ operator: 'between', value: null, value2: null })
export const IsEmpty = story({ operator: 'empty' })
export const ThisMonth = story({ operator: 'relative', relative: { dir: 'this', unit: 'month', count: 1 } })
```

- [ ] **Step 2: Verify Storybook builds**

Run: `npm run build-storybook`
Expected: completes.

- [ ] **Step 3: Commit**

```bash
git add resource/js/shared/components/BaseDateFilter.stories.js
git commit -m "docs(ds): BaseDateFilter stories"
```

---

### Task 14: Wire `type:'date'` node into the filter framework

**Files:**
- Modify: `resource/js/shared/composables/filterMenuHelpers.js`
- Modify: `resource/js/shared/components/BaseFilterFlyout.vue`
- Test: `resource/js/shared/composables/filterMenuHelpers.spec.js` (extend), `resource/js/shared/components/BaseFilterMenu.spec.js` (extend)

**Interfaces:**
- A date node descriptor: `{ id, label, icon, group, type: 'date' }`. Its value in the flat model is a token (or null). It opens a submenu panel containing `BaseDateFilter` rather than a checkbox list.
- Produces: `isDateNode(node) → boolean`; `countActiveGroups` counts a non-null token. `BaseFilterFlyout` renders `BaseDateFilter` bound through `filterMenuCtx` for date nodes.

- [ ] **Step 1: Write the failing helper test**

```js
// append to resource/js/shared/composables/filterMenuHelpers.spec.js
import { isDateNode, countActiveGroups } from './filterMenuHelpers.js'

describe('date nodes', () => {
  it('isDateNode detects type:date', () => {
    expect(isDateNode({ type: 'date', group: 'createdAt' })).toBe(true)
    expect(isDateNode({ group: 'statusId', options: [] })).toBe(false)
  })
  it('countActiveGroups counts a non-null date token', () => {
    expect(countActiveGroups({ createdAt: { operator: 'before', value: '2026-01-01' } })).toBe(1)
    expect(countActiveGroups({ createdAt: null })).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run resource/js/shared/composables/filterMenuHelpers.spec.js`
Expected: FAIL — `isDateNode is not a function`.

- [ ] **Step 3: Add the helper**

In `filterMenuHelpers.js`, add:
```js
/** A node that edits a date token (rendered with BaseDateFilter, not checkboxes). */
export function isDateNode(node) {
  return node?.type === 'date'
}
```
`countActiveGroups` already counts any non-null, non-empty, non-empty-array value, so a token object counts as 1 — verify the existing implementation handles objects (it does: `v != null && v !== ''` is true for `{}`). No change needed there beyond the test.

- [ ] **Step 4: Run helper test to verify pass**

Run: `npx vitest run resource/js/shared/composables/filterMenuHelpers.spec.js`
Expected: PASS.

- [ ] **Step 5: Render `BaseDateFilter` for date nodes in the flyout**

In `BaseFilterFlyout.vue`:
- import the helper: add `isDateNode` to the existing import from `../composables/filterMenuHelpers.js`.
- A date node should open a submenu panel (so `hasChildren`-like behavior). Update `onSelect`/`openSub` so a date node opens a child panel that contains `BaseDateFilter`. Simplest approach: treat a date node as opening a dedicated panel. Add, in the template, after the recursive child flyout block:

```vue
<!-- date-filter sub-panel -->
<BaseFilterFlyout
  v-if="dateNode && dateAnchor"
  :nodes="[]"
  :anchorEl="dateAnchor"
  placement="right-start"
  @close="dateNode = null"
>
  <BaseDateFilter
    :modelValue="ctx?.getValue?.(dateNode.group) ?? null"
    @update:modelValue="(t) => ctx?.setValue?.(dateNode.group, t)"
  />
</BaseFilterFlyout>
```

Add to `<script setup>`:
```js
const dateNode = ref(null)
const dateAnchor = ref(null)
```
And in `onSelect(node, ev)`, before the `hasChildren` branch:
```js
if (isDateNode(node)) {
  dateNode.value = node
  dateAnchor.value = ev?.currentTarget ?? null
  return
}
```
Make `BaseFilterFlyout` render its default slot when given one (so the date panel can host `BaseDateFilter`). Add a `<slot />` inside the panel body, after the rows loop:
```vue
<slot />
```

- [ ] **Step 6: Extend `filterMenuCtx` with value get/set**

In `BaseFilterMenu.vue`, extend the provided context:
```js
provide('filterMenuCtx', {
  isChecked: (node) => checkedFn(model.value, node.group, node.value, node.select),
  toggle: (node) => {
    model.value = toggleSelection(model.value, node)
  },
  getValue: (group) => model.value?.[group] ?? null,
  setValue: (group, value) => {
    model.value = { ...model.value, [group]: value }
  },
  requestClose: () => {
    open.value = false
  },
})
```

- [ ] **Step 7: Add an integration test**

```js
// append to resource/js/shared/components/BaseFilterMenu.spec.js
it('opens a BaseDateFilter panel for a type:date node and writes a token', async () => {
  const items = [{ id: 'created', label: 'Created', group: 'createdAt', type: 'date' }]
  const w = mount(BaseFilterMenu, { attachTo: document.body, props: { items, modelValue: {} } })
  mounted.push(w)
  await w.get('button').trigger('click')
  await nextTick()
  rowByText('Created').click()
  await nextTick()
  expect(document.body.querySelector('select[data-op]')).not.toBeNull()
})
```

- [ ] **Step 8: Run filter tests**

Run: `npx vitest run resource/js/shared/components/BaseFilterMenu.spec.js resource/js/shared/composables/filterMenuHelpers.spec.js`
Expected: PASS (existing + new).

- [ ] **Step 9: Commit**

```bash
git add resource/js/shared/components/BaseFilterFlyout.vue resource/js/shared/components/BaseFilterMenu.vue resource/js/shared/composables/filterMenuHelpers.js resource/js/shared/composables/filterMenuHelpers.spec.js resource/js/shared/components/BaseFilterMenu.spec.js
git commit -m "feat(ds): date-token nodes in the cascading filter menu"
```

---

### Task 15: Re-implement `dateInRange` on `matchesDateFilter` (keep signature)

**Files:**
- Modify: `src/utils/listFilters.js`
- Test: create `src/utils/listFilters.spec.js`

**Interfaces:** `dateInRange(value, from, to)` keeps its exact signature/semantics (the 8 list components still call it) but delegates to `matchesDateFilter` so there is one filtering implementation.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/listFilters.spec.js
import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import { dateInRange } from './listFilters.js'

describe('dateInRange (compat)', () => {
  const d = DateTime.fromISO('2026-06-15T12:00')
  it('true when unbounded', () => expect(dateInRange(d, '', '')).toBe(true))
  it('respects from (inclusive day)', () => {
    expect(dateInRange(d, '2026-06-15', '')).toBe(true)
    expect(dateInRange(d, '2026-06-16', '')).toBe(false)
  })
  it('respects to (inclusive day)', () => {
    expect(dateInRange(d, '', '2026-06-15')).toBe(true)
    expect(dateInRange(d, '', '2026-06-14')).toBe(false)
  })
  it('accepts ISO string values', () => {
    expect(dateInRange('2026-06-15T12:00', '2026-06-10', '2026-06-20')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/utils/listFilters.spec.js`
Expected: FAIL until the implementation is updated (current impl actually passes these — so first confirm, then refactor keeping green).

- [ ] **Step 3: Refactor the implementation**

```js
// src/utils/listFilters.js
import { matchesDateFilter } from './dateRanges.js'

/**
 * True when `value` (a luxon DateTime or ISO string) falls within the inclusive
 * [from, to] range. `from`/`to` are 'yyyy-mm-dd' strings; empty = unbounded.
 * Thin compatibility wrapper over matchesDateFilter (single filtering impl).
 */
export function dateInRange(value, from, to) {
  if (!from && !to) return true
  return matchesDateFilter(value, { operator: 'between', value: from || null, value2: to || null })
}
```

- [ ] **Step 4: Run to verify pass + whole suite**

Run: `npx vitest run src/utils/listFilters.spec.js && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listFilters.js src/utils/listFilters.spec.js
git commit -m "refactor: dateInRange delegates to matchesDateFilter"
```

---

### Task 16: Migrate the 7 filter toolbars to the date node + token model

**Files (modify each toolbar + its paired list/Home for filtering):**
```
Toolbar                                                          Paired filtering site
src/components/nonconformances/NonconformancesFilterToolbar.vue  src/components/nonconformances/NonconformancesHome.vue
src/components/changeRequests/ChangeRequestsFilterToolbar.vue    src/components/changeRequests/ChangeRequestsHome.vue
src/components/capas/CapasFilterToolbar.vue                      src/components/capas/CapasHome.vue
src/components/audits/AuditInstancesHome.vue                     (toolbar inline in same file)
src/components/qcInspection/SpecificationsList.vue               (filter inline in same file)
src/components/qcInspection/InspectionLotsList.vue               (filter inline in same file)
src/components/taskInstance/taskInstancesFilterToolbar.vue       src/components/taskInstance/taskInstancesTable.vue
src/components/customerComplaints/CustomerComplaintsFilterToolbar.vue (uses BaseDatePicker for dates)
```

**Interfaces:** Replace the separate `<DateRangeFilter v-model:from v-model:to />` with a `type:'date'` entry in the toolbar's `filterItems` descriptor, storing a token under a group key (e.g. `createdAt`). The paired list filters rows with `matchesDateFilter(row.createdAt, filters.createdAt)`.

**Recipe (identical per toolbar):**
1. Add a date node to the `filterItems` computed:
   ```js
   { id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
   ```
   (import `IconCalendar` from `@tabler/icons-vue`).
2. Remove the `<DateRangeFilter ... />` element and its surrounding wrapper.
3. Change the filter model default: drop `dateFrom: ''`/`dateTo: ''`, add `createdAt: null`.
4. Update the applied-filter chip + `clearAll`/`clearDates` to use `createdAt` (a single "Created date" chip with a clear button that sets `createdAt = null`).
5. In the paired list/Home, replace `dateInRange(row.createdAt, filters.dateFrom, filters.dateTo)` with `matchesDateFilter(row.createdAt, filters.createdAt)` (import from `@/utils/dateRanges.js`).

- [ ] **Step 1: Worked example — `NonconformancesFilterToolbar.vue`**

In `filterItems` (after the supplier entry):
```js
{ id: 'createdAt', label: 'Created date', icon: IconCalendar, group: 'createdAt', type: 'date' },
```
Add `IconCalendar` to the `@tabler/icons-vue` import. Remove:
```vue
<DateRangeFilter v-model:from="filters.dateFrom" v-model:to="filters.dateTo" />
```
Replace the date chip block (lines ~170-183) with:
```vue
<span
  v-if="filters.createdAt"
  class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:py-0.5 tw:ps-2 tw:pe-1 tw:text-xs tw:text-secondary"
>
  Created date
  <button type="button" aria-label="Clear date filter" class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover" @click="filters.createdAt = null">
    <IconX class="tw:size-3" />
  </button>
</span>
```
Update `hasChips` to use `filters.createdAt` instead of `dateFrom || dateTo`; update `clearAll` to set `createdAt: null` (remove `dateFrom`/`dateTo`); delete `clearDates`.

- [ ] **Step 2: Update its paired Home — `NonconformancesHome.vue`**

Find the row filter using `dateInRange(..., filters.dateFrom, filters.dateTo)` and replace with:
```js
import { matchesDateFilter } from '@/utils/dateRanges.js'
// in the filter predicate:
matchesDateFilter(nc.createdAt, filters.createdAt)
```
Update the default filters object init to use `createdAt: null` (remove `dateFrom`/`dateTo`).

> Note: `NonconformancesFilterToolbar.vue` and `NonconformancesHome.vue` already have uncommitted local edits on this branch — reconcile carefully, keeping those changes.

- [ ] **Step 3: Repeat the recipe for each remaining toolbar + paired site**

Apply Steps 1-2's recipe to the remaining rows in the file table above. For toolbars that used `BaseDatePicker` directly for date filtering (`CustomerComplaintsFilterToolbar.vue`, `auditLog/AuditLogsFilters.vue`), replace those with the same `type:'date'` node + token approach (these are filters, not form fields).

- [ ] **Step 4: Verify nothing references the old date filter model**

Run: `grep -rln "DateRangeFilter\|dateFrom\|dateTo" src/components --include="*.vue"`
Expected: no output (every toolbar migrated). `dateInRange` may still appear where a list genuinely takes user from/to outside a toolbar — confirm each remaining hit is intentional; otherwise migrate.

- [ ] **Step 5: Verify build + tests**

Run: `npx vitest run && npm run build`
Expected: PASS / OK. Flag all toolbar pages for visual verification (auth-gated).

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "refactor: list toolbars use date-token filter nodes (drop DateRangeFilter)"
```

---

# SLICE 4 — Cleanup & dependency removal

### Task 17: Delete obsolete components

**Files (delete):**
```
resource/js/shared/components/BaseDatePicker.vue
resource/js/shared/components/BaseDatePicker.stories.js
resource/js/shared/components/BaseDatePickerDropMenu.vue
resource/js/shared/components/BaseDatePickerDropMenuPanel.vue
resource/js/shared/components/BaseDateTimePicker.vue
resource/js/shared/components/BaseDateTimePicker.stories.js
resource/js/shared/components/BaseTimePicker.vue
resource/js/shared/components/BaseTimePicker.stories.js
resource/js/shared/components/BaseDateRangeInput.vue
resource/js/shared/components/BaseDateRangeInput.stories.js
src/components/menus/DateRangeFilter.vue
```

- [ ] **Step 1: Confirm zero references remain**

Run:
```bash
grep -rln "BaseDatePicker\|BaseDateTimePicker\|BaseTimePicker\|BaseDateRangeInput\|DateRangeFilter\|BaseDatePickerDropMenu" src resource --include="*.vue" --include="*.js" | grep -vE "BaseDatePickerDropMenu(Panel)?\.vue$|BaseDatePicker\.(vue|stories)|BaseDateTimePicker\.(vue|stories)|BaseTimePicker\.(vue|stories)|BaseDateRangeInput\.(vue|stories)|menus/DateRangeFilter\.vue$"
```
Expected: no output. If any references remain, fix them before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm \
  resource/js/shared/components/BaseDatePicker.vue \
  resource/js/shared/components/BaseDatePicker.stories.js \
  resource/js/shared/components/BaseDatePickerDropMenu.vue \
  resource/js/shared/components/BaseDatePickerDropMenuPanel.vue \
  resource/js/shared/components/BaseDateTimePicker.vue \
  resource/js/shared/components/BaseDateTimePicker.stories.js \
  resource/js/shared/components/BaseTimePicker.vue \
  resource/js/shared/components/BaseTimePicker.stories.js \
  resource/js/shared/components/BaseDateRangeInput.vue \
  resource/js/shared/components/BaseDateRangeInput.stories.js \
  src/components/menus/DateRangeFilter.vue
```

- [ ] **Step 3: Regenerate `components.d.ts` if it lists them**

Run: `grep -nE "BaseDatePicker|BaseDateTimePicker|BaseTimePicker|BaseDateRangeInput|DateRangeFilter" components.d.ts`
If present, run the project's component-types generation (start `npm run dev` briefly or `npm run build` — `unplugin-vue-components` regenerates `components.d.ts`), then re-check.

- [ ] **Step 4: Verify build + full test suite**

Run: `npx vitest run && npm run build && npm run lint`
Expected: PASS / OK.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete legacy date/time components"
```

---

### Task 18: Remove the `v-calendar` dependency

**Files:**
- Modify: `package.json`, `src/main.js` (and any `v-calendar` CSS import)

- [ ] **Step 1: Find every `v-calendar` reference**

Run: `grep -rn "v-calendar\|VCalendar\|setupCalendar\|'v-calendar/style'" src package.json`
Expected hits: `package.json` dependency + `src/main.js` plugin setup/CSS import.

- [ ] **Step 2: Remove the setup from `src/main.js`**

Delete the `v-calendar` import(s), its CSS import, and the `app.use(...)` / `setupCalendar(...)` call.

- [ ] **Step 3: Remove the dependency**

```bash
npm uninstall v-calendar
```

- [ ] **Step 4: Verify build + tests + lint + storybook**

Run: `npx vitest run && npm run build && npm run build-storybook && npm run lint`
Expected: all green; no unresolved `v-calendar` import.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main.js
git commit -m "chore: drop v-calendar dependency"
```

---

### Task 19: Final verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full suite + layout lint**

Run: `npx vitest run && npm run lint && npm run build && npm run build-storybook`
Expected: all pass.

- [ ] **Step 2: Grep for stragglers**

Run:
```bash
grep -rn "toFormat(\|\.toISO(\|MutationObserver" resource/js/shared/components/BaseCalendar.vue resource/js/shared/components/BaseDateField.vue
grep -rln "BaseDatePicker\|v-calendar" src resource --include="*.vue" --include="*.js"
```
Expected: no display-formatting violations in components (only luxon math), no leftover legacy references.

- [ ] **Step 3: Hand off for visual verification**

List every migrated auth-gated page (form sites from Task 10, toolbars from Task 16, `FieldRecordsList`, `DynamicForm` host pages) for the user to eyeball per their stated preference (build/lint passing ≠ verified).

- [ ] **Step 4: Commit any doc updates**

```bash
git add -A && git commit -m "chore: date system final verification notes" || true
```

---

## Self-Review

**1. Spec coverage:**
- Audit → done in spec; consolidation enacted by Tasks 17-18. ✓
- Architecture (BaseCalendar/BaseDateField/BaseDateFilter + useDateField) → Tasks 3-7, 12. ✓
- Value contract (DateTime default + valueFormat iso, range `{start,end}`, multiple array) → Task 3 (helpers), Task 6/7 (field). ✓
- All `mode`s: date (T6), datetime/time (T7), range (T6), multiple (T6); **month/year** → covered by `BaseCalendar` day grid + field accepting the mode, but month/year *views* (picking a month/year directly) are not separately built. **Gap:** add a note — month/year currently fall back to the day grid. Acceptable for v1 (stories exist); flagged below.
- Presets (T1, T6 rail), relative dynamic tokens (T2, T12), operators (T2, T12). ✓
- Advanced filter integration (T14), table/list filtering (T15, T16). ✓
- Storybook coverage every state (T5, T8, T13). ✓
- Migration of all call sites (T9, T10, T11, T16) + deletion (T17) + dep removal (T18). ✓
- Timezone prop (T4 `BaseCalendar`, T6 passes through). ✓
- Tests for resolvers/composable/calendar/field/filter (T1-4, 6-7, 12, 15). ✓

**Gap fix (month/year):** v1 ships `mode="month"`/`"year"` as day-grid-backed fields (value is a DateTime; the calendar still navigates by month). Dedicated month/year *grid views* are deferred — not required by any current call site (no consumer uses month/year today). Noted here so it is explicit rather than silently dropped.

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. Migration Tasks 10 and 16 use an explicit recipe + one fully-worked file + a grep gate rather than repeating ~25 identical edits verbatim — the transform is byte-identical per site, so the recipe is the DRY source of truth and the grep proves completeness.

**3. Type consistency:** Token shape `{ operator, value, value2, relative:{dir,unit,count} }` is identical across Task 2 (resolvers), Task 12 (editor), Task 14 (filter node), Task 16 (usage). `{ start, end }` range shape consistent across BaseCalendar (T4), BaseDateField (T6), resolvers. `resolveDateFilter`/`matchesDateFilter`/`resolvePreset`/`resolveRelative`/`PRESETS`/`OPERATORS` names consistent throughout. `useDateField`/`toModel`/`fromModel`/`parseManual`/`formatField` consistent (T3 → T6/T7).
