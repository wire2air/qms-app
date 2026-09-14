import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'
import { useToast } from '@shared/composables/useToast.js'
import { SHAREABLE_ENTITIES } from '@/utils/shareableEntities.js'

/**
 * Shared Records — every external link in the company, in one list.
 *
 * Two things are under test, and neither needs the DataTable: the ROW MODEL the
 * page derives from four synced tables (the status each link is in, the human
 * reference it points at, who or what sent it, how often it was opened), and
 * the BULK WITHDRAW, which is irreversible and therefore names the people who
 * lose access and reports failures by address rather than by count — a partial
 * result is the realistic outcome when a selection spans records the admin
 * can and cannot act on.
 */

let links = []
let users = []
let ncs = []
let views = []
vi.mock('@models/index', () => ({
  db: {
    RecordShareLink: {
      name: 'RecordShareLink',
      where: () => ({ orderBy: () => ({ exec: async () => links }) }),
    },
    User: { name: 'User', where: () => ({ exec: async () => users }) },
    Nonconformance: { name: 'Nonconformance', where: () => ({ exec: async () => ncs }) },
    RecordShareLinkView: { name: 'RecordShareLinkView', where: () => ({ exec: async () => views }) },
  },
}))

const post = vi.fn()
vi.mock('@/api', () => ({ post: (...args) => post(...args) }))

const SharedRecordsHome = (await import('./SharedRecordsHome.vue')).default

const TableStub = {
  name: 'SharedRecordsTable',
  props: ['rows'],
  emits: ['open', 'bulkWithdraw'],
  template: '<div data-test="table" />',
}
const ConfirmStub = {
  name: 'BaseConfirmDialog',
  props: ['modelValue', 'title', 'message', 'okLabel'],
  emits: ['ok', 'update:modelValue'],
  template:
    '<div v-if="modelValue" data-test="confirm"><p data-test="message">{{ message }}</p><button data-test="ok" @click="$emit(\'ok\')">{{ okLabel }}</button></div>',
}

async function mountHome() {
  const w = mount(SharedRecordsHome, {
    global: {
      stubs: {
        SharedRecordsTable: TableStub,
        BaseConfirmDialog: ConfirmStub,
        BaseListLayout: { template: '<div><slot /></div>' },
        SharedRecordDetailDialog: { props: ['row'], template: '<div data-test="detail" />' },
      },
    },
  })
  await flushPromises()
  await flushPromises()
  return w
}

function linkRow(overrides) {
  return {
    entityType: 'Nonconformance',
    entityId: 'nc-1',
    origin: 'SHARE',
    createdBy: 'u-author',
    createdAt: DateTime.now().minus({ days: 1 }),
    expiresAt: DateTime.now().plus({ days: 29 }),
    lastViewedAt: null,
    revokedAt: null,
    viewCount: 0,
    ...overrides,
  }
}

const toastMessages = () => useToast().toasts.value.map((t) => t.message)

beforeEach(() => {
  links = [
    linkRow({ id: 'l1', email: 'live@x.test' }),
    linkRow({ id: 'l2', email: 'old@x.test', expiresAt: DateTime.now().minus({ hours: 1 }) }),
    linkRow({ id: 'l3', email: 'gone@x.test', revokedAt: DateTime.now() }),
    linkRow({ id: 'l4', email: 'rule@x.test', origin: 'NOTIFICATION', createdBy: null }),
  ]
  users = [{ id: 'u-author', firstName: 'Aaron', lastName: 'Author', email: 'author@e2e.test' }]
  ncs = [{ id: 'nc-1', ncNumber: 'NC-SHR-930', title: 'Share fixture NC' }]
  views = [
    { id: 'v1', shareLinkId: 'l1' },
    { id: 'v2', shareLinkId: 'l1' },
  ]
  post.mockReset()
  useToast().dismissAll()
})

describe('SharedRecordsHome — the row model', () => {
  it('derives each link\'s status from the row, never from a stored column', async () => {
    const rows = (await mountHome()).findComponent(TableStub).props('rows')
    expect(rows.map((r) => [r.email, r.statusId, r.status])).toEqual([
      ['live@x.test', 'ACTIVE', 'Active'],
      ['old@x.test', 'EXPIRED', 'Expired'],
      ['gone@x.test', 'WITHDRAWN', 'Withdrawn'],
      ['rule@x.test', 'ACTIVE', 'Active'],
    ])
  })

  it('reads a link by the human reference it points at, and says who (or what) sent it', async () => {
    const rows = (await mountHome()).findComponent(TableStub).props('rows')
    expect(rows[0]).toMatchObject({
      reference: 'NC-SHR-930',
      recordTitle: 'Share fixture NC',
      entityLabel: SHAREABLE_ENTITIES.Nonconformance,
      to: '/nonconformances/nc-1',
      origin: 'Person',
      sharedBy: 'Aaron Author',
      viewCount: 2, // counted from the view rows, not the counter
    })
    expect(rows[3]).toMatchObject({ origin: 'Rule', sharedBy: null })
  })
})

describe('SharedRecordsHome — bulk withdraw', () => {
  it('names who loses access, revokes one link at a time, and reports a failure by address', async () => {
    post.mockImplementation(async (url) => {
      if (url.includes('/l2/')) throw new Error('403')
      return {}
    })
    const w = await mountHome()
    const rows = w.findComponent(TableStub).props('rows')
    w.findComponent(TableStub).vm.$emit('bulkWithdraw', [rows[0], rows[1]])
    await flushPromises()

    expect(w.find('[data-test="message"]').text()).toBe(
      '2 people lose access immediately: live@x.test, old@x.test. Their links stop working at once, including any files already open. Sharing again creates a new link.',
    )
    expect(post).not.toHaveBeenCalled() // nothing happens before the confirmation

    await w.find('[data-test="ok"]').trigger('click')
    await flushPromises()
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      '/v1/services/recordShareLinks/l1/revoke',
      '/v1/services/recordShareLinks/l2/revoke',
    ])
    expect(post.mock.calls.every((c) => c[2]?.showError === false)).toBe(true)
    expect(toastMessages()).toEqual(
      expect.arrayContaining(['Access withdrawn for 1 link.', 'Could not withdraw 1: old@x.test']),
    )
    expect(w.find('[data-test="confirm"]').exists()).toBe(false)
  })

  it('says "person loses" for one, and "and N more" past five names', async () => {
    const w = await mountHome()
    const rows = w.findComponent(TableStub).props('rows')
    w.findComponent(TableStub).vm.$emit('bulkWithdraw', [rows[0]])
    await flushPromises()
    expect(w.find('[data-test="message"]').text()).toMatch(/^1 person loses access immediately: live@x\.test\./)

    const many = Array.from({ length: 7 }, (_, i) => ({ ...rows[0], id: `m${i}`, email: `p${i}@x.test` }))
    w.findComponent(TableStub).vm.$emit('bulkWithdraw', many)
    await flushPromises()
    expect(w.find('[data-test="message"]').text()).toContain(
      '7 people lose access immediately: p0@x.test, p1@x.test, p2@x.test, p3@x.test, p4@x.test, and 2 more.',
    )
  })
})
