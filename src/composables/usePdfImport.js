import { uploadFile } from '@/composables/useFileUpload.js'

/**
 * Client-side PDF import.
 *
 * Reads a PDF entirely in the browser via pdfjs-dist:
 *   - Extracts text per page (preserving line breaks)
 *   - Extracts embedded raster images per page, uploads each via the
 *     existing `uploadFile` ASSET pipeline, and replaces them inline with
 *     a markdown `![alt](url)` reference so the AI structuring step sees
 *     them in context.
 *   - Auto-detects repeating headers / footers / company logos and skips
 *     them — those add noise to every section without carrying content.
 *
 * Pipeline:
 *   1. Scan all pages, buffering text lines + image candidates (no uploads
 *      yet — uploads are expensive and we want to skip duplicates).
 *   2. Detect repeating text lines (appear on >=60% of pages) and image
 *      hashes (same dimensions + sample-byte signature on >=60% of pages).
 *      Both require >= MIN_PAGES_FOR_DETECTION pages so very short PDFs
 *      don't get over-stripped.
 *   3. Build the output stream: strip repeating lines (preserve page 1 so
 *      the title from the header survives for the AI to pick up), upload
 *      only non-repeating images.
 *
 * The output is a plain-text / markdown stream the backend AI task
 * (`document.import_from_pdf`) turns into structured sections.
 *
 * Caveats:
 *   - Scanned (image-only) PDFs come back with very little extracted text;
 *     the caller can detect this (textLength threshold) and route to a
 *     multimodal AI fallback.
 *   - Table layout is lost (text comes out in reading order). The AI step
 *     handles this gracefully by treating the content as prose.
 */

// Repetition detection knobs. Conservative defaults so we never over-strip
// a short document where every page legitimately repeats some content.
const REPEAT_THRESHOLD = 0.6
const MIN_PAGES_FOR_DETECTION = 3
// Lines shorter than this are too noisy to use as fingerprints (page
// numbers like "1" would match across many pages but stripping them is
// fine — covered by the threshold).
const MIN_LINE_LENGTH = 3

// Input bounds. Hard caps reject; soft caps truncate + report.
// Sized generously above typical SOP shape (5–30 pages, a few MB,
// dozens of images) — bump if a real document hits one of these.
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB hard cap
const MAX_PAGES = 300 // hard cap
const MAX_IMAGES = 100 // soft cap — extras counted as skippedDueToLimit

const MB = 1024 * 1024

export class PdfImportLimitError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PdfImportLimitError'
    this.code = code // 'FILE_TOO_LARGE' | 'TOO_MANY_PAGES'
  }
}

let pdfjsPromise = null

async function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise
  pdfjsPromise = import('pdfjs-dist').then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    return mod
  })
  return pdfjsPromise
}

/**
 * Parse a PDF, upload its unique images, and return an extracted text stream.
 *
 * Bounds (see module constants above): rejects files >MAX_FILE_BYTES or
 * documents with >MAX_PAGES (throws PdfImportLimitError). Image upload count
 * is soft-capped at MAX_IMAGES and the excess is reported as
 * `skippedDueToLimit` so the dialog can surface "+ N images skipped".
 *
 * @param {File} file
 * @param {(stage: { phase: string, current?: number, total?: number, message?: string }) => void} [onProgress]
 * @param {{ uploadImages?: boolean }} [options]  uploadImages: false → text-only
 *   extraction (no asset uploads, no image scanning) — used by chat attachments
 * @returns {Promise<{
 *   text: string,
 *   pageCount: number,
 *   imageCount: number,
 *   filename: string,
 *   headerLinesStripped: number,
 *   recurringImagesSkipped: number,
 *   skippedDueToLimit: number,
 * }>}
 * @throws {PdfImportLimitError} on FILE_TOO_LARGE or TOO_MANY_PAGES
 */
