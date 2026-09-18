import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import { useToast } from '@shared/composables/useToast.js'
import { ApiError } from '@/api/errors.js'

/**
 * The "Share externally" rail card — mounted on every shareable record.
 *
 * Its gate is `<module>:manage_access` AT RECORD SCOPE, the same question the
 * server's assertCanActOnRecord asks. So the session mock below is not a
 * boolean: it runs the REAL scope arithmetic (utils/recordScope.js) over a
 * mutable session, because a card that asked the wrong question of the record
 * (its site, its owner, a module record's custodian column) would pass any
 * mock that simply answered "yes".
 *
 * MTC-S07 is the case that matters most: a user who may UPDATE the NC but not
 * share it still sees who has access (the list is RLS-gated, not card-gated)
 * and gets neither the address box nor a withdraw button.
 */

let linkRows = []
vi.mock('@models/index', () => ({
  db: {
    RecordShareLink: {
      name: 'RecordShareLink',
      where: () => ({ orderBy: () => ({ exec: async () => linkRows }) }),
    },
  },
}))

const post = vi.fn()
vi.mock('@/api', () => ({ post: (...args) => post(...args) }))

let session = null
vi.mock('@/utils/currentSession.js', async () => {
  const { scopeAllows } = await import('@/utils/recordScope.js')
  return {
    isAllowedOnRecord: (permission, record, opts) => scopeAllows(session, permission, record, opts),
  }
})

const RecordShareCard = (await import('./RecordShareCard.vue')).default

const PRIMARY = 'site-primary'
const SECONDARY = 'site-secondary'
const NC = { id: 'nc-1', siteId: PRIMARY, departmentId: 'dept-q', ownerId: 'u-someone' }
const PLACEHOLDER = 'name@company.com, another@company.com'

let seq = 0
function link(overrides = {}) {
  seq += 1
  return {
    id: `l-${seq}`,
    email: 'a@x.test',
    origin: 'SHARE',
    viewCount: 0,
    lastViewedAt: null,
    expiresAt: DateTime.now().plus({ days: 30 }),
    revokedAt: null,
    createdAt: DateTime.now(),
    ...overrides,
  }
}

function sessionWith(permissionScopes, extra = {}) {
  return {
    id: 'u-me',
    isOwner: false,
    siteIds: [PRIMARY],
    departmentId: 'dept-q',
    permissionScopes,
    ...extra,
  }
}

async function mountCard(props = {}) {
  const w = mount(RecordShareCard, {
    props: { entityType: 'Nonconformance', entityId: 'nc-1', module: 'ncr', record: NC, ...props },
    global: { stubs: { BaseTooltip: { template: '<span><slot /></span>' } } },
  })
  await flushPromises()
  return w
}

const input = (w) => w.find(`input[placeholder="${PLACEHOLDER}"]`)
const withdrawButtons = (w) => w.findAll('button[aria-label^="Withdraw access for"]')
// The send control is the card's only BaseButton (the withdraw icons are plain
// <button>s); BaseTextInput renders buttons of its own, so "first unlabelled
// button" is not it.
const sendButton = (w) => w.findComponent({ name: 'BaseButton' })
const toastMessages = () => useToast().toasts.value.map((t) => t.message)

beforeEach(() => {
  linkRows = []
  post.mockReset()
  session = null
  useToast().dismissAll()
})

