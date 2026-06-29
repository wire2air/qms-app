# BaseSelect — Design Spec

**Date:** 2026-06-26
**Status:** Approved, in implementation
**Branch:** `feature/base-select`

## Goal

A single, generic, reusable `BaseSelect.vue` for the QMS app — a clean-slate
Tailwind component (no Quasar; Quasar is forbidden by CLAUDE.md rule #3 and not
installed). It ships alongside the existing `BaseSelectMenu.vue` and becomes the
long-term single select primitive. Entity selects continue to follow the badge
triad, wrapping `BaseSelect` instead of `BaseSelectMenu` over time.

## API contract (QSelect-style, generic)

Chosen over a drop-in `{id,name}` superset: maximum flexibility for arbitrary
data shapes. Trade-off accepted: existing `XSelectMenu` wrappers migrate
incrementally (separate effort, not this task).

### Props

| Prop | Default | Notes |
| --- | --- | --- |
| `modelValue` | — | `String\|Number\|Object\|Array` (array in `multiple`) |
| `options` | `[]` | `Array<Object\|primitive>` |
| `optionLabel` | `'label'` | key or `fn(opt) => string` |
| `optionValue` | `'value'` | key or `fn(opt) => any` |
| `optionDisabled` | `null` | key or `fn(opt) => boolean` |
| `optionGroup` | `null` | key or `fn(opt) => string`; enables grouping |
| `optionIcon` / `optionAvatar` / `optionDescription` | `null` | rich-row seams |
| `emitValue` | `true` | emit option-value vs whole object |
| `multiple` `clearable` `disabled` `readonly` `required` `loading` `autofocus` | `false` | |
| `label` `placeholder` `instructions` `errorMsg` `hint` | `''`/`null` | chrome |
| `rules` | `[]` | `Array<fn(val) => true \| string>` |
| `size` | `'sm'` | `'sm'\|'md'` (parity with BaseTextInput) |
| `dense` | `false` | |
| `searchable` | `true` | |
| `inputDebounce` | `300` | ms; drives local + remote |
| `virtualScroll` | `'auto'` | `'auto'` (on > ~100 opts) \| `true` \| `false` |
| `maxValues` | `null` | max-selected guard (multiple) |
| `showSelectAll` `useChips` `hideSelected` `counter` | `false` | multi-select UX |

### Emits

`update:modelValue`, `focus`, `blur`, `clear`, `filter`, `popup-show`, `popup-hide`

### Slots

`selected(value)`, `option({opt, selected, active, toggle})`, `option-prefix`,
`option-suffix`, `no-option`, `loading`, `hint`, `prepend`, `append`

## Architecture

- `BaseSelect.vue` orchestrates three composables:
  - `useSelectOptions(props)` — normalize options, resolve label/value/group,
    handle `emitValue`, compute selected display.
  - `useSelectFilter(props, emit)` — local filter by default; remote mode when
    `@filter` is bound (debounced emit, `loading` gates list, no local filter).
  - `useSelectKeyboard(...)` — Arrow/Home/End/Enter/Escape/Backspace over the
    visible list; skips group headers + disabled rows; drives
    `aria-activedescendant`.
- Dropdown via existing `BasePopover` (floating-ui).
- Styling mirrors `BaseTextInput` exactly → no layout shift.
- Virtual scrolling via vueuse `useVirtualList` (v14, already a dep). Grouped
  lists virtualize a pre-flattened `[header, ...rows]` array; fixed row height.

## Capabilities

- **Virtual scroll** — `'auto'` past ~100 options.
- **Async** — `@filter` event model (debounced query out, parent sets
  `loading` + replaces `options`). Not Quasar's `update => update(fn)` callback.
- **Grouped + rich options** — sticky group headers; icon/avatar/description
  rows; disabled rows unfocusable/unselectable.
- **Multi-select UX** — chips, counter, `maxValues`, select-all/clear-all
  footer, `hideSelected`.

## Validation & a11y

- `rules` validated on blur + before close; `validate()` / `resetValidation()`
  exposed; errors via `BaseErrorText`. `required` is a built-in rule.
- `role="combobox"` trigger + `role="listbox"` panel, `aria-activedescendant`,
  `aria-multiselectable`, `aria-disabled/invalid/describedby`, full keyboard
  operability, focus returns to trigger on close. No `<form>`; no non-operable
  `<div @click>` (rule #8).

## Out of scope (YAGNI — seams left for later)

Favorites, pinned, recently-selected, tag/create-new, remote
pagination/infinite-scroll. Enabled later via the `option-suffix` slot + the
`filter` event without redesign.

## Deliverables

1. `BaseSelect.vue` + three composables.
2. Unit tests (Vitest, mirroring `BaseSelectMenu.spec.js`).
3. Storybook stories (basic, multiple, async, grouped, validation, custom row,
   virtual-scroll perf).
4. One reference `XSelectMenu` migration + usage-examples doc.

## Future improvements

- Favorites / pinned / recently-selected ranking layer.
- Tag mode + create-new-option.
- Remote pagination + infinite scroll on the `filter` event.
- Variable-height virtual rows (descriptions wrap).
