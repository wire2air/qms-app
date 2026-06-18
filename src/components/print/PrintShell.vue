<script setup>
import { defineAsyncComponent } from 'vue'
import { IconAlertTriangle } from '@tabler/icons-vue'
import { resolveModule, listModules } from './modules/index.js'

/**
 * Print dispatcher. Reads ?module= from the route, loads the matching
 * module component, passes through the rest of the query as props.
 *
 * Each module component renders PrintLayout internally + its own body.
 * This shell is intentionally thin — most behaviour lives in PrintLayout
 * (shared chrome) or in the module file (data + body).
 *
 * Hides the global MainHeader while mounted so the printout fills the
 * screen; restores on unmount.
 */
const route = useRoute()

const moduleName = computed(() => {
  const v = route.query?.module
  return typeof v === 'string' ? v : null
})

const ModuleComponent = computed(() => {
  const m = resolveModule(moduleName.value)
  if (!m) return null
  return defineAsyncComponent({ loader: m.load })
})

// Strip 'module' from the params that get forwarded to the module
// component — modules want `id`, `versionId`, etc. but not `module` itself.
const moduleProps = computed(() => {
  const out = {}
  for (const [k, v] of Object.entries(route.query ?? {})) {
    if (k === 'module') continue
    out[k] = v
  }
  return out
})

const pageInfo = usePageInfo()
onMounted(() => {
  if (pageInfo?.value) pageInfo.value.showHeader = false
})
onUnmounted(() => {
  if (pageInfo?.value) pageInfo.value.showHeader = true
})
</script>

<template>
  <component :is="ModuleComponent" v-if="ModuleComponent" v-bind="moduleProps" />
  <div
    v-else
    class="tw:fixed tw:inset-0 tw:z-modal tw:bg-main tw:flex tw:items-center tw:justify-center tw:p-8"
  >
    <div class="tw:max-w-lg tw:rounded-lg tw:border tw:border-divider tw:p-6 tw:bg-sidebar">
      <div class="tw:flex tw:items-start tw:gap-3">
        <IconAlertTriangle :size="22" class="tw:text-amber-600 tw:flex-none tw:mt-0.5" />
        <div>
          <div class="tw:text-base tw:font-semibold tw:text-on-main">Unknown print module</div>
          <div class="tw:text-sm tw:text-secondary tw:mt-1">
            URL must include
            <code class="tw:font-mono tw:bg-main-hover tw:px-1 tw:rounded">?module=…</code>
            with one of:
            <code class="tw:font-mono tw:bg-main-hover tw:px-1 tw:rounded">
              {{ listModules().join(', ') }}
            </code>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