export async function parsePdfAndExtractImages(
  file,
  onProgress = () => {},
  { uploadImages = true } = {},
) {
  if (!file) throw new Error('No file provided')
  if (!file.type?.includes('pdf') && !file.name?.toLowerCase().endsWith('.pdf')) {
    throw new Error('File does not appear to be a PDF')
  }

  // Reject before the browser allocates an ArrayBuffer for an over-cap file.
  if (file.size > MAX_FILE_BYTES) {
    throw new PdfImportLimitError(
      'FILE_TOO_LARGE',
      `PDF is ${(file.size / MB).toFixed(1)} MB; maximum is ${MAX_FILE_BYTES / MB} MB. Please split it or compress images.`,
    )
  }

  onProgress({ phase: 'loading', message: 'Loading PDF…' })
  const pdfjs = await loadPdfJs()

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const pageCount = doc.numPages

  // Reject before we burn CPU/memory on per-page parsing of an over-cap doc.
  if (pageCount > MAX_PAGES) {
    try {
      doc.destroy?.()
    } catch {
      // best-effort cleanup
    }
    throw new PdfImportLimitError(
      'TOO_MANY_PAGES',
      `PDF has ${pageCount} pages; maximum is ${MAX_PAGES}. Please split it.`,
    )
  }

  // ── Phase 1: scan all pages, buffer text lines + image candidates ───
  const pagesRaw = []

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    onProgress({
      phase: 'parsing',
      current: pageNum,
      total: pageCount,
      message: `Reading page ${pageNum} of ${pageCount}…`,
    })

    const page = await doc.getPage(pageNum)
    const lines = await extractLines(page)
    const imageCandidates = uploadImages ? await collectImageCandidates(page, doc, pdfjs) : []

    pagesRaw.push({ pageNum, lines, imageCandidates })
  }

  // ── Phase 2: detect repeating lines + image hashes ──────────────────
  const repeatingLines = findRepeatingLines(
    pagesRaw.map((p) => p.lines),
    REPEAT_THRESHOLD,
    MIN_PAGES_FOR_DETECTION,
  )
  const repeatingHashes = findRepeatingHashes(
    pagesRaw.map((p) => p.imageCandidates),
    REPEAT_THRESHOLD,
    MIN_PAGES_FOR_DETECTION,
  )

  // ── Phase 3: filter + upload unique images + assemble output ────────
  const pageBlocks = []
  let imageCount = 0
  let headerLinesStripped = 0
  let recurringImagesSkipped = 0
  let skippedDueToLimit = 0

  // For upload progress: count the total uniques to upload up front, capped
  // at MAX_IMAGES. Anything past the cap is reported as skippedDueToLimit.
  let totalUniqueImages = 0
  for (const p of pagesRaw) {
    for (const cand of p.imageCandidates) {
      if (!isRepeatingImage(cand, repeatingHashes)) totalUniqueImages += 1
    }
  }
  if (totalUniqueImages > MAX_IMAGES) {
    skippedDueToLimit = totalUniqueImages - MAX_IMAGES
    totalUniqueImages = MAX_IMAGES
  }
  let uploadIdx = 0

  for (const p of pagesRaw) {
    const isFirstPage = p.pageNum === 1
    // Strip repeating lines on every page EXCEPT page 1 — the page-1
    // header usually contains the doc title / number, and we want the AI
    // to see that when picking the title.
    const keptLines = []
    for (const line of p.lines) {
      const norm = line.trim()
      if (!isFirstPage && repeatingLines.has(norm)) {
        headerLinesStripped += 1
        continue
      }
      keptLines.push(line)
    }
    const pageText = keptLines.join('\n').trim()

    const imageRefs = []
    for (const cand of p.imageCandidates) {
      if (isRepeatingImage(cand, repeatingHashes)) {
        recurringImagesSkipped += 1
        continue
      }
      // Soft image cap: stop uploading once we've hit MAX_IMAGES uniques.
      // Already counted into skippedDueToLimit above.
      if (imageCount >= MAX_IMAGES) {
        continue
      }
      uploadIdx += 1
      onProgress({
        phase: 'uploading',
        current: uploadIdx,
        total: totalUniqueImages,
        message: `Uploading image ${uploadIdx} of ${totalUniqueImages}…`,
      })
      try {
        const url = await uploadBitmapAsPng(cand.obj, file.name, p.pageNum, imageCount + 1)
        if (url) {
          imageCount += 1
          imageRefs.push(url)
        }
      } catch {
        // One bad image must not abort the import.
      }
    }

    let block = `## Page ${p.pageNum}\n\n${pageText}`
    for (const url of imageRefs) {
      block += `\n\n![Page ${p.pageNum} image](${url})`
    }
    pageBlocks.push(block)
  }

  onProgress({ phase: 'done', total: pageCount, current: pageCount })

  return {
    text: pageBlocks.join('\n\n'),
    pageCount,
    imageCount,
    filename: file.name,
    headerLinesStripped,
    recurringImagesSkipped,
    skippedDueToLimit,
  }
}