describe('RecordShareCard — who gets the controls', () => {
  it('a tenant-scope ncr:manage_access holder gets the address box and a withdraw button per live link', async () => {
    session = sessionWith({ 'ncr:read': 4, 'ncr:manage_access': 4 })
    linkRows = [link({ email: 'a@x.test' }), link({ email: 'b@x.test' })]
    const w = await mountCard()
    expect(input(w).exists()).toBe(true)
    expect(withdrawButtons(w).map((b) => b.attributes('aria-label'))).toEqual([
      'Withdraw access for a@x.test',
      'Withdraw access for b@x.test',
    ])
  })

  it('MTC-S07 · update without manage_access still sees who has access — and gets no box and no withdraw', async () => {
    session = sessionWith({ 'ncr:read': 4, 'ncr:update': 4 })
    linkRows = [link({ email: 'a@x.test' })]
    const w = await mountCard()
    expect(w.text()).toContain('a@x.test')
    expect(w.text()).toContain('Has access')
    expect(input(w).exists()).toBe(false)
    expect(withdrawButtons(w)).toHaveLength(0)
  })

  it('SITE scope reaches a record at one of my sites and not a record at another site', async () => {
    session = sessionWith({ 'ncr:manage_access': 3 })
    expect(input(await mountCard()).exists()).toBe(true)
    const elsewhere = { ...NC, siteId: SECONDARY, departmentId: 'dept-ops' }
    expect(input(await mountCard({ record: elsewhere })).exists()).toBe(false)
  })

  it('…but a site-rank grant also covers the lower tiers: my own department at another site is in reach', async () => {
    // authz.scope_allowed: (rank >= 3 AND site ∈ mine) OR (rank >= 2 AND dept = mine) OR …
    // — the ranks nest, so a wider grant never reaches LESS than a narrower one.
    session = sessionWith({ 'ncr:manage_access': 3 })
    expect(input(await mountCard({ record: { ...NC, siteId: SECONDARY } })).exists()).toBe(true)
  })

  it('OWN scope reaches only records the user is custodian of', async () => {
    session = sessionWith({ 'ncr:manage_access': 1 })
    expect(input(await mountCard()).exists()).toBe(false)
    expect(input(await mountCard({ record: { ...NC, ownerId: 'u-me' } })).exists()).toBe(true)
  })

  it('module records are scoped on their own custodian column (scopeOwnerField)', async () => {
    session = sessionWith({ 'deviation:manage_access': 1 })
    const record = { id: 'r-1', ownerUserId: 'u-me', ownerId: null }
    const props = { entityType: 'Record', entityId: 'r-1', module: 'deviation', record }
    expect(input(await mountCard(props)).exists()).toBe(false) // looks at ownerId by default
    expect(input(await mountCard({ ...props, scopeOwnerField: 'ownerUserId' })).exists()).toBe(true)
  })

  it('a company owner bypasses the matrix, as the server does', async () => {
    session = sessionWith({}, { isOwner: true })
    expect(input(await mountCard()).exists()).toBe(true)
  })

  it('offers nothing while the record has not loaded', async () => {
    session = sessionWith({ 'ncr:manage_access': 4 })
    expect(input(await mountCard({ record: null })).exists()).toBe(false)
  })
})

describe('RecordShareCard — what the list says', () => {
  beforeEach(() => {
    session = sessionWith({ 'ncr:manage_access': 4 })
  })

  it('states the current fact when nobody has access', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('Nobody outside the company has access yet.')
  })

  it('keeps withdrawn links as history in the footer and out of the live list', async () => {
    linkRows = [link({ email: 'live@x.test' }), link({ email: 'gone@x.test', revokedAt: DateTime.now() })]
    const w = await mountCard()
    expect(w.text()).toContain('Withdrawn: gone@x.test')
    expect(withdrawButtons(w).map((b) => b.attributes('aria-label'))).toEqual([
      'Withdraw access for live@x.test',
    ])
    expect(w.text()).not.toContain('Nobody outside the company')
  })

  it('an expired live link says "expired" — through shareLinkStatus, whatever the date shape', async () => {
    linkRows = [
      link({ email: 'old@x.test', expiresAt: DateTime.now().minus({ days: 1 }) }),
      link({ email: 'iso@x.test', expiresAt: new Date(Date.now() - 60_000).toISOString() }),
    ]
    const w = await mountCard()
    expect(w.text().match(/expired/g)).toHaveLength(2)
  })

  it('labels a rule-sent link and reports whether it was ever opened', async () => {
    linkRows = [
      link({ email: 'rule@x.test', origin: 'NOTIFICATION' }),
      link({ email: 'seen@x.test', viewCount: 2, lastViewedAt: DateTime.now() }),
    ]
    const w = await mountCard()
    expect(w.text()).toContain('sent by a notification')
    expect(w.text()).toContain('never opened')
    expect(w.text()).toContain('viewed 2×')
  })
})

