/**
 * Pasted images become assets however they arrived.
 *
 * A pasted SCREENSHOT is a clipboard file and has always uploaded. Pasting
 * HTML that contains an image — from Word, or a copied region of a web page —
 * arrives with the bytes inlined as a data URI, which would sit in a TEXT
 * column and in the search index at full size. `dataUriToFile` is what lets
 * the second case go through the same uploader as the first.
 */
import { describe, it, expect } from 'vitest'
import { dataUriToFile, isValidImageFile, sanitizeImageUrl } from './helpers.js'

// 1×1 transparent GIF.
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('dataUriToFile', () => {
  it('converts a base64 image into an uploadable File', () => {
    const file = dataUriToFile(GIF)
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/gif')
    expect(file.size).toBeGreaterThan(0)
    // The extension follows the MIME type, so the uploaded asset is not named
    // "pasted-image" with no clue what it is.
    expect(file.name).toBe('pasted-image.gif')
  })

  it('produces a file the existing upload validation accepts', () => {
    // The whole point is to reuse the file path; a File this rejects would be
    // silently dropped instead of uploaded.
    expect(isValidImageFile(dataUriToFile(GIF))).toBe(true)
  })

  it('names the file from the caller when given one', () => {
    expect(dataUriToFile(GIF, 'defect-photo').name).toBe('defect-photo.gif')
  })

  it('returns null for anything it cannot convert, rather than throwing', () => {
    // A paste that cannot be upgraded must still paste. Throwing here would
    // take out the surrounding text and tables with it.
    expect(dataUriToFile('data:image/png;base64,%%%not-base64%%%')).toBeNull()
    expect(dataUriToFile('https://example.com/a.png')).toBeNull()
    expect(dataUriToFile('data:text/html;base64,PGgxPmhpPC9oMT4=')).toBeNull()
    expect(dataUriToFile(null)).toBeNull()
    expect(dataUriToFile(undefined)).toBeNull()
  })

  it('leaves a non-base64 data URI alone', () => {
    // `data:image/svg+xml,<svg…>` is a legitimate but un-decodable-as-base64
    // form. Better to keep it inline than to mangle it.
    expect(dataUriToFile('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>')).toBeNull()
  })
})

describe('the sanitiser still permits what we now upgrade', () => {
  it('accepts data:image so an un-upgraded paste still renders', () => {
    // The upgrade is best-effort and asynchronous. If it fails, the image must
    // still show — a blank where the user pasted a picture is worse than a
    // fat column.
    expect(sanitizeImageUrl(GIF)).toBe(GIF)
  })

  it('still blocks the schemes that matter', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeImageUrl('data:text/html;base64,PGgxPmhpPC9oMT4=')).toBeNull()
    expect(sanitizeImageUrl('file:///etc/passwd')).toBeNull()
  })
})
