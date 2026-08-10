/**
 * Inspection-report PDF (2026-08-10) — a programmatic jsPDF/autotable version
 * of the InspectionLotPrint view, so the report can be generated WITHOUT user
 * interaction (window.print needs a user gesture) and attached as evidence —
 * e.g. onto the NC spawned from an adverse-disposition lot.
 *
 * Data in, File out: the caller passes what the lot page already has loaded.
 */

/** Roll captured results up per characteristic (mirrors InspectionLotPrint). */
function charRows(characteristics, results) {
  const byChar = {}
  for (const r of results) (byChar[r.characteristicId] ??= []).push(r)
  return characteristics.map((c) => {
    const rs = byChar[c.id] ?? []
    const fail = rs.filter((r) => r.outcome === 'FAIL').length
    const pass = rs.filter((r) => r.outcome === 'PASS').length
    const single = rs.find((r) => (r.sampleIndex ?? 1) === 1) ?? rs[0]
    const value =
      single == null
        ? ''
        : single.valueNumeric != null
          ? String(single.valueNumeric)
          : single.valueText || (single.valueBool != null ? (single.valueBool ? 'Pass' : 'Fail') : '')
    const spec = [
      c.targetValue != null ? `Target ${c.targetValue}` : null,
      c.lsl != null || c.usl != null ? `${c.lsl ?? '−∞'} … ${c.usl ?? '+∞'}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    return {
      name: c.name,
      defectClass: c.defectClass || (c.isCritical ? 'CRITICAL' : ''),
      spec: [spec, c.uom].filter(Boolean).join(' ') || '—',
      result: rs.length > 1 ? `${pass} pass / ${fail} fail (${rs.length} samples)` : value || '—',
      outcome: fail > 0 ? 'FAIL' : rs.length ? 'PASS' : '—',
    }
  })
}

/**
 * @returns {Promise<File>} the report as a PDF file, named after the lot.
 */
export async function generateInspectionLotPdf({
  lot,
  productName,
  supplierName,
  uomName,
  characteristics = [],
  results = [],
}) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableModule.default || autoTableModule.autoTable

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  let y = margin

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.text(`Inspection Report — ${lot.lotNumber ?? ''}`, margin, y)
  y += 10

  const sampling = lot.samplingSnapshot || {}
  const isFormula = sampling.planType === 'FORMULA'
  const quantity =
    lot.quantity != null ? `${lot.quantity}${uomName ? ` ${uomName}` : ''}` : '—'
  const sampleBasis =
    isFormula && lot.containerCount
      ? `${lot.sampleSize ?? '—'} of ${lot.containerCount} containers (√N + 1)`
      : `${lot.sampleSize ?? '—'}${lot.quantity != null ? ` of ${quantity}` : ''}`

  const meta = [
    ['Inspection #', lot.lotNumber ?? '—', 'Status', lot.statusId ?? '—'],
    ['Inspection point', lot.inspectionPoint ?? '—', 'Batch / Lot', lot.batchNumber ?? '—'],
    ['Item', productName ?? '—', 'Supplier', supplierName ?? '—'],
    ['Quantity', quantity, 'Sample', sampleBasis],
    ['Sampling', sampling.name ?? '—', 'PO #', lot.poNumber ?? '—'],
  ]
  autoTable(doc, {
    startY: y + 8,
    margin: { left: margin, right: margin },
    body: meta,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 90 },
      2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 90 },
    },
  })
  y = doc.lastAutoTable.finalY + 16

  // Per-severity Ac/Re (AQL / custom) when present.
  const perSeverity = Array.isArray(sampling.perSeverity) ? sampling.perSeverity : []
  if (perSeverity.length) {
    doc.setFontSize(11)
    doc.text('Acceptance criteria', margin, y)
    autoTable(doc, {
      startY: y + 6,
      margin: { left: margin, right: margin },
      head: [['Defect class', 'AQL %', 'Accept ≤', 'Reject ≥']],
      body: perSeverity.map((p) => [p.severity, p.aql ?? '—', p.accept ?? '—', p.reject ?? '—']),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [235, 235, 235], textColor: 30 },
    })
    y = doc.lastAutoTable.finalY + 16
  }

  // Results per characteristic.
  const rows = charRows(characteristics, results)
  if (rows.length) {
    doc.setFontSize(11)
    doc.text('Results', margin, y)
    autoTable(doc, {
      startY: y + 6,
      margin: { left: margin, right: margin },
      head: [['Test', 'Class', 'Spec', 'Result', 'Outcome']],
      body: rows.map((r) => [r.name, r.defectClass, r.spec, r.result, r.outcome]),
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [235, 235, 235], textColor: 30 },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 4 && data.cell.raw === 'FAIL') {
          data.cell.styles.textColor = [185, 28, 28]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = doc.lastAutoTable.finalY + 16
  }

  if (lot.dispositionNotes) {
    doc.setFontSize(11)
    doc.text('Disposition notes', margin, y)
    doc.setFontSize(9)
    const lines = doc.splitTextToSize(String(lot.dispositionNotes), 515)
    doc.text(lines, margin, y + 14)
  }

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(`Generated ${new Date().toISOString()} — QMS inspection report`, margin, 812)

  const blob = doc.output('blob')
  return new File([blob], `${lot.lotNumber ?? 'inspection'}-report.pdf`, {
    type: 'application/pdf',
  })
}
