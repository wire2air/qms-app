/**
 * Vue composable — reactive wrapper around the loader manager.
 *
 * Provides Vue `ref` bindings so components get automatic reactivity
 * without the API layer depending on Vue.
 *
 * @example
 *   const { isLoading, isAnyLoading } = useApiLoader()
 *
 *   // Check if 'fetchUsers' loader is active
 *   <BaseSpinner v-if="isLoading('fetchUsers')" size="sm" />
 *
 *   // Global loading indicator
 *   <BaseSpinner v-if="isAnyLoading" />
 */

import { ref, onUnmounted } from 'vue'
import { loader } from './loader.js'

export function useApiLoader() {
  const activeKeys = ref(loader.activeKeys())
  const isAnyLoading = ref(loader.isAnyLoading())

  const off = loader.onChange((keys) => {
    activeKeys.value = keys
    isAnyLoading.value = keys.length > 0
  })

  onUnmounted(off)

  /**
   * Check if a specific loader key is active.
   * @param {string} key
   * @returns {import('vue').ComputedRef<boolean>}
   */
  function isLoading(key) {
    return computed(() => activeKeys.value.includes(key))
  }

  return {
    activeKeys,
    isAnyLoading,
    isLoading,
  }
}
