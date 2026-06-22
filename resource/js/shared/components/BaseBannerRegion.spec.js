import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBannerRegion from './BaseBannerRegion.vue'

const banner = (id, extra = {}) => ({ id, tone: 'info', title: id, ...extra })

describe('BaseBannerRegion', () => {
  it('renders nothing when there are no banners', () => {
    const w = mount(BaseBannerRegion, { props: { banners: [] } })
    expect(w.find('[data-test="banner-region"]').exists()).toBe(false)
  })
  it('renders one BaseBanner per descriptor', () => {
    const w = mount(BaseBannerRegion, { props: { banners: [banner('a'), banner('b')] } })
    expect(w.findAll('[data-test="base-banner"]')).toHaveLength(2)
  })
  it('hides a dismissible banner after its dismiss event', async () => {
    const w = mount(BaseBannerRegion, { props: { banners: [banner('a', { dismissible: true })] } })
    await w.get('[data-test="banner-dismiss"]').trigger('click')
    expect(w.findAll('[data-test="base-banner"]')).toHaveLength(0)
  })
})
