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
 * @param {File} file
 * @param {(stage: { phase: string, current?: number, total?: number, message?: string }) => void} [onProgress]
 * @returns {Promise<{
 *   text: string,
 *   pageCount: number,
 *   imageCount: number,
 *   filename: string,
 *   headerLinesStripped: number,
 *   recurringImagesSkipped: number,
 * }>}
 */
export async function parsePdfAndExtractImages(file, onProgress = () => {}) {
  if (!file) throw new Error('No file provided')
  if (!file.type?.includes('pdf') && !file.name?.toLowerCase().endsWith('.pdf')) {
    throw new Error('File does not appear to be a PDF')
  }

  onProgress({ phase: 'loading', message: 'Loading PDF…' })
  const pdfjs = await loadPdfJs()

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const pageCount = doc.numPages

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
    // collectionDrops are images pdfjs saw on the page that we
    // couldn't carry through (hash failure, XObject resolution
    // failure, etc.). After the inline-image fix, per-page logos
    // become real hashable candidates and go through repetition
    // detection — so collection drops here are genuinely "we tried
    // and couldn't get this visual", worth a placeholder marker.
    const { candidates: imageCandidates, droppedCount: collectionDrops } =
      await collectImageCandidates(page, doc, pdfjs)

    pagesRaw.push({ pageNum, lines, imageCandidates, collectionDrops })
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
  // Total images we KNOW we lost (vs. silently never extracted). Split
  // between resolution failures inside collectImageCandidates and
  // upload failures here in Phase 3. Surfaced to the user so they can
  // tell from the import preview that the source had embedded visuals
  // we couldn't carry through.
  let imagesDropped = 0

  // For upload progress: count the total uniques to upload up front.
  let totalUniqueImages = 0
  for (const p of pagesRaw) {
    for (const cand of p.imageCandidates) {
      if (!isRepeatingImage(cand, repeatingHashes)) totalUniqueImages += 1
    }
  }
  let uploadIdx = 0

  // Placeholder marker the AI is instructed to preserve verbatim.
  // Uses a markdown blockquote with a warning emoji and bold text so it
  // renders as a visually distinct callout in the section preview and
  // in the final TipTap editor — not just a forgettable paragraph the
  // reviewer scrolls past. The "[IMAGE NOT EXTRACTED" text inside is
  // never matched by marked's reference-link parser (no closing
  // bracket-and-link pattern) so it survives markdown round-tripping.
  const DROPPED_IMAGE_MARKER =
    '> ⚠️ **Image not extracted from PDF.** Review the original document for visual content at this location.'

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
    // Start with collection-time drops (resolveImageObject / hash
    // failures from Phase 1) and add Phase-3 upload failures on top.
    // Both surface as the same kind of "we lost something here"
    // placeholder for the reviewer.
    let droppedOnPage = p.collectionDrops ?? 0
    for (const cand of p.imageCandidates) {
      if (isRepeatingImage(cand, repeatingHashes)) {
        recurringImagesSkipped += 1
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
        } else {
          // uploadBitmapAsPng returned null — couldn't convert the image
          // (unknown kind, bad bitmap, etc.). User-visible drop.
          droppedOnPage += 1
        }
      } catch {
        // One bad image must not abort the import.
        droppedOnPage += 1
      }
    }

    let block = `## Page ${p.pageNum}\n\n${pageText}`
    for (const url of imageRefs) {
      block += `\n\n![Page ${p.pageNum} image](${url})`
    }
    for (let k = 0; k < droppedOnPage; k++) {
      block += `\n\n${DROPPED_IMAGE_MARKER}`
    }
    imagesDropped += droppedOnPage
    pageBlocks.push(block)
  }

  onProgress({ phase: 'done', total: pageCount, current: pageCount })

  return {
    text: pageBlocks.join('\n\n'),
    pageCount,
    imageCount,
    imagesDropped,
    filename: file.name,
    headerLinesStripped,
    recurringImagesSkipped,
  }
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
 * Walk the page's operator list, collect image candidates (XObject AND
 * inline), hash each, and return them in painting order. We don't
 * upload anything here — that happens in Phase 3 after duplicate
 * detection runs across pages.
 *
 * Returns { candidates, droppedCount }. droppedCount tracks images we
 * KNOW we can't carry through (hash failures, resolve exceptions) so
 * the caller can place a visible "[IMAGE: missing]" marker in the
 * page text. Recurring images (logos / headers) are NOT in this
 * count — repetition detection runs after this step and strips them
 * intentionally via a separate counter.
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
  const seenNames = new Set()
  const out = []
  let droppedCount = 0

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (!IMAGE_OPS.has(ops.fnArray[i])) continue
    const arg = ops.argsArray[i]?.[0]
    if (!arg) {
      droppedCount += 1
      continue
    }

    if (typeof arg === 'string') {
      // Named XObject — resolve through the objs cache. Same-name
      // dedup is per-page so a logo painted twice on one page only
      // gets counted once for repetition.
      if (seenNames.has(arg)) continue
      seenNames.add(arg)
      try {
        const obj = await resolveImageObject(page, doc, arg)
        if (!obj) {
          droppedCount += 1
          continue
        }
        const hash = await computeImageHash(obj, arg)
        if (!hash) {
          droppedCount += 1
          continue
        }
        out.push({ imgName: arg, obj, hash })
      } catch {
        droppedCount += 1
      }
    } else if (typeof arg === 'object') {
      // Inline-image op — args[0] IS the image data (no objs lookup
      // needed). Word/PowerPoint exports tend to drop per-page logos
      // and footer stamps here. Hashing them properly lets the
      // repetition detector recognise + strip them as recurring, so
      // they don't pollute the dropped-image count.
      try {
        const hash = await computeImageHash(arg, null)
        if (!hash) {
          droppedCount += 1
          continue
        }
        out.push({ imgName: null, obj: arg, hash })
      } catch {
        droppedCount += 1
      }
    } else {
      droppedCount += 1
    }
  }
  return { candidates: out, droppedCount }
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
