import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { DateTime } from 'luxon'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import { ApiError } from '@/api/errors.js'

/**
 * /share/:token — the one page an outsider with no account reaches.
 *
 * Lives next to RecordShareCard rather than under src/pages so the file-based
 * router never sees it.
 *
 * States, in the order a reader meets them: the code gate (before ANYTHING that
 * identifies the record), code requested, verified (the record, or a package
 * manifest), and dead (expired / revoked / unknown — one message for all).
 *
 * Two regression guards sit in here:
 *  - ERROR TEXT. `@/api` throws an ApiError whose `.message` is the server's;
 *    the page read `err.response.data.message`, which ApiError does not have,
 *    so "Too many attempts" and "That code has expired" both displayed as
 *    "That code is not correct." — sending the reader to retype a dead code.
 *  - A LINK WITHDRAWN MID-VISIT. With a package manifest on screen, opening an
 *    item after the link was revoked set an error the manifest never rendered:
 *    the click silently did nothing. It now shows the dead-link state.
 */

const get = vi.fn()
const post = vi.fn()
vi.mock('@/api', () => ({ get: (...a) => get(...a), post: (...a) => post(...a) }))

const Page = (await import('@/pages/share/[token].vue')).default

const QUIET = { showError: false }
const GATE = { needsVerification: true, maskedEmail: 'r••••@x.test', label: 'Nonconformance' }
const DETECTED = DateTime.fromISO('2026-09-01T00:00:00Z')
const RECORD = {
  record: {
    label: 'Nonconformance',
    reference: 'NC-SHR-930',
    title: 'Share fixture NC',
    sections: [
      {
        title: 'Summary',
        items: [
          { label: 'What was found', type: 'richText', value: '<p>Found <strong>cracks</strong></p>' },
          { label: 'Detected', type: 'date', value: DETECTED },
          { label: 'Lot number', type: 'text', value: 'LOT-RS-930' },
        ],
      },
    ],
    attachments: [{ url: '/api/v1/share/tok-123/files/a1', name: 'evidence.pdf', size: 2048 }],
  },
}
const PACKAGE = {
  record: {
    kind: 'package',
    label: 'Audit Records Package',
    reference: 'AUD-SHR-930',
    title: 'Records shared for AUD-SHR-930',
    items: [{ id: 'i1', entityType: 'Document', label: 'Document', reference: 'DSHR-930', title: 'SOP' }],
  },
}

function apiError(status, message) {
  return new ApiError({ message, status })
}

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/share/:token', component: { template: '<div />' } }],
  })
  router.push('/share/tok-123')
  await router.isReady()
  const w = mount(Page, { global: { plugins: [router], stubs: { BrandLogo: { template: '<span />' } } } })
  await flushPromises()
  return w
}

const buttonNamed = (w, text) => w.findAll('button').find((b) => b.text().includes(text))
const cspMeta = () => document.head.querySelector('meta[http-equiv="Content-Security-Policy"]')

function entryUrl(path) {
  vi.spyOn(window.performance, 'getEntriesByType').mockImplementation((type) =>
    type === 'navigation' ? [{ name: `http://e2elab.localhost:5173${path}` }] : [],
  )
}

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  cspMeta()?.remove()
  entryUrl('/share/tok-123')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the code gate', () => {
  it('comes first — the type and a masked address, nothing that identifies the record', async () => {
    get.mockResolvedValueOnce(GATE)
    const w = await mountPage()
    expect(get).toHaveBeenCalledWith('/v1/share/tok-123', QUIET)
    expect(w.text()).toContain('A Nonconformance has been shared with you')
    expect(w.text()).toContain('r••••@x.test')
    expect(w.text()).not.toContain('NC-SHR-930')
    expect(buttonNamed(w, 'Email me a code')).toBeTruthy()
  })

  it('says "An" before a vowel', async () => {
    get.mockResolvedValueOnce({ ...GATE, label: 'Audit Records Package' })
    const w = await mountPage()
    expect(w.text()).toContain('An Audit Records Package has been shared with you')
  })

  it('code requested: the code field and "Send another code" appear, and the call is quiet', async () => {
    get.mockResolvedValueOnce(GATE)
    post.mockResolvedValueOnce({ sent: true, maskedEmail: 'r••••@x.test' })
    const w = await mountPage()
    await buttonNamed(w, 'Email me a code').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenCalledWith('/v1/share/tok-123/request-code', {}, QUIET)
    expect(w.find('input[placeholder="6-digit code"]').exists()).toBe(true)
    expect(buttonNamed(w, 'Send another code')).toBeTruthy()
  })

  it('a re-issue refused by the cooldown (429) shows the server\'s own words', async () => {
    get.mockResolvedValueOnce(GATE)
    // The controller's own words (recordShareLinks.js requestShareCode, 2026-09-14).
    const cooldown =
      'A code was sent to this address moments ago. Check your inbox, or request a new one in 58 seconds.'
    post.mockRejectedValueOnce(apiError(429, cooldown))
    const w = await mountPage()
    await buttonNamed(w, 'Email me a code').trigger('click')
    await flushPromises()
    expect(w.text()).toContain(cooldown)
    expect(w.find('input[placeholder="6-digit code"]').exists()).toBe(false)
  })

  it('a limiter 429 with no message of its own still says something true', async () => {
    get.mockResolvedValueOnce(GATE)
    post.mockRejectedValueOnce(apiError(429, 'Request failed (429).'))
    const w = await mountPage()
    await buttonNamed(w, 'Email me a code').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Too many requests. Wait a minute and try again.')
  })
})

