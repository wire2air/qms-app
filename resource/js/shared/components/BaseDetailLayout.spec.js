// BaseDetailLayout.spec.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseDetailLayout from './BaseDetailLayout.vue'

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }
function mountLayout(options = {}) {
  return mount(BaseDetailLayout, {
    attachTo: document.body,
    ...options,
    global: { stubs: { RouterLink: RouterLinkStub }, ...(options.global || {}) },
  })
}

describe('BaseDetailLayout', () => {
  let title, actions
  beforeEach(() => {
    title = Object.assign(document.createElement('div'), { id: 'main-header-title' })
    actions = Object.assign(document.createElement('div'), { id: 'main-header-actions' })
    document.body.append(title, actions)
  })
  afterEach(() => { title.remove(); actions.remove() })

  it('shows the layout skeleton while loading and hides the body', () => {
    const w = mountLayout({ props: { loading: true }, slots: { default: '<div data-test="body" />' } })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.find('[data-test="detail-skeleton"]').exists()).toBe(true)
  })

  it('shows not-found state', () => {
    const w = mountLayout({ props: { notFound: true, notFoundTitle: 'No record' }, slots: { default: '<div data-test="body"/>' } })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.text()).toContain('No record')
  })

  it('shows error state distinct from not-found', () => {
    const w = mountLayout({ props: { error: true, errorTitle: 'Load failed' }, slots: { default: '<div/>' } })
    expect(w.text()).toContain('Load failed')
  })

  it('renders body in default slot when no tabs', () => {
    const w = mountLayout({ props: { title: 'X' }, slots: { default: '<div data-test="body">B</div>' } })
    expect(w.find('[data-test="body"]').exists()).toBe(true)
  })

  it('renders the rail region when railCards provided', () => {
    const w = mountLayout({
      props: { title: 'X', railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Owner', value: 'Jane' }] }] },
      slots: { default: '<div/>' },
    })
    expect(w.find('aside[aria-label="Details"]').exists()).toBe(true)
    expect(w.text()).toContain('Properties')
  })

  it('omits the rail when rail=false', () => {
    const w = mountLayout({
      props: { title: 'X', rail: false, railCards: [{ id: 'p', title: 'Properties' }] },
      slots: { default: '<div/>' },
    })
    expect(w.find('aside[aria-label="Details"]').exists()).toBe(false)
  })

  it('teleports breadcrumbs into the app header', async () => {
    mountLayout({ props: { breadcrumbs: [{ label: 'Suppliers', to: '/s' }, { label: 'Acme' }] }, slots: { default: '<div/>' } })
    await nextTick(); await nextTick()
    expect(title.textContent).toContain('Suppliers')
    expect(title.textContent).toContain('Acme')
  })
})

import { defineDetailConfig } from '../composables/defineDetailConfig.js'
import { readOnlyBanner } from '../composables/bannerFactories.js'
import { resolveVariant } from '../composables/detailVariantHelpers.js'

describe('BaseDetailLayout — config + banners', () => {
  it('derives title from config when no discrete title prop', () => {
    const config = defineDetailConfig({ header: () => ({ title: 'From Config' }) })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.text()).toContain('From Config')
  })
  it('renders the banner region from config.banners(record)', () => {
    const config = defineDetailConfig({ banners: () => [readOnlyBanner()] })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('[data-test="banner-region"]').exists()).toBe(true)
    expect(w.text()).toContain('Read-only')
  })
  it('renders no banner region when config.banners returns empty', () => {
    const config = defineDetailConfig({})
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('[data-test="banner-region"]').exists()).toBe(false)
  })
  it('config title wins over the discrete title prop', () => {
    const config = defineDetailConfig({ header: () => ({ title: 'Config Title' }) })
    const w = mountLayout({ props: { config, title: 'Prop Title' }, slots: { default: '<div/>' } })
    expect(w.text()).toContain('Config Title')
    expect(w.text()).not.toContain('Prop Title')
  })
})

describe('BaseDetailLayout — variants', () => {
  it('readonly exposes editable=false to scoped slots', () => {
    const config = defineDetailConfig({ variant: 'readonly' })
    const w = mountLayout({
      props: { config },
      slots: { default: `<template #default="s"><span data-test="ed">{{ String(s.editable) }}</span></template>` },
    })
    expect(w.get('[data-test="ed"]').text()).toBe('false')
  })
  it('embedded hides the rail even when railCards exist', () => {
    const config = defineDetailConfig({ variant: 'embedded', railCards: [{ id: 'p', title: 'Properties' }] })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('aside[aria-label="Details"]').exists()).toBe(false)
  })
  it('renders a stub marker for the approval variant', () => {
    const config = defineDetailConfig({ variant: 'approval' })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('[data-test="variant-stub"]').exists()).toBe(true)
  })
  it('renders anchor sections with their ids and a nav', () => {
    const config = defineDetailConfig({ sections: [{ id: 'details', label: 'Details' }] })
    const w = mountLayout({
      props: { config },
      slots: { 'section-details': '<div data-test="sec">Body</div>' },
    })
    expect(w.find('nav[aria-label="Sections"]').exists()).toBe(true)
    expect(w.find('#section-details').exists()).toBe(true)
    expect(w.get('[data-test="sec"]').text()).toBe('Body')
  })
  it('hides the AI summary slot unless ai.enabled', () => {
    const off = mountLayout({ props: { config: defineDetailConfig({}) }, slots: { default: '<div/>', 'ai-summary': '<div data-test="ai"/>' } })
    expect(off.find('[data-test="ai"]').exists()).toBe(false)
    const on = mountLayout({ props: { config: defineDetailConfig({ ai: { enabled: true } }) }, slots: { default: '<div/>', 'ai-summary': '<div data-test="ai"/>' } })
    expect(on.find('[data-test="ai"]').exists()).toBe(true)
  })
})
