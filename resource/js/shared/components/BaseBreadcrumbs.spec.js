import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBreadcrumbs from './BaseBreadcrumbs.vue'

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }
const ITEMS = [
  { label: 'Change Requests', to: '/change-requests' },
  { label: 'Programs', to: '/programs' },
  { label: 'CR-001' },
]

function mountCrumbs(items = ITEMS) {
  return mount(BaseBreadcrumbs, {
    props: { items },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('BaseBreadcrumbs (nav / ol / aria-current)', () => {
  it('is a labelled navigation landmark wrapping an ordered list', () => {
    const w = mountCrumbs()
    const nav = w.find('nav')
    expect(nav.exists()).toBe(true)
    expect(nav.attributes('aria-label')).toBe('Breadcrumb')
    expect(w.find('ol').exists()).toBe(true)
    expect(w.findAll('li')).toHaveLength(3)
  })

  it('marks the last (current) crumb with aria-current="page"', () => {
    const lis = mountCrumbs().findAll('li')
    expect(lis[2].find('[aria-current="page"]').exists()).toBe(true)
    expect(lis[0].find('[aria-current="page"]').exists()).toBe(false)
  })

  it('links non-terminal crumbs and renders the last as plain text', () => {
    const w = mountCrumbs()
    const lis = w.findAll('li')
    expect(lis[0].find('a').exists()).toBe(true) // RouterLink stub → <a>
    expect(lis[2].find('a').exists()).toBe(false)
    expect(lis[2].text()).toContain('CR-001')
  })

  it('hides separators from assistive tech (n-1 of them)', () => {
    const w = mountCrumbs()
    expect(w.findAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('accepts a custom ariaLabel', () => {
    const w = mount(BaseBreadcrumbs, {
      props: { items: ITEMS, ariaLabel: 'You are here' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.find('nav').attributes('aria-label')).toBe('You are here')
  })
})
