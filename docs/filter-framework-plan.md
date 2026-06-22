# Cascading Filter Framework — Architecture & Plan

> A reusable, descriptor-driven **cascading flyout** filter system (Linear / GitHub / Notion / VS Code command-menu feel). Not a page-specific dropdown — a framework usable app-wide.

## Descriptor model (the composability surface)

Filters are a **tree of nodes**. One recursive renderer walks it; consumers just describe data.

```js
/** @typedef {Object} FilterNode
 * @property {string} id
 * @property {string} [label]
 * @property {object} [icon]                 // @tabler/icons-vue
 * @property {'item'|'submenu'|'divider'|'section'} [type]  // inferred: has children/options ⇒ submenu
 * @property {FilterNode[] | (() => Promise<FilterNode[]>)} [children]  // arbitrary nesting (async ⇒ loading)
 * @property {Array<{value,label,count?,icon?}>} [options]  // shorthand: a dimension's values
 * @property {string} [group]                // selection bucket key (e.g. 'statusId')
 * @property {'check'|'radio'} [select]       // leaf selection mode (default 'check' = multi)
 * @property {*} [value]                      // leaf value
 * @property {boolean} [searchable]           // inline search in this submenu (auto when options>8)
 * @property {boolean} [disabled]
 * @property {() => void} [onSelect]          // action leaf
 */
```

Selection **v-model** is a flat object: `{ [group]: value[] }` (check) or `{ [group]: value }` (radio).

## Components (reusable primitives)

| Component | Role |
| --- | --- |
| `BaseFilterMenu` | Root: trigger + root flyout; owns selection v-model + keyboard coordination; provides context. |
| `BaseFilterFlyout` (recursive) | One floating panel: search + item rows; opens a child `BaseFilterFlyout` for submenu items. floating-ui positioned (`right-start`, flip/shift, no viewport overflow). |
| `BaseFilterItem` | One row: icon + label + trailing (chevron / check / radio / count). Keyboard-operable `<button>`. |
| `BaseFilterSearch` | Inline search field inside a flyout. |
| `BaseFilterChip` | Applied-selection token (label + ✕) for the chips bar. |
| `filterMenuHelpers` | Pure: search, selection toggle, group counting, children resolution. |

(Checkbox/radio/divider/section/footer are rendered by `BaseFilterItem`/flyout from the node `type`/`select` — the descriptor *is* the composition, so they don't each need a separate file.)

## Interaction
- **Mouse:** hover a submenu item → child flyout opens beside it (floating-ui). Leaf click toggles selection (menu stays open for multi-select).
- **Keyboard:** ↑/↓ move within a panel, →/Enter open submenu (or toggle leaf), ←/Esc close panel & refocus parent, Tab cycles, **typeahead** jumps to matching item.
- **Touch:** tap opens submenu; on mobile the flyout becomes a full-width drill-down (same descriptor, stacked navigation).

## Performance
- Inline **search** filters the current panel.
- Long option lists: **windowed render** (only visible rows) — `BaseFilterFlyout` virtualizes when options exceed a threshold.
- **Async children** (function `children`) show a loading state and resolve lazily.

## Accessibility
`role="menu"` / `menuitem` / `menuitemcheckbox` / `menuitemradio`, `aria-haspopup`/`aria-expanded`, focus management between panels, `prefers-reduced-motion`, high-contrast via tokens.

## Build sequence
1. **`filterMenuHelpers` + `BaseFilterChip`** (pure + leaf primitive). ← this pass
2. **`BaseFilterFlyout` + `BaseFilterMenu`** — cascading engine (floating-ui, hover, keyboard, search, multi/single, async, disabled). ← this pass
3. **Stories** (single/two/three-level, search, multi/single, async/loading, disabled, dark). ← core set this pass; full matrix next
4. **Wire Nonconformances** to the new menu. ← this pass
5. **Follow-ups:** windowed virtualization for huge lists, touch drill-down, typeahead polish, saved/recent/AI filter sections, server-side options.

## Future extensibility (designed-for, not built yet)
AI filters · saved/recent/favorite filters · custom user filters · server-side filtering · presets · query-builder — all expressible as additional node types / sections in the same descriptor tree.
