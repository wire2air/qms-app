// useDetailLayout.js
import { computed, toValue } from 'vue'
import { useScroll, useBreakpoints } from '@vueuse/core'
import { resolveDetailState, bucketActions } from './detailLayoutHelpers.js'

function flag(v) {
  return typeof v === 'function' ? !!v() : !!toValue(v)
}

/**
 * Headless core for the detail-page layout (spec §3.1 L1).
 * @param {Object} o
 * @param {*} o.loading @param {*} o.notFound @param {*} o.error  ref|getter|value
 * @param {*} o.actions  ref|getter|ActionDescriptor[]
 * @param {number} [o.maxVisibleActions]
 * @param {import('vue').Ref<HTMLElement|null>} [o.scrollTarget]
 */
export function useDetailLayout(o = {}) {
  const state = computed(() =>
    resolveDetailState({
      loading: flag(o.loading),
      error: flag(o.error),
      notFound: flag(o.notFound),
    }),
  )

  const resolvedActions = computed(() =>
    (toValue(o.actions) || []).map((a) => ({
      ...a,
      visible: a.visible === undefined ? true : flag(a.visible),
      disabled: flag(a.disabled),
      loading: flag(a.loading),
      variant: a.variant || 'secondary',
      priority: a.priority ?? 0,
    })),
  )

  const actionBuckets = computed(() =>
    bucketActions(resolvedActions.value, o.maxVisibleActions ?? 3),
  )

  // Scroll-aware chrome: true once the scroll region has moved.
  const { y } = useScroll(o.scrollTarget ?? (() => null))
  const scrolled = computed(() => (y?.value ?? 0) > 4)

  // Project Tailwind breakpoints (px). md=768, lg=1024.
  const bp = useBreakpoints({ md: 768, lg: 1024 })
  const isMobile = bp.smaller('md') // < 768
  const isTablet = bp.between('md', 'lg') // 768–1024

  return { state, actionBuckets, scrolled, isMobile, isTablet }
}
