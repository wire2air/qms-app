/**
 * CSV export for the data table (pure logic + a tiny DOM download helper).
 *
 * Each column's value comes from `col.exportValue(row)` when provided, otherwise
 * the normal accessor. luxon DateTime values export as ISO dates by default.
 * Named so it can't collide with a component (no <ExportCsv>) — see the
 * unplugin-vue-components gotcha noted alongside filterModel.js.
 */
import { getCellValue } from './useDataTable.js'

function csvCell(value) {
  const s = value == null ? '' : String(value)
  // Quote when the cell contains a delimiter, quote, or newline (RFC 4180).
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportValue(row, col) {
  if (typeof col.exportValue === 'function') return col.exportValue(row)
  const v = getCellValue(row, col)
  if (v == null) return ''
  if (typeof v?.toISODate === 'function') return v.toISODate() // luxon DateTime
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

/** Build an RFC-4180 CSV string from rows + our column defs (skips the actions column). */
export function rowsToCsv(rows, columns) {
  const cols = columns.filter((c) => c && c.label && c.name !== '__actions')
  const header = cols.map((c) => csvCell(c.label)).join(',')
  const body = rows.map((row) => cols.map((c) => csvCell(exportValue(row, c))).join(','))
  return [header, ...body].join('\r\n')
}

/** Trigger a browser download of a CSV string. No-op outside the browser. */
export function downloadCsv(csv, filename = 'export.csv') {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
