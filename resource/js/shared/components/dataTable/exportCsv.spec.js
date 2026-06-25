import { describe, it, expect } from 'vitest'
import { rowsToCsv, exportValue } from './exportCsv.js'

const columns = [
  { name: 'name', label: 'Name', field: 'name' },
  { name: 'site', label: 'Site', field: (r) => r.site?.name },
  { name: 'count', label: 'Open Tasks', field: 'count' },
  { name: '__actions', label: '', field: () => null },
]
const rows = [
  { id: 1, name: 'Alpha', site: { name: 'London' }, count: 3 },
  { id: 2, name: 'Beta, Inc', site: { name: 'Paris' }, count: 12 },
]

describe('exportCsv', () => {
  it('builds a header from labelled columns and skips the actions column', () => {
    const csv = rowsToCsv(rows, columns)
    const header = csv.split('\r\n')[0]
    expect(header).toBe('Name,Site,Open Tasks')
  })

  it('resolves accessor-function columns and quotes cells with commas', () => {
    const csv = rowsToCsv(rows, columns)
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('Alpha,London,3')
    expect(lines[2]).toBe('"Beta, Inc",Paris,12') // comma → quoted
  })

  it('escapes embedded quotes by doubling them', () => {
    const csv = rowsToCsv([{ name: 'He said "hi"', site: {}, count: 0 }], columns)
    expect(csv.split('\r\n')[1]).toContain('"He said ""hi"""')
  })

  it('prefers a column exportValue() over the accessor', () => {
    const cols = [{ name: 'status', label: 'Status', field: 'statusId', exportValue: (r) => `#${r.statusId}` }]
    expect(rowsToCsv([{ statusId: 'OPEN' }], cols)).toBe('Status\r\n#OPEN')
  })

  it('exports luxon DateTime as an ISO date', () => {
    const dt = { toISODate: () => '2026-06-25' }
    expect(exportValue({ when: dt }, { name: 'when', field: 'when' })).toBe('2026-06-25')
  })
})