/**
 * Read just the front of a PDF — locally, with no AI (user question
 * 2026-08-16: "can we use that to get document title or does that require
 * AI?").
 *
 * No model is needed for a title. PDFs carry one in their metadata, and where
 * that is absent or junk the first substantial line of page 1 is nearly always
 * it. What a model buys you is a SUMMARY, which is why the AI path exists —
 * but it can be fed these few pages instead of the whole document.
 *
 * Deliberately unbounded by MAX_FILE_BYTES / MAX_PAGES: it touches only the
 * first `maxPages` and extracts no images, so the very documents the full
 * importer rejects are exactly the ones this has to work on.
 *
 * @returns {Promise<{title: string, text: string, pageCount: number}>}
 */
export async function extractPdfHeader(file, { maxPages = 3 } = {}) {
  if (!file) throw new Error('No file provided')
  const pdfjs = await loadPdfJs()
  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise

  const meta = await doc.getMetadata().catch(() => null)
  const lines = []
  const pages = Math.min(doc.numPages, Math.max(1, maxPages))
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p)
    lines.push(...(await extractLines(page)))
  }

  return {
    title: cleanPdfTitle(meta?.info?.Title) || titleFromLines(lines) || '',
    text: lines.join('\n').trim(),
    pageCount: doc.numPages,
    // Read off the same lines, locally. Free, deterministic, and available on
    // every path including with AI disabled.
    ...extractHeaderFields(lines),
  }
}

/**
 * PDF `info.Title` is unreliable — authoring tools stuff it with the source
 * filename ("Microsoft Word - SOP-001.docx") or leave a template's name behind.
 * Strip the tell-tale prefixes and extensions; reject what's left if it looks
 * like a filename rather than a title.
 */
function cleanPdfTitle(raw) {
  let t = (raw ?? '').trim()
  if (!t) return ''
  t = t.replace(/^Microsoft\s+(Word|PowerPoint|Excel)\s*-\s*/i, '')
  t = t.replace(/\.(docx?|pptx?|xlsx?|pdf)$/i, '').trim()
  if (!t || t.length < 3) return ''
  // "untitled", "document1" and friends are worse than nothing.
  if (/^(untitled|document\s*\d*|presentation\s*\d*)$/i.test(t)) return ''
  return t
}

/** First line that reads like a heading rather than a header/footer. */
/**
 * Read the page-one header block LOCALLY — no AI, no network, no cost.
 *
 * A controlled document prints its own identity in a key/value block at the
 * top of page one: "Document Number: SOP-QA-006", "Department: Quality
 * Assurance". We already have those lines — extractPdfHeader reads the first
 * three pages on EVERY import path, including when AI is switched off
 * entirely — so asking a model for them was both a needless round trip and
 * less reliable, since on a long document the number is one line in thirty
 * pages of noise.
 *
 * Labels vary by company, which is the whole difficulty; the alternatives
 * below cover the forms seen in practice. A match must look like an
 * identifier (letters/digits with separators, no spaces in the middle) so a
 * sentence following the word "Reference" is not mistaken for a number.
 *
 * Returns { documentNumber, department }, each null when not printed. Never
 * guesses: the caller falls back to the model, and then to its own default.
 */
const NUMBER_LABELS =
  /^(?:document|doc|sop|wi|form|record|procedure)?\s*(?:number|no\.?|num|id|ident(?:ifier)?|ref(?:erence)?|#)\s*$/i
const DEPARTMENT_LABELS = /^(?:department|dept\.?|function|owning\s+department)\s*$/i

// An identifier, not prose: no interior whitespace runs, at least one digit or
// two capitals, and short. "SOP-QA-006", "QMS/WI/14", "F024" pass;
// "the applicable procedure" does not.
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._\-/]{1,48}$/

