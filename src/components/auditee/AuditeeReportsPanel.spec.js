import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// AuditeeReportsPanel — the registrar's PDFs, and (in certificateMode) the
// certificate. Three contracts are pinned here:
//
//  1. Upload/register: PDFs only, refused in the browser before any upload;
//     registered as INTERIM (or CERTIFICATE), dated today, title without ".pdf".
//  2. AI gating: the extract button needs canUseAi AND an editable audit. The
//     STORED extraction state (pending → Extracting…/Cancel, completed →
//     Review) renders from the row regardless, which is what lets it survive a
//     reload — and what a non-AI tenant still sees if a marker exists.
//  3. The review dialog seeds each proposal's type from the report's own
//     classification, and "Add selected" carries auditReportId onto every
//     finding it creates.

const post = vi.fn(async () => ({}))
const patch = vi.fn(async () => ({}))
vi.mock('@/api', () => ({ post: (...a) => post(...a), patch: (...a) => patch(...a) }))

const uploadFile = vi.fn(async () => ({ success: true, asset: { id: 'asset-1' } }))
vi.mock('@/composables/useFileUpload.js', () => ({ uploadFile: (...a) => uploadFile(...a) }))
vi.mock('@/composables/usePdfImport.js', () => ({
  parsePdfAndExtractImages: vi.fn(async () => ({ text: 'x'.repeat(80) })),
}))

// A real ref, flipped per test: the template reads `canUseAi` unwrapped, and a
// computed over a plain object would cache its first answer forever.
vi.mock('@/utils/currentSession.js', async () => {
  const { ref: vueRef } = await import('vue')
  return { canUseAi: vueRef(false) }
})
const { canUseAi } = await import('@/utils/currentSession.js')
const aiFlag = {
  set on(v) {
    canUseAi.value = v
  },
}

const toasts = []
vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({
    success: (m) => toasts.push(['success', m]),
    error: (m) => toasts.push(['error', m]),
    warning: (m) => toasts.push(['warning', m]),
    info: (m) => toasts.push(['info', m]),
  }),
}))

let reportRows = []
let findingRows = []
function chain(rowsFn) {
  const q = { orderBy: () => q, exec: async () => rowsFn() }
  return q
}
vi.mock('@models/index', () => ({
  db: {
    AuditReport: { where: () => chain(() => reportRows) },
    AuditFinding: { where: () => chain(() => findingRows) },
    User: { where: () => chain(() => [{ id: 'u-1', firstName: 'Aaron', lastName: 'Author' }]) },
    Asset: { findByPk: async (id) => ({ id, url: `/api/v1/files/c/${id}.pdf` }) },
  },
}))

const AuditeeReportsPanel = (await import('./AuditeeReportsPanel.vue')).default

const stubs = {
  BaseButton: {
    props: ['variant', 'size', 'disabled', 'isLoading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  BaseInlineSelect: {
    name: 'BaseInlineSelect',
    props: ['modelValue', 'items', 'required'],
    emits: ['update:modelValue'],
    template: `<select class="inline-select" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="i in items" :key="i.id" :value="i.id">{{ i.name }}</option>
    </select>`,
  },
  BaseBadge: { template: '<span class="badge"><slot /></span>' },
  BaseText: { template: '<span><slot /></span>' },
  BaseTextarea: { props: ['modelValue'], template: '<textarea :value="modelValue" />' },
  BaseDialog: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" class="dialog"><slot /><slot name="footer" /></div>',
  },
}

const AUDIT = { id: 'aud-1', displayMeta: {} }

async function mountPanel(props = {}) {
  const w = mount(AuditeeReportsPanel, {
    props: { auditInstance: AUDIT, readonly: false, certificateMode: false, ...props },
    global: { stubs },
  })
  await flushPromises()
  await flushPromises()
  return w
}

function report(overrides = {}) {
  return {
    id: 'r-1',
    assetId: 'asset-r1',
    title: 'Stage 2 Report',
    kind: 'INTERIM',
    reportDate: null,
    uploadedBy: 'u-1',
    notes: null,
    aiParsedAt: null,
    aiExtraction: null,
    ...overrides,
  }
}

/** Put `file` on the upload input and fire change, as the picker would. */
async function pick(w, file) {
  const input = w.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}
