import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'
// The app installs DateTime#formatDate at boot; the page calls it in its meta line.
import '@/extensions/datetime.js'

// AuditeeAuditPageId — the certification-audit detail page. Everything that
// decides what a user may DO here is one computed:
//
//   isEditable = canUpdate && !['CLOSED','CANCELLED'].includes(statusId)
//
// It drives the three lifecycle actions, every inline field, the Reports /
// Findings / OFI panels and — the one the KB article trips over — the
// Certificate uploader (auditee pack 19 risk 5: no certificate after close).
// The Share panel is the deliberate exception: it follows canUpdate alone.
// These tests pin that matrix, the PATCH each action sends, and the Our People
// rail (Lead POC first, never removable).

const patch = vi.fn(async () => ({}))
const post = vi.fn(async () => ({}))
const del = vi.fn(async () => ({}))
vi.mock('@/api', () => ({
  patch: (...a) => patch(...a),
  post: (...a) => post(...a),
  del: (...a) => del(...a),
}))
vi.mock('@/composables/useFileUpload.js', () => ({ uploadFile: vi.fn() }))

let granted = []
vi.mock('@/utils/currentSession.js', () => ({
  isAllowed: (needed) => needed.every((p) => granted.includes(p)),
}))

const toasts = []
vi.mock('@shared/composables/useToast.js', () => ({
  useToast: () => ({
    success: (m) => toasts.push(['success', m]),
    error: (m) => toasts.push(['error', m]),
    warning: (m) => toasts.push(['warning', m]),
    info: (m) => toasts.push(['info', m]),
  }),
}))

let instance = null
let reportRows = []
let teamRows = []
function chain(rowsFn) {
  const q = { orderBy: () => q, exec: async () => rowsFn() }
  return q
}
vi.mock('@models/index', () => ({
  db: {
    AuditInstance: { findByPk: async () => instance },
    AuditReport: { where: () => chain(() => reportRows) },
    AuditTeamMember: { where: () => chain(() => teamRows) },
    AuditStandard: { findByPk: async () => null },
    Asset: { findByPk: async () => null },
  },
}))

const AuditeeAuditPageId = (await import('./AuditeeAuditPageId.vue')).default