describe('verifying', () => {
  async function gateWithCodeSent() {
    get.mockResolvedValueOnce(GATE)
    post.mockResolvedValueOnce({ sent: true, maskedEmail: 'r••••@x.test' })
    const w = await mountPage()
    await buttonNamed(w, 'Email me a code').trigger('click')
    await flushPromises()
    await w.find('input[placeholder="6-digit code"]').setValue('123456')
    return w
  }

  it('a wrong code shows the reason and stays on the gate', async () => {
    const w = await gateWithCodeSent()
    post.mockRejectedValueOnce(apiError(400, 'That code is not correct.'))
    await buttonNamed(w, 'Open the Nonconformance').trigger('click')
    await flushPromises()
    expect(post).toHaveBeenLastCalledWith('/v1/share/tok-123/verify', { code: '123456' }, QUIET)
    expect(w.text()).toContain('That code is not correct.')
    expect(get).toHaveBeenCalledTimes(1) // no reload on failure
  })

  it.each([
    'Too many attempts. Request a new code.',
    'That code has expired. Request a new one.',
    'Request a code first.',
  ])('shows "%s" as itself — not as "That code is not correct."', async (message) => {
    const w = await gateWithCodeSent()
    post.mockRejectedValueOnce(apiError(400, message))
    await buttonNamed(w, 'Open the Nonconformance').trigger('click')
    await flushPromises()
    expect(w.text()).toContain(message)
    expect(w.text()).not.toContain('That code is not correct.')
  })

  it('the right code replaces the gate with the record', async () => {
    const w = await gateWithCodeSent()
    post.mockResolvedValueOnce({ verified: true })
    get.mockResolvedValueOnce(RECORD)
    await buttonNamed(w, 'Open the Nonconformance').trigger('click')
    await flushPromises()
    expect(w.find('h1').text()).toBe('NC-SHR-930')
    expect(w.find('input[placeholder="6-digit code"]').exists()).toBe(false)
  })
})

describe('the verified record', () => {
  it('renders sections, sanitised rich text as markup, formatted dates, and attachments with a size', async () => {
    get.mockResolvedValueOnce(RECORD)
    const w = await mountPage()
    expect(w.find('h1').text()).toBe('NC-SHR-930')
    expect(w.text()).toContain('Share fixture NC')
    expect(w.find('dd strong').text()).toBe('cracks') // markup, not literal <p> tags
    expect(w.text()).toContain(DETECTED.formatDate('date'))
    expect(w.text()).not.toContain('2026-09-01T00:00:00')
    const a = w.find('a[href="/api/v1/share/tok-123/files/a1"]')
    expect(a.exists()).toBe(true)
    expect(a.text()).toContain('evidence.pdf')
    expect(a.text()).toContain('2 KB')
    expect(w.text()).toContain('access can be withdrawn at any time')
  })
})

describe('a dead link', () => {
  it('expired, revoked and never-existed all read the same', async () => {
    get.mockRejectedValueOnce(apiError(404, 'This link is no longer valid.'))
    const w = await mountPage()
    expect(w.text()).toContain('This link is no longer valid.')
    expect(w.text()).toContain('Links expire, and the person who shared this can withdraw it at any time.')
    expect(buttonNamed(w, 'Email me a code')).toBeUndefined()
  })

  it('withdrawn while a package manifest is open: opening an item shows the dead-link state', async () => {
    get.mockResolvedValueOnce(PACKAGE)
    const w = await mountPage()
    expect(w.text()).toContain('1 record shared with you')
    get.mockRejectedValueOnce(apiError(404, 'This link is no longer valid.'))
    await buttonNamed(w, 'DSHR-930').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenLastCalledWith('/v1/share/tok-123/items/i1', QUIET)
    expect(w.text()).toContain('This link is no longer valid.')
    expect(w.text()).not.toContain('DSHR-930')
  })

  it('a verified visit that lapsed sends the reader back to the code gate — and never says "sign in"', async () => {
    get.mockResolvedValueOnce(PACKAGE)
    const w = await mountPage()
    get.mockRejectedValueOnce(apiError(401, 'Session expired. Please sign in again.'))
    get.mockResolvedValueOnce({ ...GATE, label: 'Audit Records Package' })
    await buttonNamed(w, 'DSHR-930').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('An Audit Records Package has been shared with you')
    expect(w.text().toLowerCase()).not.toContain('sign in')
  })

  it('an item that has gone from the package says so inline, and the manifest stays', async () => {
    get.mockResolvedValueOnce(PACKAGE)
    const w = await mountPage()
    get.mockRejectedValueOnce(apiError(404, 'This record is not part of the package.'))
    await buttonNamed(w, 'DSHR-930').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('This record is not part of the package.')
    expect(w.text()).toContain('DSHR-930')
  })
})

describe('RS-L-06 · Content-Security-Policy', () => {
  it('is added when /share/ was the document\'s entry URL', async () => {
    get.mockResolvedValueOnce(GATE)
    await mountPage()
    const content = cspMeta()?.getAttribute('content') ?? ''
    expect(content).toContain("img-src 'self' data: blob:")
    expect(content).toContain("script-src 'self'")
    expect(content).toContain("connect-src 'self'")
    expect(content).toContain("object-src 'none'")
    expect(content).not.toMatch(/script-src[^;]*unsafe/)
  })

  it('is NOT added when an internal user navigated here inside the app — a policy cannot be taken back', async () => {
    entryUrl('/dashboard')
    get.mockResolvedValueOnce(GATE)
    await mountPage()
    expect(cspMeta()).toBeNull()
  })

  it('is added once, not once per visit', async () => {
    get.mockResolvedValue(GATE)
    await mountPage()
    await mountPage()
    expect(document.head.querySelectorAll('meta[http-equiv="Content-Security-Policy"]')).toHaveLength(1)
  })
})
