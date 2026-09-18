import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

/**
 * /profile — the "My Account" shell. Deep links such as the security email's
 * "/profile?tab=security" must land on the right tab, an unknown tab must fall
 * back to the profile rather than render an empty panel, and switching tabs
 * must keep the URL deep-linkable.
 */

vi.mock('@models/index', () => ({ db: {} }))

const h = vi.hoisted(() => ({ query: {}, replace: null }))
vi.mock('vue-router', async (orig) => {
  const actual = await orig()
  h.replace = vi.fn()
  return {
    ...actual,
    useRoute: () => ({ query: h.query }),
    useRouter: () => ({ replace: h.replace }),
  }
})
vi.mock('@/components/profile/PersonalProfile.vue', () => ({
  default: { name: 'PersonalProfile', template: '<div class="stub-profile" />' },
}))
vi.mock('@/components/security/PersonalSecurity.vue', () => ({
  default: { name: 'PersonalSecurity', template: '<div class="stub-security" />' },
}))

const ProfilePage = (await import('./profile.vue')).default

// Minimal tab chrome: renders only the active panel and exposes the model.
const BaseTabs = {
  name: 'BaseTabs',
  props: ['modelValue', 'tabs', 'ariaLabel'],
  emits: ['update:modelValue'],
  provide() {
    return { activeTab: () => this.modelValue }
  },
  template: '<div class="tabs" :data-active="modelValue"><slot /></div>',
}
const BaseTabPanel = {
  name: 'BaseTabPanel',
  props: ['value'],
  inject: ['activeTab'],
  template: '<div v-if="activeTab() === value"><slot /></div>',
}

function mountAt(query) {
  h.query = query
  return mount(ProfilePage, {
    global: { stubs: { BaseTabs, BaseTabPanel, BasePage: { template: '<div><slot /></div>' }, PageHeader: true } },
  })
}

beforeEach(() => {
  h.replace?.mockClear()
})

describe('profile page', () => {
  it('opens on Personal Profile by default', () => {
    const w = mountAt({})
    expect(w.find('.tabs').attributes('data-active')).toBe('profile')
    expect(w.find('.stub-profile').exists()).toBe(true)
  })

  it('honours ?tab=security deep links', () => {
    const w = mountAt({ tab: 'security' })
    expect(w.find('.tabs').attributes('data-active')).toBe('security')
    expect(w.find('.stub-security').exists()).toBe(true)
  })

  it('falls back to the profile for an unknown tab', () => {
    const w = mountAt({ tab: 'billing' })
    expect(w.find('.tabs').attributes('data-active')).toBe('profile')
  })

  it('writes the chosen tab back to the URL', async () => {
    const w = mountAt({})
    w.findComponent(BaseTabs).vm.$emit('update:modelValue', 'security')
    await flushPromises()
    expect(h.replace).toHaveBeenCalledWith({ query: { tab: 'security' } })
  })
})
