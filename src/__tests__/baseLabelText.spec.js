/**
 * BaseLabel resolves its own text.
 *
 * ORIGINAL REPORT (2026-09-27): "Unable to select the site under User" — which
 * turned out to be "I cannot tell what this control is". The additional-sites
 * picker on the user profile rendered a lone "?" help icon above a dropdown,
 * with no label beside it.
 *
 * BaseLabel took its text from the DEFAULT SLOT only. Its own prop comment had
 * promised more for a long time — "Resolve `help` (and, when the label slot is
 * empty, the label text) from the central tooltip registry" — but no such
 * fallback existed, and there was no `label` prop either.
 *
 * Two call sites were already written as though both worked:
 *   UserPageId            <BaseLabel dataKey="user.additionalSites" />
 *   SitesCreateUpdateDialog  <BaseLabel dataKey="site.isActive" label="…" />
 *
 * The first relied on the registry fallback; the second passed a prop that did
 * not exist, so Vue put it on the <label> element as a stray HTML attribute.
 * Both rendered an empty label. Nothing errored — the help icon still drew, so
 * the control looked deliberate rather than broken, which is why it survived.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseLabel from '@shared/components/typography/BaseLabel.vue'

const stubs = { BaseTooltip: true, BaseText: true, IconHelpCircle: true }

describe('BaseLabel text resolution', () => {
  it('falls back to the registry label when there is no slot — the reported bug', () => {
    const w = mount(BaseLabel, { props: { dataKey: 'user.additionalSites' }, global: { stubs } })
    expect(w.text()).toContain('Additional Sites')
  })

  it('accepts an explicit label prop', () => {
    const w = mount(BaseLabel, {
      props: { label: 'Accepting new user assignments' },
      global: { stubs },
    })
    expect(w.text()).toContain('Accepting new user assignments')
  })

  it('does not leak the label prop onto the element as an attribute', () => {
    // What made the Sites dialog's label invisible: with no matching prop, Vue
    // fell it through to $attrs and rendered <label label="…">.
    const w = mount(BaseLabel, { props: { label: 'Some label' }, global: { stubs } })
    expect(w.find('label').attributes('label')).toBeUndefined()
  })

  it('the slot still wins over both', () => {
    const w = mount(BaseLabel, {
      props: { dataKey: 'user.additionalSites', label: 'From prop' },
      slots: { default: 'From slot' },
      global: { stubs },
    })
    expect(w.text()).toContain('From slot')
    expect(w.text()).not.toContain('From prop')
    expect(w.text()).not.toContain('Additional Sites')
  })

  it('renders nothing rather than a stray key for an unknown dataKey', () => {
    const w = mount(BaseLabel, { props: { dataKey: 'nope.not.a.key' }, global: { stubs } })
    expect(w.text().trim()).toBe('')
  })
})
