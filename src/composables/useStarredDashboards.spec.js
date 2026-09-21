import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

/**
 * useStarredDashboards — the ids behind the home page's dashboard chips.
 *
 * The storage itself (users.settings, synced) is useUserSettings' job and is
 * tested there. What is pinned HERE is the behaviour the home page depends on
 * and nothing downstream re-checks:
 *
 *  1. Order is the chip order — a new star APPENDS. If this sorted, or used a
 *     Set, the chips would reshuffle under the user on every star.
 *  2. A malformed stored value degrades to "nothing starred". `settings` is a
 *     free-form jsonb bag any build can write, and a throw inside the computed
 *     would blank the whole home page rather than lose a chip.
 *  3. pruneMissing writes ONLY when something actually changed. A write on
 *     every render would queue a pointless GraphQL mutation per page load.
 *
 * Stale stars are the normal case, not the exceptional one: a starred `shared`
 * board can be flipped back to `private` by its owner, or soft-deleted, and RLS
 * then stops serving it — so the id becomes a pointer to nothing. That is what
 * pruneMissing exists for.
 */
const settings = ref({})
const setSetting = vi.fn(async (key, value) => {
  settings.value = { ...settings.value, [key]: value }
})

vi.mock('@/composables/useUserSettings', () => ({
  useUserSettings: () => ({
    getSetting: (key, fallback = null) => {
      const v = settings.value?.[key]
      return v === undefined ? fallback : v
    },
    setSetting,
    ready: ref(true),
    user: ref({}),
  }),
}))

const { useStarredDashboards } = await import('@/composables/useStarredDashboards')

beforeEach(() => {
  settings.value = {}
  setSetting.mockClear()
})

describe('useStarredDashboards', () => {
  it('reads nothing when the setting is absent', () => {
    const { starredIds, isStarred } = useStarredDashboards()
    expect(starredIds.value).toEqual([])
    expect(isStarred('a')).toBe(false)
  })

  it('appends a new star, preserving order', async () => {
    settings.value = { starredDashboards: ['a', 'b'] }
    const { toggleStar } = useStarredDashboards()

    await toggleStar('c')

    // Appended, NOT sorted — the array order is the chip order.
    expect(setSetting).toHaveBeenCalledWith('starredDashboards', ['a', 'b', 'c'])
  })

  it('removes a star without disturbing the rest', async () => {
    settings.value = { starredDashboards: ['a', 'b', 'c'] }
    const { toggleStar } = useStarredDashboards()

    await toggleStar('b')

    expect(setSetting).toHaveBeenCalledWith('starredDashboards', ['a', 'c'])
  })

  it('reports starred state', () => {
    settings.value = { starredDashboards: ['a'] }
    const { isStarred } = useStarredDashboards()
    expect(isStarred('a')).toBe(true)
    expect(isStarred('b')).toBe(false)
    // A missing id is never "starred", whatever it is.
    expect(isStarred(null)).toBe(false)
    expect(isStarred(undefined)).toBe(false)
  })

  it('ignores a toggle with no id', async () => {
    const { toggleStar } = useStarredDashboards()
    await toggleStar(null)
    await toggleStar('')
    expect(setSetting).not.toHaveBeenCalled()
  })

  // `settings` is free-form jsonb. A bad value must lose the chips, not the page.
  it('degrades to empty on a malformed stored value', () => {
    for (const bad of ['nope', 42, { a: 1 }, null]) {
      settings.value = { starredDashboards: bad }
      const { starredIds } = useStarredDashboards()
      expect(starredIds.value).toEqual([])
    }
  })

  it('drops non-string entries but keeps the good ones', () => {
    settings.value = { starredDashboards: ['a', null, 42, '', 'b'] }
    const { starredIds } = useStarredDashboards()
    expect(starredIds.value).toEqual(['a', 'b'])
  })

  describe('pruneMissing', () => {
    it('removes ids that no longer resolve', async () => {
      settings.value = { starredDashboards: ['a', 'b', 'c'] }
      const { pruneMissing } = useStarredDashboards()

      // `b` was unshared or deleted, so RLS stopped serving it.
      await pruneMissing(['a', 'c'])

      expect(setSetting).toHaveBeenCalledWith('starredDashboards', ['a', 'c'])
    })

    // The one that matters for load: a normal render must not write.
    it('writes nothing when every id still resolves', async () => {
      settings.value = { starredDashboards: ['a', 'b'] }
      const { pruneMissing } = useStarredDashboards()

      await pruneMissing(['a', 'b'])

      expect(setSetting).not.toHaveBeenCalled()
    })

    it('handles a missing argument without writing', async () => {
      settings.value = { starredDashboards: [] }
      const { pruneMissing } = useStarredDashboards()
      await pruneMissing(undefined)
      expect(setSetting).not.toHaveBeenCalled()
    })
  })
})