function splitLabelled(line) {
  const m = /^\s*([^:]{1,40}?)\s*[:\u2013\u2014-]\s*(.+?)\s*$/.exec(line)
  return m ? { label: m[1], value: m[2] } : null
}

export function extractHeaderFields(lines) {
  let documentNumber = null
  let department = null

  // Header blocks live at the very top. Scanning the whole 3 pages would start
  // matching body prose such as "Reference: see section 4".
  for (const raw of (lines ?? []).slice(0, 40)) {
    const line = String(raw ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!line) continue
    const hit = splitLabelled(line)
    if (!hit) continue

    if (!documentNumber && NUMBER_LABELS.test(hit.label) && IDENTIFIER.test(hit.value)) {
      documentNumber = hit.value
    }
    if (!department && DEPARTMENT_LABELS.test(hit.label) && hit.value.length <= 100) {
      department = hit.value
    }
    if (documentNumber && department) break
  }

  return { documentNumber, department }
}

function titleFromLines(lines) {
  for (const raw of lines.slice(0, 40)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (line.length < 4 || line.length > 120) continue
    // Page numbers, dates, doc-control furniture.
    if (/^(page\s*)?\d+(\s*of\s*\d+)?$/i.test(line)) continue
    if (/^(rev(ision)?|version|effective|date|doc(ument)?\s*(no|#|id))\b/i.test(line)) continue
    if (!/[a-z]/i.test(line)) continue
    return line
  }
  return ''
}

// ─── Page extraction helpers ────────────────────────────────────────────

async function extractLines(page) {
  const tc = await page.getTextContent()
  let prevY = null
  const lines = []
  let currentLine = []
  for (const item of tc.items) {
    const y = item.transform?.[5]
    if (prevY !== null && Math.abs(y - prevY) > 5) {
      if (currentLine.length) lines.push(currentLine.join(''))
      currentLine = []
    }
    currentLine.push(item.str)
    if (item.hasEOL) {
      lines.push(currentLine.join(''))
      currentLine = []
    }
    prevY = y
  }
  if (currentLine.length) lines.push(currentLine.join(''))
  return lines
}

/**
 * Walk the page's operator list, collect image XObject references, hash
 * each candidate, and return them in painting order. We don't upload
 * anything here — that happens in Phase 3 after duplicate detection.
 */
async function collectImageCandidates(page, doc, pdfjs) {
  const ops = await page.getOperatorList()
  const OPS = pdfjs.OPS
  const IMAGE_OPS = new Set(
    [
      OPS.paintImageXObject,
      OPS.paintImageXObjectRepeat,
      OPS.paintInlineImageXObject,
      OPS.paintInlineImageXObjectGroup,
    ].filter((v) => v != null),
  )
  const seen = new Set()
  const out = []

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (!IMAGE_OPS.has(ops.fnArray[i])) continue
    const imgName = ops.argsArray[i]?.[0]
    if (!imgName || seen.has(imgName)) continue
    seen.add(imgName)
    try {
      const obj = await resolveImageObject(page, doc, imgName)
      if (!obj) continue
      const hash = await computeImageHash(obj, imgName)
      if (!hash) continue
      out.push({ imgName, obj, hash })
    } catch {
      // Skip individual resolution failures.
    }
  }
  return out
}

/**
 * Compute TWO hashes per image so repetition detection has a fallback:
 *
 *   1. `nameHash` — XObject reference name + dimensions. Strongest signal
 *      for "same logical image across pages". Pdfjs reuses XObject names
 *      (e.g. "Im0") for the same embedded image. This catches the
 *      common-case company logo that appears on every page.
 *
 *   2. `contentHash` — quantised pixel sample (bitmap) or byte sample
 *      (raw data) + dimensions. Catches the case where the PDF embeds
 *      the same image under different names per page.
 *
 * Repetition detection (downstream) checks both — if EITHER hash hits the
 * threshold on enough pages, the image is treated as a recurring header
 * and skipped everywhere. This is more lenient than requiring both,
 * because pdfjs first-page decodes can render slightly differently from
 * subsequent pages and break content-hash equality.
 */
async function computeImageHash(imgObj, imgName) {
  const width = imgObj?.width
  const height = imgObj?.height
  if (!width || !height) return null

  const nameHash = imgName ? `name:${imgName}|${width}x${height}` : null
  let contentHash = null

  if (imgObj.bitmap) {
    try {
      const c = document.createElement('canvas')
      c.width = 8
      c.height = 8
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.drawImage(imgObj.bitmap, 0, 0, 8, 8)
        const px = ctx.getImageData(0, 0, 8, 8).data
        // Quantise to 3 bits per channel so JPEG artefacts / first-page
        // render quirks in the same logo hash identically.
        let h = `${width}x${height}:`
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i] >> 5
          const g = px[i + 1] >> 5
          const b = px[i + 2] >> 5
          h += ((r << 6) | (g << 3) | b).toString(16)
        }
        contentHash = h
      }
    } catch {
      // fall through to name-only
    }
  } else if (imgObj.data) {
    const src = imgObj.data
    const step = Math.max(1, Math.floor(src.length / 32))
    let h = `${width}x${height}:`
    for (let i = 0; i < src.length && h.length < 128; i += step) {
      h += src[i].toString(16).padStart(2, '0')
    }
    contentHash = h
  }

  // Always return something hashable, even if both paths failed.
  return { nameHash, contentHash: contentHash || `${width}x${height}|fallback` }
}