function buttons(w, re) {
  return w.findAll('button').filter((b) => re.test(b.text()))
}

beforeEach(() => {
  aiFlag.on = false
  reportRows = []
  findingRows = []
  toasts.length = 0
  post.mockReset()
  post.mockResolvedValue({})
  patch.mockReset()
  patch.mockResolvedValue({})
  uploadFile.mockClear()
})

describe('AuditeeReportsPanel — empty states and the upload affordance', () => {
  it('reports mode: tells the user to upload the auditing body’s report', async () => {
    const w = await mountPanel()
    expect(w.text()).toContain('No auditor reports uploaded yet.')
    expect(buttons(w, /^Upload report PDF$/)).toHaveLength(1)
  })

  it('certificate mode: its own copy and its own button label', async () => {
    const w = await mountPanel({ certificateMode: true })
    expect(w.text()).toContain('No certificate uploaded yet.')
    expect(buttons(w, /^Upload certificate$/)).toHaveLength(1)
  })

  it.each([false, true])('read-only (certificateMode=%s): no uploader at all', async (certificateMode) => {
    const w = await mountPanel({ readonly: true, certificateMode })
    expect(buttons(w, /Upload/)).toHaveLength(0)
    expect(w.find('input[type="file"]').exists()).toBe(false)
  })
})

