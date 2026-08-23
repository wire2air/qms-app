/**
 * richTextAttachment writes TWO payload keys.
 *
 * It used to pack everything into one string:
 *
 *     "<html>\n[qms-attachments]::[{assetId,name,mimeType}…]"
 *
 * The file was always a real cloud asset; it was the REFERENCE that was a
 * substring, so the list could not be queried, reported on, or read by
 * print/export without parsing a marker out of a text column. A field named
 * `investigation` now writes `investigation` and `investigation_attachments`.
 *
 * The marker-format fallback these once pinned is gone: it existed so records
 * written before the change kept their attachments, and the database reset of
 * 2026-08-23 removed the last of them. What remains pins the shape itself —
 * that the sibling key is what gets read, and that it is PLURAL, since
 * `payload.x_attachment.name` coming back undefined is the failure a singular
 * name invites.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MARKER = '\n[qms-attachments]::'
const ATTS = [
  { assetId: 'a-1', name: 'lab-report.pdf', mimeType: 'application/pdf' },
  { documentId: 'd-1', name: 'SOP-014' },
]

/**
 * The readonly view's resolver, reproduced. Vue SFC internals are not
 * importable, and the behaviour worth pinning is this decision, not the render.
 */
function attachmentsFor(values, fieldName) {
  const separate = values?.[`${fieldName}_attachments`]
  return Array.isArray(separate) ? separate : []
}


describe('reading attachments off a payload', () => {
  it('prefers the separate key', () => {
    const values = { investigation: '<p>body</p>', investigation_attachments: ATTS }
    expect(attachmentsFor(values, 'investigation')).toEqual(ATTS)
  })

  it('returns nothing when there are none, either way', () => {
    expect(attachmentsFor({ investigation: '<p>body</p>' }, 'investigation')).toEqual([])
    expect(attachmentsFor({}, 'investigation')).toEqual([])
  })

  it('ignores a non-string body', () => {
    expect(attachmentsFor({ investigation: { nope: true } }, 'investigation')).toEqual([])
  })

  it('treats an empty separate list as empty, not as a reason to look elsewhere', () => {
    // Nothing to fall back TO any more: an empty list is the answer.
    const values = { investigation: `<p>body</p>${MARKER}${JSON.stringify(ATTS)}`, investigation_attachments: [] }
    expect(attachmentsFor(values, 'investigation')).toEqual([])
  })
})

describe('the wiring', () => {
  const src = (p) => readFileSync(join(process.cwd(), p), 'utf8')

  it('DynamicForm passes separateAttachments and binds the sibling key', () => {
    const s = src('src/components/form/DynamicForm.js')
    const branch = s.slice(s.indexOf("case 'richTextAttachment'"), s.indexOf("case 'date'"))
    expect(branch).toContain('separateAttachments: true')
    expect(branch).toContain('_attachments')
    expect(branch).toContain("'onUpdate:attachments'")
  })

  it('the plural key is used — a singular name reads as a single object', () => {
    const s = src('src/components/form/DynamicForm.js')
    expect(s).toContain('${scope.path}_attachments')
    expect(s).not.toContain('${scope.path}_attachment`')
  })
})
