import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import { useToast } from '@shared/composables/useToast.js'

/**
 * One share, in full — who holds it, what it exposes, every time it was opened,
 * and the button that ends it.
 *
 * Withdrawal is irreversible (restoring access means minting a new link), so
 * the dialog makes it two clicks and names the person on the first; and it is
 * offered only while the link is ACTIVE — "withdraw" on a link that is already
 * dead would report an action that changed nothing.
 */

let items = []
let views = []
const records = {}
vi.mock('@models/index', () => ({
  db: {
    RecordShareLinkItem: { name: 'RecordShareLinkItem', where: () => ({ exec: async () => items }) },
    RecordShareLinkView: {
      name: 'RecordShareLinkView',
      where: () => ({ orderBy: () => ({ exec: async () => views }) }),
    },
    Document: { name: 'Document', findByPk: async (id) => records[id] ?? null },
    Nonconformance: { name: 'Nonconformance', findByPk: async (id) => records[id] ?? null },
  },
}))

const post = vi.fn()
vi.mock('@/api', () => ({ post: (...args) => post(...args) }))

const SharedRecordDetailDialog = (await import('./SharedRecordDetailDialog.vue')).default

const stubs = {
  BaseDialog: {
    props: ['modelValue', 'title', 'size'],
    emits: ['update:modelValue'],
    template: '<div><h3>{{ title }}</h3><slot /><footer><slot name="footer" /></footer></div>',
  },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  ShareLinkStatusBadgeById: { props: ['statusId'], template: '<span data-test="status">{{ statusId }}</span>' },
}

function row(overrides = {}) {
  return {
    id: 'l1',
    entityType: 'Nonconformance',
    entityLabel: 'Nonconformance',
    reference: 'NC-SHR-930',
    recordTitle: 'Share fixture NC',
    to: '/nonconformances/nc-1',
    email: 'a@x.test',
    origin: 'Person',
    sharedBy: 'Aaron Author',
    createdAt: DateTime.now().minus({ days: 1 }),
    expiresAt: DateTime.now().plus({ days: 29 }),
    statusId: 'ACTIVE',
    ...overrides,
  }
}

async function mountDialog(r = row()) {
  const w = mount(SharedRecordDetailDialog, { props: { row: r }, global: { stubs } })
  await flushPromises()
  await flushPromises()
  return w
}

const buttonNamed = (w, text) => w.findAll('button').find((b) => b.text().includes(text))
const toastMessages = () => useToast().toasts.value.map((t) => t.message)

beforeEach(() => {
  items = []
  views = []
  post.mockReset()
  useToast().dismissAll()
})

describe('SharedRecordDetailDialog — withdrawing', () => {
  it.each(['EXPIRED', 'WITHDRAWN'])('offers no withdraw on a %s link', async (statusId) => {
    const w = await mountDialog(row({ statusId }))
    expect(buttonNamed(w, 'Withdraw')).toBeUndefined()
  })

  it('is two clicks — the first names who loses access, the second revokes and closes', async () => {
    post.mockResolvedValue({ shareLink: {} })
    const w = await mountDialog()
    await buttonNamed(w, 'Withdraw access').trigger('click')
    expect(w.text()).toContain('a@x.test loses access immediately.')
    expect(post).not.toHaveBeenCalled()

    await buttonNamed(w, 'Confirm withdraw').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/v1/services/recordShareLinks/l1/revoke', {}, { showError: true })
    expect(toastMessages()).toContain('Access withdrawn for a@x.test.')
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('a refused withdrawal keeps the dialog open — the link is still live', async () => {
    post.mockRejectedValue(new Error('403'))
    const w = await mountDialog()
    await buttonNamed(w, 'Withdraw access').trigger('click')
    await buttonNamed(w, 'Confirm withdraw').trigger('click')
    await flushPromises()
    expect(w.emitted('close')).toBeUndefined()
    expect(toastMessages()).not.toContain('Access withdrawn for a@x.test.')
  })
})

describe('SharedRecordDetailDialog — what the link exposes, and who opened it', () => {
  it('a package link lists its contents resolved to numbers and titles', async () => {
    items = [
      { entityType: 'Document', entityId: 'd1' },
      { entityType: 'Nonconformance', entityId: 'n2' },
    ]
    records.d1 = { docNumber: 'DSHR-930', title: 'Share Fixture SOP' }
    records.n2 = { ncNumber: 'NC-SHR-932', title: 'Closed evidence' }
    const w = await mountDialog(row({ entityType: 'AuditInstance', entityLabel: 'Audit Records Package' }))
    expect(w.text()).toContain('Package contents (2)')
    expect(w.text()).toContain('DSHR-930')
    expect(w.text()).toContain('Share Fixture SOP')
    expect(w.text()).toContain('NC-SHR-932')
  })

  it('a single-record link shows no package section', async () => {
    items = [{ entityType: 'Document', entityId: 'd1' }]
    const w = await mountDialog()
    expect(w.text()).not.toContain('Package contents')
  })

  it('lists every recorded view with its IP', async () => {
    views = [
      { id: 'v2', viewedAt: DateTime.now(), ip: '203.0.113.9' },
      { id: 'v1', viewedAt: DateTime.now().minus({ hours: 2 }), ip: '198.51.100.4' },
    ]
    const w = await mountDialog()
    expect(w.text()).toContain('203.0.113.9')
    expect(w.text()).toContain('198.51.100.4')
    expect(w.text()).not.toContain('Never opened')
  })

  it('says a never-opened link was never opened, and where the code goes', async () => {
    const w = await mountDialog()
    expect(w.text()).toContain('Never opened. The code is emailed to a@x.test on each visit.')
  })

  it('a rule-sent link says it was automatic', async () => {
    const w = await mountDialog(row({ sharedBy: null, origin: 'Rule' }))
    expect(w.text()).toContain('Rule (automatic)')
  })
})
