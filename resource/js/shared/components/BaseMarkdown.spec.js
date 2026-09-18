import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseMarkdown from './BaseMarkdown.vue'

describe('BaseMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    const w = mount(BaseMarkdown, { props: { content: '**bold** and _em_' } })
    expect(w.html()).toContain('<strong>bold</strong>')
    expect(w.html()).toContain('<em>em</em>')
  })

  it('renders links', () => {
    const w = mount(BaseMarkdown, { props: { content: '[site](https://example.com)' } })
    expect(w.html()).toContain('href="https://example.com"')
  })

  it('sanitizes dangerous HTML (XSS) — no script survives', () => {
    const w = mount(BaseMarkdown, { props: { content: 'hi <script>alert(1)</script>' } })
    expect(w.html()).toContain('hi')
    expect(w.html()).not.toContain('<script>')
  })

  it('strips image src by default and allows it with allowImages', () => {
    const md = '![x](https://e.com/i.png)'
    // default: the <img> tag may remain but its src is sanitized away
    expect(mount(BaseMarkdown, { props: { content: md } }).html()).not.toContain('src=')
    expect(mount(BaseMarkdown, { props: { content: md, allowImages: true } }).html()).toContain(
      'src="https://e.com/i.png"',
    )
  })

  it('renders empty for empty content', () => {
    const w = mount(BaseMarkdown, { props: { content: '' } })
    expect(w.find('div').text()).toBe('')
  })

  it('applies prose chrome', () => {
    const w = mount(BaseMarkdown, { props: { content: 'x' } })
    expect(w.classes()).toContain('tw:prose')
  })
})
