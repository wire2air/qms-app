import jsPDF from 'jspdf'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Build a single combined PDF from a printable DOM root + a list of
 * attached assets. The main document body is rendered via jsPDF.html()
 * (uses html2canvas under the hood, so layout is rasterised but
 * predictable). Attachments are merged page-by-page with pdf-lib:
 *
 *   - PDF      → copied directly, vector + selectable text preserved.
 *   - PNG / JPG → embedded as a full-page image, sized to fit US Letter.
 *   - Excel / Word / anything else → not combined inline. The combined
 *     PDF gets a "Linked Attachments" appendix page listing them by
 *     name so the audit trail still references them but the binaries
 *     stay where they are (the QMS itself).
 *
 * Returns a Uint8Array of the final PDF, ready to slap into a Blob and
 * download or open.
 *
 * @param {HTMLElement} domRoot - the print-page DOM to capture
 * @param {Array<{
 *   filename: string,
 *   mimeType: string,
 *   url: string,
 * }>} attachments - flat list across all sections, in section order
 * @param {(stage: { message: string }) => void} [onProgress]
 */
export async function buildCombinedDocumentPdf(domRoot, attachments, onProgress = () => {}) {
  onProgress({ message: 'Rendering main document…' })
  const mainPdfBytes = await renderHtmlToPdf(domRoot)

  const merged = await PDFDocument.load(mainPdfBytes)

  // Track Excel/Word/other "we can't combine inline" attachments and
  // surface them as a single appendix page at the very end. That way
  // a reviewer reading the printed copy still sees them referenced.
  const referenceOnly = []

  for (const [i, asset] of attachments.entries()) {
    onProgress({
      message: `Merging attachment ${i + 1} of ${attachments.length}: ${asset.filename || 'file'}…`,
    })
    const kind = classifyAttachment(asset)
    try {
      if (kind === 'pdf') {
        const bytes = await fetchAssetBytes(asset.url)
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const copied = await merged.copyPages(src, src.getPageIndices())
        for (const p of copied) merged.addPage(p)
      } else if (kind === 'image') {
        const bytes = await fetchAssetBytes(asset.url)
        const isJpg = /jpe?g/i.test(asset.mimeType) || /\.jpe?g$/i.test(asset.filename ?? '')
        const img = isJpg
          ? await merged.embedJpg(bytes)
          : await merged.embedPng(bytes)
        const page = merged.addPage()
        const { width: pageW, height: pageH } = page.getSize()
        // Fit-inside with a small inner margin so the image doesn't run
        // to the page edge. Maintains aspect ratio.
        const margin = 36
        const maxW = pageW - margin * 2
        const maxH = pageH - margin * 2
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const drawW = img.width * scale
        const drawH = img.height * scale
        page.drawImage(img, {
          x: (pageW - drawW) / 2,
          y: (pageH - drawH) / 2,
          width: drawW,
          height: drawH,
        })
      } else {
        // Reference-only (xlsx, docx, etc.). Recorded for the appendix.
        referenceOnly.push(asset)
      }
    } catch (err) {
      // Don't let one bad attachment kill the whole combine. Log it,
      // record as reference-only so the user still sees it listed in
      // the appendix.
      referenceOnly.push({
        ...asset,
        _failure: err?.message ?? 'unknown error',
      })
    }
  }

  if (referenceOnly.length) {
    onProgress({ message: 'Adding linked-attachments appendix…' })
    await appendReferencePage(merged, referenceOnly)
  }

  onProgress({ message: 'Finalising…' })
  return merged.save()
}

// ─── Internals ───────────────────────────────────────────────────────────

function classifyAttachment(asset) {
  const mime = (asset.mimeType ?? '').toLowerCase()
  const name = (asset.filename ?? '').toLowerCase()
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return 'image'
  return 'other'
}

async function fetchAssetBytes(url) {
  // Asset URLs are relative paths served behind the api proxy. Use
  // credentials so cookies / session auth carry over to /api/v1/files.
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

// Render a DOM subtree to a single-PDF Uint8Array via jsPDF.html().
// jsPDF.html() uses html2canvas for layout-to-raster conversion + does
// auto-pagination once `autoPaging:'text'` is set. Returns the raw PDF
// bytes (NOT a jsPDF instance) so we can hand it to pdf-lib for merge.
async function renderHtmlToPdf(domRoot) {
  const doc = new jsPDF({
    unit: 'pt',
    format: 'letter',
    orientation: 'portrait',
  })
  await new Promise((resolve, reject) => {
    doc.html(domRoot, {
      // jsPDF.html() defaults to scaling content to page width; tune
      // margin so the printed body has reasonable whitespace.
      margin: [36, 36, 36, 36],
      // 'text' lets jsPDF cut between lines instead of clipping
      // mid-paragraph at a hard page boundary.
      autoPaging: 'text',
      // html2canvas honours our existing CSS. windowWidth matches the
      // PrintLayout page width so headings/tables aren't reflowed.
      width: 539, // 8.5" - 2*36pt margins, in pt
      windowWidth: 800,
      callback: () => resolve(),
      // Some html2canvas errors come back as rejected promises rather
      // than thrown; defend.
      onError: (err) => reject(err),
    })
  })
  // jsPDF.output('arraybuffer') gives us raw bytes pdf-lib can ingest.
  return new Uint8Array(doc.output('arraybuffer'))
}

// Final appendix listing any attachments we couldn't combine inline
// (Excel/Word/etc.). Drawn directly with pdf-lib primitives — keeps
// the dependency surface small.
async function appendReferencePage(pdfDoc, refs) {
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const page = pdfDoc.addPage()
  const { width, height } = page.getSize()
  const margin = 54

  page.drawText('Linked Attachments', {
    x: margin,
    y: height - margin,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  })
  page.drawText(
    'Attachments below could not be combined into this PDF. They remain available in the QMS:',
    {
      x: margin,
      y: height - margin - 24,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
      maxWidth: width - margin * 2,
    },
  )

  let y = height - margin - 56
  const lineHeight = 14
  for (const r of refs) {
    if (y < margin + 40) break // ran out of room — single appendix page is enough for v1
    page.drawText(`• ${r.filename || '(unnamed)'}`, {
      x: margin,
      y,
      size: 11,
      font: fontBold,
    })
    y -= lineHeight
    if (r.mimeType) {
      page.drawText(`  Type: ${r.mimeType}`, {
        x: margin,
        y,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      })
      y -= lineHeight
    }
    if (r._failure) {
      page.drawText(`  Could not combine: ${r._failure}`, {
        x: margin,
        y,
        size: 9,
        font,
        color: rgb(0.7, 0.2, 0.2),
      })
      y -= lineHeight
    }
    y -= 6
  }
}