// ─── Repetition detection ───────────────────────────────────────────────

function findRepeatingLines(pageLines, threshold, minPages) {
  const total = pageLines.length
  if (total < minPages) return new Set()
  const counts = new Map()
  for (const lines of pageLines) {
    // Each unique line counts once per page so a header that gets read
    // twice in one pass doesn't dominate the histogram.
    const onThisPage = new Set()
    for (const raw of lines) {
      const norm = raw.trim()
      if (norm.length < MIN_LINE_LENGTH) continue
      if (onThisPage.has(norm)) continue
      onThisPage.add(norm)
      counts.set(norm, (counts.get(norm) || 0) + 1)
    }
  }
  const cutoff = Math.max(minPages, Math.ceil(total * threshold))
  const repeating = new Set()
  for (const [line, count] of counts) {
    if (count >= cutoff) repeating.add(line)
  }
  return repeating
}

/**
 * Repeating-image detection. computeImageHash now returns
 * { nameHash, contentHash } per image. We build TWO frequency tables —
 * one for nameHash, one for contentHash — and mark an image as
 * "repeating" if EITHER side crosses the threshold.
 *
 * Why two signals: pdfjs can decode the same embedded image slightly
 * differently across pages (first-page-render artefacts, ICC quirks)
 * making contentHash unstable; conversely, some PDFs assign a unique
 * XObject name per page even for the same image, making nameHash
 * unstable. Either-of-two catches both failure modes.
 */
function findRepeatingHashes(pageImages, threshold, minPages) {
  const total = pageImages.length
  if (total < minPages) return { byName: new Set(), byContent: new Set() }

  const nameCounts = new Map()
  const contentCounts = new Map()

  for (const images of pageImages) {
    const namesOnPage = new Set()
    const contentsOnPage = new Set()
    for (const { hash } of images) {
      const { nameHash, contentHash } = hash ?? {}
      if (nameHash && !namesOnPage.has(nameHash)) {
        namesOnPage.add(nameHash)
        nameCounts.set(nameHash, (nameCounts.get(nameHash) || 0) + 1)
      }
      if (contentHash && !contentsOnPage.has(contentHash)) {
        contentsOnPage.add(contentHash)
        contentCounts.set(contentHash, (contentCounts.get(contentHash) || 0) + 1)
      }
    }
  }

  const cutoff = Math.max(minPages, Math.ceil(total * threshold))
  const byName = new Set()
  const byContent = new Set()
  for (const [h, count] of nameCounts) {
    if (count >= cutoff) byName.add(h)
  }
  for (const [h, count] of contentCounts) {
    if (count >= cutoff) byContent.add(h)
  }

  // Lightweight diagnostic — helps confirm headers are being detected
  // without users having to dig into the parsed text.
  if (byName.size || byContent.size) {
    console.info(
      `[pdf-import] repeating images detected: ${byName.size} by name, ${byContent.size} by content (cutoff: ${cutoff}/${total} pages)`,
    )
  }

  return { byName, byContent }
}