// ── Stubs ───────────────────────────────────────────────────────────────────
// BaseDetailLayout is replaced by a shell that renders every named slot, so
// the page's own slot content is what is under test.
const LayoutStub = {
  name: 'BaseDetailLayout',
  props: ['config', 'record', 'loading', 'notFound', 'notFoundTitle', 'tab'],
  template: `<div class="layout" :data-not-found="String(!!notFound)">
    <slot name="title" /><slot name="status" /><slot name="meta" />
    <div v-for="t in (config?.tabs || [])" :key="t.value" :data-tab="t.value">
      <slot :name="'tab-' + t.value" />
    </div>
    <slot name="rail" />
  </div>`,
}
function panelStub(name, cls) {
  return {
    name,
    props: ['auditInstance', 'readonly', 'certificateMode', 'typeFilter', 'defaultTypeId', 'reportFilter'],
    template: `<div class="${cls}" :data-readonly="String(readonly)" :data-cert="String(!!certificateMode)"
      :data-types="(typeFilter || []).join(',')" :data-default="defaultTypeId || ''" />`,
  }
}
const stubs = {
  BaseDetailLayout: LayoutStub,
  AuditeeReportsPanel: panelStub('AuditeeReportsPanel', 'reports-panel'),
  AuditFindingsPanel: panelStub('AuditFindingsPanel', 'findings-panel'),
  AuditeeSharePanel: panelStub('AuditeeSharePanel', 'share-panel'),
  AuditReadinessDashboard: true,
  HelpButton: true,
  AuditInstanceStatusBadgeById: true,
  SiteBadgeById: true,
  FormSection: { props: ['title', 'icon'], template: '<section><slot /></section>' },
  BaseRailCard: {
    props: ['title', 'icon', 'grid'],
    template: '<div class="rail-card" :data-title="title"><slot /></div>',
  },
  BaseDetailField: {
    props: ['label', 'value'],
    template: '<div class="detail-field" :data-label="label">{{ value }}<slot /></div>',
  },
  BaseRichTextEditor: {
    props: ['modelValue', 'editable', 'placeholder'],
    template: '<div class="rte" :data-editable="String(editable)" />',
  },
  BaseTextInput: {
    props: ['modelValue', 'placeholder', 'type', 'size'],
    template: '<input class="text-input" :placeholder="placeholder" />',
  },
  BaseTextarea: { props: ['modelValue', 'placeholder'], template: '<textarea :placeholder="placeholder" />' },
  BaseLabel: { template: '<label><slot /></label>' },
  BaseText: { template: '<span><slot /></span>' },
  BaseBadge: { template: '<span class="badge"><slot /></span>' },
  BaseButton: {
    props: ['variant', 'size', 'disabled', 'isLoading'],
    emits: ['click'],
    template: '<button class="base-button" @click="$emit(\'click\')"><slot /></button>',
  },
  BaseDialog: { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="dialog"><slot /></div>' },
  UserBadgeById: {
    props: ['userId'],
    template: '<span class="user-badge" :data-user="userId" />',
  },
  UserSelectMenu: { props: ['modelValue'], template: '<div class="user-select" />' },
}

function makeInstance(overrides = {}) {
  return {
    id: 'aud-1',
    auditNumber: 'AUD-0900',
    programTypeId: 'EXTERNAL',
    statusId: 'OPEN',
    executionPhase: 'IN_PROGRESS',
    scheduledDate: DateTime.fromISO('2026-09-20'),
    externalAuditFirm: 'E2E Registrar Ltd',
    externalAuditorName: 'Rhoda Registrar',
    externalAuditorEmail: 'rhoda@registrar.test',
    externalAuditorPhone: '+1 555 0100',
    agenda: null,
    scope: '<p>scope</p>',
    objectives: null,
    ...overrides,
  }
}

async function mountPage() {
  const w = mount(AuditeeAuditPageId, { props: { id: 'aud-1' }, global: { stubs } })
  await flushPromises()
  await flushPromises()
  return w
}
function config(w) {
  return w.findComponent({ name: 'BaseDetailLayout' }).props('config')
}
function action(w, id) {
  return config(w).actions.find((a) => a.id === id)
}
function certificatePanel(w) {
  return w.find('.reports-panel[data-cert="true"]')
}

beforeEach(() => {
  granted = ['audit_management:read', 'audit_management:update']
  instance = makeInstance()
  reportRows = []
  teamRows = []
  toasts.length = 0
  patch.mockReset()
  patch.mockResolvedValue({})
  del.mockClear()
})

describe('AuditeeAuditPageId — the certificate upload gate (isEditable)', () => {
  const cases = [
    // [permissions, statusId, expected readonly]
    [['audit_management:update'], 'OPEN', false],
    [['audit_management:update'], 'DRAFT', false],
    [['audit_management:update'], 'CLOSED', true],
    [['audit_management:update'], 'CANCELLED', true],
    [['audit_management:read'], 'OPEN', true],
  ]
  it.each(cases)('perms %j + status %s → certificate panel readonly=%s', async (perms, statusId, ro) => {
    granted = perms
    instance = makeInstance({ statusId })
    const w = await mountPage()
    expect(certificatePanel(w).exists()).toBe(true)
    expect(certificatePanel(w).attributes('data-readonly')).toBe(String(ro))
    // The Reports register and both findings panels ride the same flag.
    expect(w.find('.reports-panel[data-cert="false"]').attributes('data-readonly')).toBe(String(ro))
    for (const p of w.findAll('.findings-panel')) {
      expect(p.attributes('data-readonly')).toBe(String(ro))
    }
  })

  it('the Share panel follows canUpdate alone — an updater can still share a CLOSED audit', async () => {
    instance = makeInstance({ statusId: 'CLOSED', executionPhase: 'COMPLETE' })
    let w = await mountPage()
    expect(w.find('.share-panel').attributes('data-readonly')).toBe('false')

    granted = ['audit_management:read']
    w = await mountPage()
    expect(w.find('.share-panel').attributes('data-readonly')).toBe('true')
  })
})

describe('AuditeeAuditPageId — lifecycle actions', () => {
  it('scheduled: Start + Cancel, no Mark Completed', async () => {
    instance = makeInstance({ executionPhase: 'SCHEDULED' })
    const w = await mountPage()
    expect(action(w, 'start').visible).toBe(true)
    expect(action(w, 'complete').visible).toBe(false)
    expect(action(w, 'cancel').visible).toBe(true)
  })

  it('in fieldwork: Mark Completed + Cancel, no Start', async () => {
    const w = await mountPage()
    expect(action(w, 'start').visible).toBe(false)
    expect(action(w, 'complete').visible).toBe(true)
    expect(action(w, 'cancel').visible).toBe(true)
  })

  it.each(['CLOSED', 'CANCELLED'])('%s: no action at all', async (statusId) => {
    instance = makeInstance({ statusId, executionPhase: 'COMPLETE' })
    const w = await mountPage()
    for (const id of ['start', 'complete', 'cancel']) expect(action(w, id).visible).toBe(false)
  })

  it('a read-only user gets no action in any state', async () => {
    granted = ['audit_management:read']
    for (const executionPhase of ['SCHEDULED', 'IN_PROGRESS']) {
      instance = makeInstance({ executionPhase })
      const w = await mountPage()
      for (const id of ['start', 'complete', 'cancel']) expect(action(w, id).visible).toBe(false)
    }
  })

  it('Start keeps the status OPEN and moves the phase; Mark Completed sends CLOSED only', async () => {
    instance = makeInstance({ executionPhase: 'SCHEDULED' })
    let w = await mountPage()
    await action(w, 'start').onSelect()
    await flushPromises()
    expect(patch).toHaveBeenCalledWith('/v1/services/auditInstances/aud-1', {
      statusId: 'OPEN',
      executionPhase: 'IN_PROGRESS',
    })

    patch.mockClear()
    instance = makeInstance()
    w = await mountPage()
    await action(w, 'complete').onSelect()
    await flushPromises()
    // No executionPhase: the server's certCompletion branch sets COMPLETE.
    expect(patch).toHaveBeenCalledWith('/v1/services/auditInstances/aud-1', { statusId: 'CLOSED' })
    expect(toasts).toContainEqual(['success', 'Audit completed'])
  })

  it('a refused completion shows the server’s reason and claims no success', async () => {
    const msg =
      'Cannot complete — 1 finding(s) are still open. Close (or cancel) them first; findings close when their CAPAs do.'
    patch.mockRejectedValue(new Error(msg))
    const w = await mountPage()
    await action(w, 'complete').onSelect()
    await flushPromises()
    expect(toasts).toContainEqual(['error', msg])
    expect(toasts.some(([t]) => t === 'success')).toBe(false)
  })

  it('Cancel opens a confirmation first and only then PATCHes CANCELLED', async () => {
    const w = await mountPage()
    await action(w, 'cancel').onSelect()
    await flushPromises()
    expect(patch).not.toHaveBeenCalled()
    const dialog = w.find('.dialog')
    expect(dialog.text()).toContain('Findings and reports already recorded stay on file')
    await dialog.findAll('button').find((b) => b.text() === 'Cancel audit').trigger('click')
    await flushPromises()
    expect(patch).toHaveBeenCalledWith('/v1/services/auditInstances/aud-1', { statusId: 'CANCELLED' })
  })
})

describe('AuditeeAuditPageId — tabs', () => {
  it('carries Share / Reports / Summary / Findings / OFI / Certificate and no requirements walkthrough', async () => {
    const w = await mountPage()
    const tabs = config(w).tabs.map((t) => t.value)
    expect(tabs).toEqual(
      expect.arrayContaining(['info', 'readiness', 'share', 'reports', 'summary', 'findings', 'ofi', 'certificate']),
    )
    expect(tabs.some((t) => /requirement/i.test(t))).toBe(false)
  })

  it('Findings excludes OFIs; the OFI tab shows only OFIs and creates them', async () => {
    const w = await mountPage()
    const [findings, ofi] = w.findAll('.findings-panel')
    expect(findings.attributes('data-types')).toBe('MAJOR_NC,MINOR_NC,OBSERVATION')
    expect(ofi.attributes('data-types')).toBe('OFI')
    expect(ofi.attributes('data-default')).toBe('OFI')
  })

  it('Summary lists reports, not certificates — a certificate alone leaves the empty state', async () => {
    reportRows = [{ id: 'c1', kind: 'CERTIFICATE', title: 'ISO certificate', notes: null }]
    let w = await mountPage()
    expect(w.find('[data-tab="summary"]').text()).toContain('No reports yet')

    reportRows = [
      { id: 'r1', kind: 'FINAL', title: 'Stage 2 report', notes: 'All good', reportDate: null },
      { id: 'c1', kind: 'CERTIFICATE', title: 'ISO certificate', notes: null },
    ]
    w = await mountPage()
    const summary = w.find('[data-tab="summary"]')
    expect(summary.text()).toContain('Stage 2 report')
    expect(summary.text()).not.toContain('ISO certificate')
  })

  it('renders "not found" for a record RLS does not release', async () => {
    instance = null
    const w = await mountPage()
    expect(w.find('.layout').attributes('data-not-found')).toBe('true')
  })
})

describe('AuditeeAuditPageId — rails', () => {
  it('Our People: Lead POC first with its chip, never removable; TEAM removable only while editable', async () => {
    teamRows = [
      { id: 'm-team', userId: 'u-team', roleOnAudit: 'TEAM', createdAt: DateTime.fromISO('2026-01-01') },
      { id: 'm-lead', userId: 'u-lead', roleOnAudit: 'LEAD', createdAt: DateTime.fromISO('2026-02-01') },
    ]
    let w = await mountPage()
    const people = w.find('.rail-card[data-title="Our People"]')
    expect(people.findAll('.user-badge').map((b) => b.attributes('data-user'))).toEqual([
      'u-lead',
      'u-team',
    ])
    expect(people.findAll('.badge').filter((b) => b.text() === 'Lead POC')).toHaveLength(1)
    const removers = people.findAll('button[aria-label="Remove person"]')
    expect(removers, 'only the TEAM member can be removed').toHaveLength(1)
    await removers[0].trigger('click')
    await flushPromises()
    expect(del).toHaveBeenCalledWith('/v1/services/auditInstances/aud-1/team/m-team')

    instance = makeInstance({ statusId: 'CLOSED', executionPhase: 'COMPLETE' })
    w = await mountPage()
    expect(w.find('.rail-card[data-title="Our People"]').findAll('button[aria-label="Remove person"]')).toHaveLength(0)
    expect(w.find('.user-select').exists(), 'no picker once terminal').toBe(false)
  })

  it('Our People with nobody on it says so', async () => {
    const w = await mountPage()
    expect(w.find('.rail-card[data-title="Our People"]').text()).toContain('No one assigned yet.')
  })

  it('Auditing Body: inputs while editable; text and a mailto link once read-only', async () => {
    let w = await mountPage()
    const body = () => w.find('.rail-card[data-title="Auditing Body"]')
    expect(body().findAll('input.text-input').length).toBe(4)

    instance = makeInstance({ statusId: 'CLOSED', executionPhase: 'COMPLETE' })
    w = await mountPage()
    expect(body().findAll('input.text-input')).toHaveLength(0)
    expect(body().text()).toContain('E2E Registrar Ltd')
    expect(body().find('a[href="mailto:rhoda@registrar.test"]').exists()).toBe(true)
  })

  it('read-only agenda: notes as text, no uploader, no textarea', async () => {
    granted = ['audit_management:read']
    instance = makeInstance({ agenda: { notes: 'Opening meeting 09:00' } })
    const w = await mountPage()
    const info = w.find('[data-tab="info"]')
    expect(info.text()).toContain('Opening meeting 09:00')
    expect(info.find('textarea').exists()).toBe(false)
    expect(info.text()).not.toContain('Upload agenda')
  })
})
