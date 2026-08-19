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
 * The risk in the change is not the new shape — it is the OLD records. Reading
 * one through the new binding and saving it would drop its attachments, since
 * separate mode's serializer omits the marker. These pin the fallback that
 * stops that happening. They can go once no marker-format rows remain.
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
  if (Array.isArray(separate) && separate.length) return separate
  const raw = values?.[fieldName]
  if (typeof raw !== 'string') return []
  const idx = raw.indexOf(MARKER)
  if (idx === -1) return []
  try {
    const parsed = JSON.parse(raw.slice(idx + MARKER.length))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

describe('reading attachments off a payload', () => {
  it('prefers the separate key', () => {
    const values = { investigation: '<p>body</p>', investigation_attachments: ATTS }
    expect(attachmentsFor(values, 'investigation')).toEqual(ATTS)
  })

  it('falls back to the marker for a record written the old way', () => {
    // The case that would otherwise lose data: no separate key at all.
    const values = { investigation: `<p>body</p>${MARKER}${JSON.stringify(ATTS)}` }
    expect(attachmentsFor(values, 'investigation')).toEqual(ATTS)
  })

  it('returns nothing when there are none, either way', () => {
    expect(attachmentsFor({ investigation: '<p>body</p>' }, 'investigation')).toEqual([])
    expect(attachmentsFor({}, 'investigation')).toEqual([])
  })

  it('survives a corrupt marker rather than throwing at render time', () => {
    const values = { investigation: `<p>body</p>${MARKER}not-json` }
    expect(attachmentsFor(values, 'investigation')).toEqual([])
  })

  it('ignores a non-string body', () => {
    expect(attachmentsFor({ investigation: { nope: true } }, 'investigation')).toEqual([])
  })

  it('treats an empty separate list as absent, so the marker still wins', () => {
    // A half-migrated record: the key exists but holds nothing, while the
    // string still carries the real list.
    const values = {
      investigation: `<p>body</p>${MARKER}${JSON.stringify(ATTS)}`,
      investigation_attachments: [],
    }
    expect(attachmentsFor(values, 'investigation')).toEqual(ATTS)
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

  it('separate mode still rescues attachments encoded in the string', () => {
    const s = src('src/components/shared/RichTextAttachments.vue')
    expect(s).toContain('function initialAttachments')
    // The rescue must consult the marker parse, not only the separate model.
    const fn = s.slice(s.indexOf('function initialAttachments'), s.indexOf('const draftAtts'))
    expect(fn).toContain('initAtts')
  })
})
