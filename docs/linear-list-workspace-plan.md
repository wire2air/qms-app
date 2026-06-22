# Linear-parity List Workspace — Plan

> Target: match Linear's list-view UX for **filtering, sorting/grouping, and the right facet panel** (per the reference screenshots), using our design tokens (works in light + dark) rather than copying Linear's dark palette literally. Build the reusable components first, then adopt on Nonconformances as the flagship.

## Patterns to match (from the Linear screenshots)

1. **Filter menu** — a `Filter` button opens a menu of filter **dimensions** (Status, Severity, Type, Supplier, Assignee, Dates…). Choosing a dimension reveals its **values** (multi-select, with per-value **counts**, searchable). Applied filters render as removable **tokens** ("Status is Todo, In Progress ✕"). No more row of inline selects.
2. **Display options** — a popover for **Group by** (status / severity / none), **Ordering / Sort by** (created / due / priority), density, and visible columns/properties.
3. **Grouped list** — rows grouped by the chosen dimension under collapsible **group headers with counts** (Linear groups by status by default).
4. **Right facet panel** — a right sidebar with tabs (Assignees / Labels / Priority / Projects) showing **per-value counts**; clicking a value filters the list.

## New components / primitives

| Piece | Layer | Role |
| --- | --- | --- |
| `BaseFilterMenu` | L3 | Dimension→value filter picker (trigger + nav menu + multi-select + counts + search). v-model = `{ [key]: value[] }`. **← build first** |
| `BaseFilterTokens` | L3 | Renders the applied-filter tokens with remove + "Clear all". |
| `useDataView` | L1 | Headless: holds the multi-select filter model, grouping key, sort key/dir; derives grouped rows + per-dimension **facet counts**. Powers all four patterns. |
| `BaseDisplayOptions` | L3 | Group-by / sort-by / density / columns popover. |
| Grouped rendering | — | Group headers + collapse in `BaseTable` (or a `BaseGroupedList`). |
| `BaseFacetPanel` | L3 | Right aggregation panel (tabs of dimensions → value+count rows, click to filter). |

## Sequence

1. **`BaseFilterMenu`** (+ story/tests) — the distinctive Linear filter UX. *(this pass)*
2. **`useDataView`** headless core (filter model + facet counts + grouping/sorting).
3. **Wire Nonconformances**: migrate its filter model from single-id to multi-select arrays; replace the stacked-select popover with `BaseFilterMenu` + `BaseFilterTokens`.
4. **`BaseDisplayOptions`** + **grouped list** (group by status by default, like Linear).
5. **`BaseFacetPanel`** (right pane) driven by `useDataView` facet counts.

Each step: build → unit tests → Storybook → `lint`/`build` green → screenshot checkpoint before the next.

## Notes / decisions

- **Theme:** use tokens (`bg-card`, `border-divider`, `text-secondary`, `main-selected`) so it matches our app in light AND dark — not Linear's literal dark colors.
- **Multi-select model:** filters become arrays per dimension (`{ statusId: ['UNDER_REVIEW'] }`). Consuming pages update their `applyFilters` to `array.includes(row.x)` and the live-query deps accordingly.
- **One popover, two steps:** dimension list → value list (with a Back affordance), rather than Linear's literal cascading side-by-side popovers — same UX, far simpler + more robust.
- Reuses `BasePopover` (HeadlessUI) for menus; keyboard-operable `<button>` items (no `div@click`).