describe('AuditeeReportsPanel — registering a PDF', () => {
  it('refuses a non-PDF before uploading anything', async () => {
    const w = await mountPanel()
    await pick(w, new File(['nope'], 'notes.txt', { type: 'text/plain' }))
    expect(toasts).toContainEqual(['error', 'Auditor reports are PDFs.'])
    expect(uploadFile).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('certificate mode refuses with its own wording', async () => {
    const w = await mountPanel({ certificateMode: true })
    await pick(w, new File(['nope'], 'cert.png', { type: 'image/png' }))
    expect(toasts).toContainEqual(['error', 'Certificates are PDFs.'])
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('registers a report as INTERIM, dated today, titled without the extension', async () => {
    const w = await mountPanel()
    await pick(w, new File(['%PDF'], 'Stage 2 Report.PDF', { type: 'application/pdf' }))
    expect(uploadFile).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      '/v1/services/auditInstances/aud-1/reports',
      {
        assetId: 'asset-1',
        title: 'Stage 2 Report',
        kind: 'INTERIM',
        reportDate: new Date().toISOString().slice(0, 10),
      },
      { showError: true },
    )
    expect(toasts).toContainEqual(['success', 'Report uploaded.'])
  })

  it('registers a certificate as kind CERTIFICATE', async () => {
    const w = await mountPanel({ certificateMode: true })
    await pick(w, new File(['%PDF'], 'ISO cert.pdf', { type: 'application/pdf' }))
    expect(post.mock.calls[0][1]).toMatchObject({ kind: 'CERTIFICATE', title: 'ISO cert' })
    expect(toasts).toContainEqual(['success', 'Certificate uploaded.'])
  })

  it('a failed upload claims no success and registers nothing', async () => {
    uploadFile.mockResolvedValueOnce({ success: false, error: 'Upload failed' })
    const w = await mountPanel()
    await pick(w, new File(['%PDF'], 'r.pdf', { type: 'application/pdf' }))
    expect(post).not.toHaveBeenCalled()
    expect(toasts).toContainEqual(['error', 'Upload failed'])
  })
})

describe('AuditeeReportsPanel — the register rows', () => {
  it('lists only its own kind: reports mode hides certificates and vice versa', async () => {
    reportRows = [report(), report({ id: 'c-1', title: 'ISO cert', kind: 'CERTIFICATE' })]
    let w = await mountPanel()
    expect(w.text()).toContain('Stage 2 Report')
    expect(w.text()).not.toContain('ISO cert')
    w = await mountPanel({ certificateMode: true })
    expect(w.text()).toContain('ISO cert')
    expect(w.text()).not.toContain('Stage 2 Report')
  })

  it('an editable report gets the Interim/Final picker; changing it PATCHes the kind', async () => {
    reportRows = [report()]
    const w = await mountPanel()
    const select = w.find('select.inline-select')
    await select.setValue('FINAL')
    await flushPromises()
    expect(patch).toHaveBeenCalledWith(
      '/v1/services/auditInstances/aud-1/reports/r-1',
      { kind: 'FINAL' },
      { showError: true },
    )
  })

  it('read-only and certificate rows show a static kind badge instead', async () => {
    reportRows = [report({ kind: 'FINAL' })]
    let w = await mountPanel({ readonly: true })
    expect(w.find('select.inline-select').exists()).toBe(false)
    expect(w.findAll('.badge').map((b) => b.text())).toContain('FINAL')

    reportRows = [report({ id: 'c-1', kind: 'CERTIFICATE' })]
    w = await mountPanel({ certificateMode: true })
    expect(w.find('select.inline-select').exists()).toBe(false)
    expect(w.findAll('.badge').map((b) => b.text())).toContain('CERTIFICATE')
  })

  it('counts findings per report, excluding cancelled ones and splitting out OFIs', async () => {
    reportRows = [report()]
    findingRows = [
      { auditReportId: 'r-1', findingTypeId: 'MINOR_NC', statusId: 'OPEN' },
      { auditReportId: 'r-1', findingTypeId: 'MAJOR_NC', statusId: 'CLOSED' },
      { auditReportId: 'r-1', findingTypeId: 'OFI', statusId: 'OPEN' },
      { auditReportId: 'r-1', findingTypeId: 'MAJOR_NC', statusId: 'CANCELLED' },
      { auditReportId: null, findingTypeId: 'MINOR_NC', statusId: 'OPEN' },
    ]
    const w = await mountPanel()
    const text = w.text().replace(/\s+/g, ' ')
    expect(text).toContain('2 findings')
    expect(text).toContain('1 OFI')
  })

  it('an accepted summary renders under its row', async () => {
    reportRows = [report({ notes: 'One minor NC on calibration labels.' })]
    const w = await mountPanel()
    expect(w.text()).toContain('One minor NC on calibration labels.')
  })

  it('the jump buttons emit with the report id', async () => {
    reportRows = [report()]
    const w = await mountPanel()
    await buttons(w, /^Findings$/)[0].trigger('click')
    await buttons(w, /^OFI$/)[0].trigger('click')
    await buttons(w, /^Summary$/)[0].trigger('click')
    expect(w.emitted('goFindings')[0]).toEqual(['r-1'])
    expect(w.emitted('goOfi')[0]).toEqual(['r-1'])
    expect(w.emitted('goSummary')[0]).toEqual(['r-1'])
  })
})

describe('AuditeeReportsPanel — AI extraction gating (no model involved)', () => {
  it('a non-AI tenant sees no extract button — the degraded path', async () => {
    reportRows = [report()]
    const w = await mountPanel()
    expect(buttons(w, /AI Extract|Re-extract/)).toHaveLength(0)
  })

  it('an AI tenant sees "AI Extract", or "Re-extract" once parsed — but never on a read-only audit', async () => {
    aiFlag.on = true
    reportRows = [report(), report({ id: 'r-2', title: 'Parsed', aiParsedAt: '2026-09-01T00:00:00Z' })]
    let w = await mountPanel()
    expect(buttons(w, /^AI Extract$/)).toHaveLength(1)
    expect(buttons(w, /^Re-extract$/)).toHaveLength(1)
    w = await mountPanel({ readonly: true })
    expect(buttons(w, /AI Extract|Re-extract/)).toHaveLength(0)
  })

  it('certificates never offer extraction', async () => {
    aiFlag.on = true
    reportRows = [report({ kind: 'CERTIFICATE' })]
    const w = await mountPanel({ certificateMode: true })
    expect(buttons(w, /AI Extract|Re-extract|Summary|Findings/)).toHaveLength(0)
  })

  it('a pending marker renders Extracting… + Cancel from the ROW, even on a non-AI tenant', async () => {
    reportRows = [report({ aiExtraction: { pending: true, requestedAt: '2026-09-14T10:00:00.000Z' } })]
    const w = await mountPanel()
    const extracting = buttons(w, /Extracting/)
    expect(extracting).toHaveLength(1)
    expect(extracting[0].attributes('disabled')).toBeDefined()
    const cancel = buttons(w, /^Cancel$/)
    expect(cancel).toHaveLength(1)
    await cancel[0].trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith(
      '/v1/services/auditInstances/aud-1/reports/r-1/extract/cancel',
      {},
      { showError: true },
    )
  })

  it('a read-only viewer sees the pending state but cannot cancel it', async () => {
    reportRows = [report({ aiExtraction: { pending: true } })]
    const w = await mountPanel({ readonly: true })
    expect(buttons(w, /Extracting/)).toHaveLength(1)
    expect(buttons(w, /^Cancel$/)).toHaveLength(0)
  })

  it('a completed extraction offers Review (N); a failed one does not', async () => {
    reportRows = [
      report({ aiExtraction: { completedAt: '2026-09-14T10:00:00Z', findings: [{}, {}], summary: 's' } }),
      report({ id: 'r-2', title: 'Failed', aiExtraction: { completedAt: '2026-09-14T10:00:00Z', failed: true, error: 'x' } }),
    ]
    const w = await mountPanel()
    expect(buttons(w, /^Review \(2\)$/)).toHaveLength(1)
    expect(buttons(w, /^Review/)).toHaveLength(1)
  })
})

describe('AuditeeReportsPanel — the review dialog (stored extraction → findings)', () => {
  const stored = {
    completedAt: '2026-09-14T10:00:00Z',
    summary: 'Two nonconformities and one opportunity.',
    caveats: ['Page 7 was an image.'],
    findings: [
      { title: 'Calibration', description: 'Gauges unlabelled', clauseRef: '7.1.5', classification: 'Major nonconformity' },
      { title: 'Training', description: 'Matrix stale', clauseRef: '7.2', classification: 'Minor NC' },
      { title: 'Checklists', description: 'Go digital', classification: 'Opportunity for improvement' },
      { title: 'Nonconformity', description: 'Unclassified wording', classification: 'Nonconformity' },
      { title: 'Note', description: 'Housekeeping', classification: '' },
    ],
  }

  async function openReview() {
    reportRows = [report({ aiExtraction: stored })]
    const w = await mountPanel()
    await buttons(w, /^Review \(5\)$/)[0].trigger('click')
    await flushPromises()
    return w
  }

  it('seeds each proposal’s type from the report’s own classification', async () => {
    const w = await openReview()
    const dialog = w.find('.dialog')
    expect(dialog.exists()).toBe(true)
    const types = dialog.findAll('select.inline-select').map((s) => s.element.value)
    expect(types).toEqual(['MAJOR_NC', 'MINOR_NC', 'OFI', 'MINOR_NC', 'OBSERVATION'])
    expect(dialog.text()).toContain('Page 7 was an image.')
  })

  it('"Accept summary" PATCHes the report notes', async () => {
    const w = await openReview()
    await buttons(w.find('.dialog'), /Accept summary/)[0].trigger('click')
    await flushPromises()
    expect(patch).toHaveBeenCalledWith(
      '/v1/services/auditInstances/aud-1/reports/r-1',
      { notes: 'Two nonconformities and one opportunity.' },
      { showError: true },
    )
  })

  it('"Add selected" creates each finding with auditReportId and the clause prefix', async () => {
    post.mockImplementation(async (url) =>
      url === '/v1/services/auditFindings' ? { finding: { findingNumber: 'FND-1' } } : {},
    )
    const w = await openReview()
    await buttons(w.find('.dialog'), /^Add selected \(5\)$/)[0].trigger('click')
    await flushPromises()
    const creates = post.mock.calls.filter(([u]) => u === '/v1/services/auditFindings')
    expect(creates).toHaveLength(5)
    expect(creates[0][1]).toEqual({
      auditInstanceId: 'aud-1',
      auditReportId: 'r-1',
      findingTypeId: 'MAJOR_NC',
      description: '[7.1.5] Calibration — Gauges unlabelled',
    })
    expect(creates[2][1]).toMatchObject({ findingTypeId: 'OFI', description: 'Checklists — Go digital' })
    expect(toasts).toContainEqual(['success', '5 findings added to this audit.'])
    expect(w.find('.dialog').text()).toContain('Added FND-1')
  })
})

void ref
