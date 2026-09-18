import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { resolveRouteMeta, buildBreadcrumbs } from '@shared/composables/routeMetaHelpers.js'
import { ROUTE_META } from '@/router/routeMeta.js'

const APP_NAME = 'Qability'

/**
 * useRouteMeta — reactive route metadata (Enterprise Page Framework B7).
 *
 * Resolves the current route against the ROUTE_META registry and exposes the
 * page `title`, `icon`, and `breadcrumbs` trail. Call it ONCE near the app root
 * to keep `document.title` in sync on every navigation; call it on a detail page
 * and use `setRecordTitle()` to feed the real record name into the title +
 * trailing breadcrumb.
 *
 *   // App root:
 *   useRouteMeta() // → document.title follows the route
 *
 *   // Detail page:
 *   const { setRecordTitle } = useRouteMeta()
 *   watch(() => doc.value?.title, (t) => t && setRecordTitle(t))
 *
 * @param {Object} [options]
 * @param {Record<string, object>} [options.registry]  defaults to ROUTE_META
 * @param {object} [options.route]                      injected for testing
 * @param {boolean} [options.syncTitle]                 keep document.title in sync (default true)
 */
export function useRouteMeta(options = {}) {
  const { registry = ROUTE_META, syncTitle = true } = options
  const route = options.route ?? useRoute()

  const recordTitle = ref(null)
  function setRecordTitle(t) {
    recordTitle.value = t || null
  }

  const ctx = computed(() => ({ recordTitle: recordTitle.value }))
  const resolved = computed(() => resolveRouteMeta(registry, route.path))
  const meta = computed(() => resolved.value?.meta ?? null)
  const icon = computed(() => meta.value?.icon ?? null)
  const title = computed(() => {
    if (!meta.value) return null
    const t = meta.value.title
    return typeof t === 'function' ? t(resolved.value.params, ctx.value) : t
  })
  const breadcrumbs = computed(() => buildBreadcrumbs(registry, route.path, ctx.value))

  if (syncTitle) {
    watch(
      title,
      (t) => {
        if (typeof document !== 'undefined') {
          document.title = t ? `${t} · ${APP_NAME}` : APP_NAME
        }
      },
      { immediate: true },
    )
  }

  return { meta, title, icon, breadcrumbs, recordTitle, setRecordTitle }
}