describe('RecordShareCard — sharing and withdrawing', () => {
  beforeEach(() => {
    session = sessionWith({ 'ncr:manage_access': 4 })
  })

  it('splits a pasted list on commas, semicolons and newlines and sends every address in ONE call', async () => {
    post.mockResolvedValue({
      shared: ['a@x.test', 'b@x.test', 'c@x.test'].map((email) => ({ shareLink: { email }, reused: false })),
      invalid: [],
    })
    const w = await mountCard()
    await input(w).setValue('a@x.test, b@x.test;\nc@x.test')
    await sendButton(w).trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      '/v1/services/recordShareLinks',
      { entityType: 'Nonconformance', entityId: 'nc-1', emails: ['a@x.test', 'b@x.test', 'c@x.test'] },
      { showError: true },
    )
    expect(toastMessages()).toContain('Shared with 3 people.')
    expect(input(w).element.value).toBe('')
  })

  it('a single re-share says a fresh link went out — not that a second one was made', async () => {
    post.mockResolvedValue({ shared: [{ shareLink: { email: 'a@x.test' }, reused: true }], invalid: [] })
    const w = await mountCard()
    await input(w).setValue('A@X.test')
    await sendButton(w).trigger('click')
    await flushPromises()
    expect(toastMessages()).toContain(
      'Sent a fresh link to a@x.test — they already had access, so no second link was created.',
    )
  })

  it('reports malformed addresses on their own — the valid ones have already gone', async () => {
    post.mockResolvedValue({ shared: [{ shareLink: { email: 'a@x.test' }, reused: false }], invalid: ['nope'] })
    const w = await mountCard()
    await input(w).setValue('a@x.test nope')
    await sendButton(w).trigger('click')
    await flushPromises()
    expect(toastMessages()).toEqual(
      expect.arrayContaining(['Shared with a@x.test.', 'Not a valid email address: nope']),
    )
  })

  it('a refused share (403) keeps what was typed and settles cleanly', async () => {
    post.mockRejectedValue(new ApiError({ message: 'You do not have permission.', status: 403 }))
    const w = await mountCard()
    await input(w).setValue('a@x.test')
    await sendButton(w).trigger('click')
    await flushPromises()
    expect(input(w).element.value).toBe('a@x.test')
    expect(toastMessages().some((m) => m.startsWith('Shared with'))).toBe(false)
  })

  it('withdraw posts the revoke for THAT link and says who lost access', async () => {
    linkRows = [link({ id: 'l-keep', email: 'keep@x.test' }), link({ id: 'l-go', email: 'go@x.test' })]
    post.mockResolvedValue({ shareLink: {} })
    const w = await mountCard()
    await withdrawButtons(w)[1].trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/v1/services/recordShareLinks/l-go/revoke', {}, { showError: true })
    expect(toastMessages()).toContain('Access withdrawn for go@x.test.')
  })

  it('a double click withdraws once', async () => {
    linkRows = [link({ id: 'l-1', email: 'a@x.test' })]
    let release
    post.mockImplementation(() => new Promise((resolve) => (release = resolve)))
    const w = await mountCard()
    await withdrawButtons(w)[0].trigger('click')
    await withdrawButtons(w)[0].trigger('click')
    expect(post).toHaveBeenCalledTimes(1)
    release({})
    await flushPromises()
  })

  it('a refused withdrawal settles cleanly and announces nothing', async () => {
    linkRows = [link({ id: 'l-1', email: 'a@x.test' })]
    post.mockRejectedValue(new ApiError({ message: 'Forbidden', status: 403 }))
    const w = await mountCard()
    await withdrawButtons(w)[0].trigger('click')
    await flushPromises()
    expect(toastMessages()).not.toContain('Access withdrawn for a@x.test.')
    expect(withdrawButtons(w)[0].attributes('disabled')).toBeUndefined()
  })
})
