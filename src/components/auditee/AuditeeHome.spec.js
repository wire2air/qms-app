import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'

// AuditeeHome — the /auditee register. Two rules live here and nowhere else:
// the list is EXTERNAL audits only (the table is shared with the auditor
// module, whose own list filters EXTERNAL *out*), and the create action is
// gated on audit_management:create while the page itself is not gated at all.

const push = vi.fn()
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => ({ push }),
}))

let granted = []
vi.mock('@/utils/currentSession.js', () => ({
  isAllowed: (needed) => needed.every((p) => granted.includes(p)),
}))

let auditRows = []
let standardRows = []
vi.mock('@models/index', () => ({
  db: {
    AuditInstance: { where: () => ({ exec: async () => auditRows }) },
    AuditStandard: { where: () => ({ exec: async () => standardRows }) },
  },
}))

const AuditeeHome = (await import('./AuditeeHome.vue')).default

const DataTableStub = {
  name: 'DataTable',
  props: ['rows', 'columns', 'rowKey', 'loading', 'noDataLabel'],
  emits: ['rowClick'],
  template: `<div class="table" :data-empty="noDataLabel">
    <div v-for="r in rows" :key="r.id" class="row" :data-id="r.id" @click="$emit('rowClick', r)">
      {{ r.auditNumber }}
      <slot name="body-cell-firm" :row="r" />
      <slot name="body-cell-standard" :row="r" />
    </div>
  </div>`,
}

function mountHome() {
  return mount(AuditeeHome, {
    global: {
      stubs: {
        BasePage: { template: '<div><slot /></div>' },
        PageHeader: { template: '<div><slot name="title" /><slot name="actions" /></div>' },
        HelpButton: true,
        DataTable: DataTableStub,
        AuditeeCreateDialog: { name: 'AuditeeCreateDialog', props: ['modelValue'], template: '<div />' },
        AuditInstanceStatusBadgeById: true,
        BaseButton: {
          name: 'BaseButton',
          emits: ['click'],
          template: '<button @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
}

function audit(id, programTypeId, { scheduled = null, created = '2026-01-01', ...rest } = {}) {
  return {
    id,
    auditNumber: id.toUpperCase(),
    programTypeId,
    scheduledDate: scheduled ? DateTime.fromISO(scheduled) : null,
    createdAt: DateTime.fromISO(created),
    ...rest,
  }
}

beforeEach(() => {
  push.mockClear()
  granted = []
  standardRows = []
  auditRows = []
})

describe('AuditeeHome — the certification-audit register', () => {
  it('lists EXTERNAL audits only — never the INTERNAL or SUPPLIER rows beside them', async () => {
    auditRows = [
      audit('int-1', 'INTERNAL', { scheduled: '2026-05-01' }),
      audit('ext-1', 'EXTERNAL', { scheduled: '2026-03-01' }),
      audit('sup-1', 'SUPPLIER', { scheduled: '2026-04-01' }),
      audit('ext-2', 'EXTERNAL', { scheduled: '2026-06-01' }),
    ]
    const w = mountHome()
    await flushPromises()
    const ids = w.findAll('.row').map((r) => r.attributes('data-id'))
    expect(ids).toEqual(['ext-2', 'ext-1'])
  })

  it('sorts by scheduled date, newest first, falling back to created date', async () => {
    auditRows = [
      audit('ext-old', 'EXTERNAL', { scheduled: '2026-01-10' }),
      audit('ext-unscheduled', 'EXTERNAL', { created: '2026-02-01' }),
      audit('ext-new', 'EXTERNAL', { scheduled: '2026-03-10' }),
    ]
    const w = mountHome()
    await flushPromises()
    expect(w.findAll('.row').map((r) => r.attributes('data-id'))).toEqual([
      'ext-new',
      'ext-unscheduled',
      'ext-old',
    ])
  })

  it('renders the auditing body as "firm · auditor", and "—" without one', async () => {
    auditRows = [
      audit('ext-a', 'EXTERNAL', {
        scheduled: '2026-03-01',
        externalAuditFirm: 'BSI',
        externalAuditorName: 'Rhoda',
      }),
      audit('ext-b', 'EXTERNAL', { scheduled: '2026-02-01' }),
    ]
    const w = mountHome()
    await flushPromises()
    const [a, b] = w.findAll('.row')
    expect(a.text()).toContain('BSI')
    expect(a.text()).toContain('· Rhoda')
    expect(b.text()).toContain('—')
  })

  it('resolves the optional standard to its name', async () => {
    standardRows = [{ id: 'std-1', name: 'ISO 13485:2016' }]
    auditRows = [audit('ext-a', 'EXTERNAL', { scheduled: '2026-03-01', auditStandardId: 'std-1' })]
    const w = mountHome()
    await flushPromises()
    expect(w.find('.row').text()).toContain('ISO 13485:2016')
  })

  it('offers "New External Audit" only with audit_management:create', async () => {
    let w = mountHome()
    await flushPromises()
    expect(w.text()).not.toContain('New External Audit')

    granted = ['audit_management:read', 'audit_management:update']
    w = mountHome()
    await flushPromises()
    expect(w.text(), 'update without create is not enough').not.toContain('New External Audit')

    granted = ['audit_management:create']
    w = mountHome()
    await flushPromises()
    expect(w.text()).toContain('New External Audit')
  })

  it('opens the dialog from the action and routes a row click to /auditee/:id', async () => {
    granted = ['audit_management:create']
    auditRows = [audit('ext-1', 'EXTERNAL', { scheduled: '2026-03-01' })]
    const w = mountHome()
    await flushPromises()
    await w.find('button').trigger('click')
    expect(w.findComponent({ name: 'AuditeeCreateDialog' }).props('modelValue')).toBe(true)

    await w.find('.row').trigger('click')
    expect(push).toHaveBeenCalledWith('/auditee/ext-1')
  })

  it('carries the empty-state copy the table shows when nothing is listed', async () => {
    const w = mountHome()
    await flushPromises()
    expect(w.find('.table').attributes('data-empty')).toMatch(/^No external audits yet\./)
    expect(w.findAll('.row')).toHaveLength(0)
  })
})
