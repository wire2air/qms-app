import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The component resolves through useLiveQueryWithDeps, which hands it the real
// model registry. Stub the registry so the test controls exactly what
// findByPk returns — present, soft-deleted (null), or still resolving.
const findByPk = vi.fn()
vi.mock('@models/index', () => ({ db: { Site: { findByPk: (...a) => findByPk(...a) } } }))

const SiteBadgeById = (await import('./SiteBadgeById.vue')).default
const SiteBadge = (await import('./SiteBadge.vue')).default

function mountBadge(props) {
  // SiteBadge / BaseText resolve through the auto-import plugin configured in
  // vitest.config.js, so no component registration is needed here.
  return mount(SiteBadgeById, { props })
}

describe('SiteBadgeById', () => {
  beforeEach(() => findByPk.mockReset())

  it('renders the badge when the site resolves', async () => {
    findByPk.mockResolvedValue({ id: 's1', name: 'London' })
    const w = mountBadge({ siteId: 's1' })
    await flushPromises()

    expect(w.findComponent(SiteBadge).exists()).toBe(true)
    expect(w.text()).toBe('London')
  })

  /**
   * The finding: a soft-deleted site rendered NOTHING at all — not "Unknown",
   * not the raw id, just a blank field across 13 read-only display sites,
   * indistinguishable from "this record has no site". findByPk returns null for
   * a paranoid-deleted row, which is exactly this case.
   */
  it('falls back to — when the id points at a site that no longer resolves', async () => {
    findByPk.mockResolvedValue(null)
    const w = mountBadge({ siteId: 'deleted-site' })
    await flushPromises()

    expect(w.findComponent(SiteBadge).exists()).toBe(false)
    expect(w.text()).toBe('—')
  })

  it('explains the dash on hover rather than leaving it mysterious', async () => {
    findByPk.mockResolvedValue(null)
    const w = mountBadge({ siteId: 'deleted-site' })
    await flushPromises()

    expect(w.attributes('title')).toMatch(/no longer available|deleted/i)
  })

  // The dash must mean "this site is gone", not "we haven't looked yet" —
  // otherwise every page load flashes a dash before the badge appears.
  it('renders nothing while the lookup is still in flight', async () => {
    let resolveLookup
    findByPk.mockReturnValue(new Promise((r) => (resolveLookup = r)))
    const w = mountBadge({ siteId: 's1' })
    await flushPromises()

    expect(w.text()).toBe('')

    resolveLookup({ id: 's1', name: 'London' })
    await flushPromises()
    expect(w.text()).toBe('London')
  })

  it('renders nothing — not a dash — when no siteId is supplied', async () => {
    const w = mountBadge({ siteId: null })
    await flushPromises()

    expect(w.text()).toBe('')
    expect(findByPk).not.toHaveBeenCalled()
  })

  it('re-resolves when the id changes, including from present to missing', async () => {
    findByPk.mockResolvedValue({ id: 's1', name: 'London' })
    const w = mountBadge({ siteId: 's1' })
    await flushPromises()
    expect(w.text()).toBe('London')

    findByPk.mockResolvedValue(null)
    await w.setProps({ siteId: 's2' })
    await flushPromises()
    expect(w.text()).toBe('—')
  })
})
