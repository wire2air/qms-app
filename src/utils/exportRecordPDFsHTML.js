/**
 * Export records as individual PDF files using HTML rendering approach.
 * Renders DynamicForm as HTML/DOM, captures with html2canvas, and embeds in PDF.
 * Each PDF contains the full form rendered as an image.
 *
 * Requires: jspdf, jszip, html2canvas, vue
 */

import { createApp, h } from 'vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { DateTime } from 'luxon'

/**
 * @param {Array} records   – array of record objects
 * @param {Array} schema    – form template schema
 * @param {String} templateName – template name for filename and header
 */
export async function exportRecordPDFsHTML(records, schema, templateName) {
  const [jsPDFModule, JSZipModule, html2canvas] = await Promise.all([
    import('jspdf'),
    import('jszip'),
    import('html2canvas'),
  ])

  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF
  const JSZip = JSZipModule.default
  const captureCanvas = html2canvas.default || html2canvas

  const zip = new JSZip()

  // Create temporary container for rendering
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '794px' // A4 width in pixels at 96 DPI
  container.style.background = 'white'
  container.style.padding = '40px'
  document.body.appendChild(container)

  try {
    for (const record of records) {
      // Create wrapper with header
      const wrapper = document.createElement('div')
      wrapper.style.fontFamily = 'Inter, sans-serif'
      wrapper.style.fontSize = '14px'
      wrapper.style.lineHeight = '1.5'

      // Header
      const header = document.createElement('div')
      header.style.marginBottom = '24px'
      header.style.borderBottom = '2px solid #e5e7eb'
      header.style.paddingBottom = '16px'

      const title = document.createElement('h1')
      title.style.fontSize = '24px'
      title.style.fontWeight = 'bold'
      title.style.marginBottom = '8px'
      title.style.color = '#111827'
      title.textContent = templateName

      const meta = document.createElement('div')
      meta.style.fontSize = '12px'
      meta.style.color = '#6b7280'

      const metaParts = []
      if (record.recordNumber) metaParts.push(`Record: ${record.recordNumber}`)
      if (record.statusId) metaParts.push(`Status: ${record.statusId}`)
      if (record.user) {
        metaParts.push(`By: ${record.user.firstName} ${record.user.lastName}`)
      }
      if (record.createdAt) {
        metaParts.push(`Date: ${record.createdAt.toLocaleString(DateTime.DATETIME_MED)}`)
      }
      meta.textContent = metaParts.join('   |   ')

      header.appendChild(title)
      header.appendChild(meta)
      wrapper.appendChild(header)

      // Form container
      const formContainer = document.createElement('div')
      formContainer.id = `form-${record.id}`
      wrapper.appendChild(formContainer)

      container.appendChild(wrapper)

      // Mount Vue DynamicForm
      const app = createApp({
        render() {
          return h(DynamicForm, {
            fields: schema,
            modelValue: record.payload || {},
            readonly: true,
          })
        },
      })

      app.mount(formContainer)

      // Wait for Vue to render
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Capture with html2canvas
      const canvas = await captureCanvas(wrapper, {
        scale: 2, // Higher quality
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      })

      // Create PDF
      const imgData = canvas.toDataURL('image/png')
      const imgWidth = 210 // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      const doc = new jsPDF({
        orientation: imgHeight > 297 ? 'portrait' : 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      let heightLeft = imgHeight
      let position = 0

      // Add first page
      doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= 297

      // Add additional pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        doc.addPage()
        doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= 297
      }

      // Add to ZIP
      const pdfBlob = doc.output('blob')
      const safeName = String(record.recordNumber || record.id || 'record').replace(
        /[/\\:*?"<>|]/g,
        '_',
      )
      zip.file(`${safeName}.pdf`, pdfBlob)

      // Cleanup
      app.unmount()
      container.innerHTML = ''
    }

    // Download ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    const dateStr = new Date().toISOString().split('T')[0]
    downloadBlob(zipBlob, `${templateName}_records_${dateStr}.zip`)
  } finally {
    // Remove container
    document.body.removeChild(container)
  }
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function downloadBlob(blob, filename) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
