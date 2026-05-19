/**
 * Print module registry.
 *
 * Each entry maps a module name (case-insensitive) → a loader that returns
 * the print component. The print component is self-contained: it reads its
 * own query params via useRoute, fetches its own data, and wraps content
 * in PrintLayout for the shared chrome.
 *
 * To add a new printable module:
 *   1. Drop a `XPrint.vue` file next to this index.
 *   2. Register it below.
 *   3. On the entity's detail page, link to `/<companyCode>/print?module=X&id=...`
 *
 * Dynamic imports keep each module's data fetching out of the print-bundle
 * boot path — only the requested module loads.
 */
export const printModules = {
  Document: () => import('./DocumentPrint.vue'),
  // Future:
  // Capa: () => import('./CapaPrint.vue'),
  // Nonconformance: () => import('./NonconformancePrint.vue'),
}

export function resolveModule(name) {
  if (!name) return null
  // Case-insensitive lookup so the URL is forgiving.
  for (const key of Object.keys(printModules)) {
    if (key.toLowerCase() === String(name).toLowerCase()) {
      return { key, load: printModules[key] }
    }
  }
  return null
}

export function listModules() {
  return Object.keys(printModules)
}