// Check whether a given candidate's hash matches either repetition set.
function isRepeatingImage(cand, repeatingHashes) {
  const { nameHash, contentHash } = cand.hash ?? {}
  if (nameHash && repeatingHashes.byName.has(nameHash)) return true
  if (contentHash && repeatingHashes.byContent.has(contentHash)) return true
  return false
}

// ─── pdfjs lookup helpers ───────────────────────────────────────────────

/**
 * Resolve a named image object from the page (or shared `commonObjs`).
 *
 * pdfjs-dist 5.x: `objs.get(name)` returns a Promise; the old callback
 * form silently hangs. We try the page objs first, fall back to commonObjs,
 * and bound the whole thing with a timeout so a missing or unloadable
 * image never deadlocks the page loop.
 */
async function resolveImageObject(page, doc, imgName) {
  const TIMEOUT_MS = 5000
  const lookup = async () => {
    if (page.objs?.has?.(imgName)) {
      return await page.objs.get(imgName)
    }
    try {
      return await page.objs.get(imgName)
    } catch {
      // Fall through
    }
    if (doc.commonObjs?.has?.(imgName)) {
      return await doc.commonObjs.get(imgName)
    }
    try {
      return await doc.commonObjs.get(imgName)
    } catch {
      return null
    }
  }
  return await Promise.race([
    lookup(),
    new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ])
}

/**
 * Convert a pdf.js image object to a PNG blob, upload via uploadFile, and
 * return the resulting public URL.
 *
 * pdfjs-dist 5.x returns image objects in two main shapes:
 *   A) `{ bitmap: ImageBitmap, width, height }` — modern decoder output
 *      (JPEG, JPEG2000, most photo / screenshot embeds). We drawImage() it.
 *   B) `{ data: Uint8ClampedArray, width, height, kind }` — legacy raw
 *      pixel path. Fall back to best-effort kind detection AND length-based
 *      sniffing because some PDFs mis-report `kind`.
 */
async function uploadBitmapAsPng(imgObj, sourceFilename, pageNum, indexOnPage) {
  const width = imgObj?.width
  const height = imgObj?.height
  if (!width || !height) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  if (imgObj.bitmap && typeof imgObj.bitmap === 'object') {
    try {
      ctx.drawImage(imgObj.bitmap, 0, 0, width, height)
    } catch {
      return null
    }
  } else if (imgObj.data) {
    const src = imgObj.data
    const pixelCount = width * height
    const rgba = new Uint8ClampedArray(pixelCount * 4)
    const kind = imgObj.kind

    if (kind === 1 || src.length === pixelCount) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4] = src[i]
        rgba[i * 4 + 1] = src[i]
        rgba[i * 4 + 2] = src[i]
        rgba[i * 4 + 3] = 255
      }
    } else if (kind === 2 || src.length === pixelCount * 3) {
      for (let i = 0; i < pixelCount; i++) {
        rgba[i * 4] = src[i * 3]
        rgba[i * 4 + 1] = src[i * 3 + 1]
        rgba[i * 4 + 2] = src[i * 3 + 2]
        rgba[i * 4 + 3] = 255
      }
    } else if (kind === 3 || src.length === pixelCount * 4) {
      rgba.set(src.subarray(0, pixelCount * 4))
    } else {
      return null
    }

    try {
      ctx.putImageData(new ImageData(rgba, width, height), 0, 0)
    } catch {
      return null
    }
  } else {
    return null
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return null
  const baseName = (sourceFilename || 'pdf-import').replace(/\.pdf$/i, '')
  const imgFile = new File([blob], `${baseName}_p${pageNum}_${indexOnPage}.png`, {
    type: 'image/png',
  })

  const result = await uploadFile(imgFile, 'ASSET')
  if (!result.success || !result.asset?.url) return null
  return result.asset.url
}
