/**
 * Shared table styling for the Checklist and Input Table fields.
 *
 * A field stores three style props — `headerColor` (a named swatch), `striped`
 * (alternating row background) and `bordered` (cell borders). `tableStyleClasses`
 * turns them into the class strings the renderers apply, so the builder preview,
 * the live checklist (BaseChecklist) and the input-table (DynamicForm) all look
 * identical. Presets are just convenience bundles that set the three props.
 */

// Header colour swatches. `swatch` is a solid colour for the picker chip;
// `headerClass` is what actually styles the <th> cells.
export const TABLE_HEADER_COLORS = [
  { id: 'default', name: 'Default', swatch: 'tw:bg-main-hover', headerClass: 'tw:bg-main-hover/60 tw:text-secondary' },
  { id: 'gray', name: 'Gray', swatch: 'tw:bg-gray-200', headerClass: 'tw:bg-gray-100 tw:text-gray-700' },
  { id: 'slate', name: 'Slate', swatch: 'tw:bg-slate-700', headerClass: 'tw:bg-slate-700 tw:text-white' },
  { id: 'primary', name: 'Brand', swatch: 'tw:bg-primary', headerClass: 'tw:bg-primary tw:text-white' },
  { id: 'blue', name: 'Blue', swatch: 'tw:bg-blue-600', headerClass: 'tw:bg-blue-600 tw:text-white' },
  { id: 'green', name: 'Green', swatch: 'tw:bg-green-600', headerClass: 'tw:bg-green-600 tw:text-white' },
  { id: 'amber', name: 'Amber', swatch: 'tw:bg-amber-500', headerClass: 'tw:bg-amber-500 tw:text-white' },
  { id: 'red', name: 'Red', swatch: 'tw:bg-red-600', headerClass: 'tw:bg-red-600 tw:text-white' },
]

// One-click presets — each sets headerColor + striped + bordered together.
export const TABLE_STYLE_PRESETS = [
  { id: 'default', name: 'Default', headerColor: 'default', striped: false, bordered: false },
  { id: 'striped', name: 'Striped', headerColor: 'gray', striped: true, bordered: false },
  { id: 'bordered', name: 'Bordered', headerColor: 'gray', striped: false, bordered: true },
  { id: 'branded', name: 'Branded', headerColor: 'primary', striped: true, bordered: false },
]

const HEADER_MAP = Object.fromEntries(TABLE_HEADER_COLORS.map((c) => [c.id, c.headerClass]))

/** Resolve a field's style props into class strings for each table part. */
export function tableStyleClasses(field) {
  const headerClass = HEADER_MAP[field?.headerColor || 'default'] || HEADER_MAP.default
  const bordered = !!field?.bordered
  const striped = !!field?.striped
  const border = bordered ? 'tw:border tw:border-divider' : ''
  return {
    tableClass: border,
    headerClass, // colour for <th> cells
    headerCellClass: border, // border for <th> cells
    rowClass: striped ? 'tw:even:bg-main-hover/25' : '', // alternating body rows
    cellClass: border, // border for <td> cells
  }
}

/** Join non-empty class fragments into one class string. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
