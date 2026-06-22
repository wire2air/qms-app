import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDetailPage from './BaseDetailPage.vue'
import BaseOverviewPanel from './BaseOverviewPanel.vue'

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }

describe('detail deprecation warnings', () => {
  let warn
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { warn.mockRestore() })

  it('BaseDetailPage warns on mount pointing to BaseDetailLayout', () => {
    mount(BaseDetailPage, { global: { stubs: { RouterLink: RouterLinkStub } }, slots: { default: '<div/>' } })
    expect(warn.mock.calls.flat().join(' ')).toContain('BaseDetailLayout')
  })

  it('BaseOverviewPanel warns on mount pointing to DetailRail', () => {
    mount(BaseOverviewPanel, { slots: { default: '<div/>' } })
    expect(warn.mock.calls.flat().join(' ')).toContain('DetailRail')
  })
})
