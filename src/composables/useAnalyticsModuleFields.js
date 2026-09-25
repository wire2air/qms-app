/**
 * The custom-metric field vocabulary, filtered to what this tenant may see.
 *
 * ── WHY THIS IS SHARED AND NOT INLINE ───────────────────────────────────────
 * Extracted from CustomMetricEditor when the metrics LIST grew a preview: both
 * surfaces need `analytics_module_fields` to shape a draft into a catalog row
 * (draftCatalogRow reads `kind`, `groupable` and the source table off these).
 *
 * The filter below is a SECURITY filter, and a second copy of it is the thing
 * to avoid: two copies drift, and the drift shows one tenant another tenant's
 * custom-module fields. One implementation, both callers.
 *
 * ── WHY THIS IS FILTERED, WHEN THE SERVER ALREADY FILTERS ───────────────────
 * analytics_module_fields is GLOBAL — no company_id — because the built-in
 * vocabulary is the same for every tenant. Custom modules broke that premise:
 * theirs belongs to exactly one tenant. The server now gates those rows on
 * ownership of the form template (analytics_module_field_visible, called from
 * analytics_module_fields_select_rls), which is the authoritative fix.
 *
 * This is the second layer, and it is not redundant. These rows live in
 * IndexedDB, which is per-COMPANY but survives a company switch in the same
 * browser profile, so a stale cache can still hold rows the server would no
 * longer serve. Filtering here means a module whose template this tenant does
 * not own can never reach the Module dropdown, cache or no cache.
 *
 * Built-in modules are unaffected: no FormTemplate row names them, so they
 * match the first branch and pass through.
 *
 * ── WHY NO `initial` ────────────────────────────────────────────────────────
 * UNDEFINED is the loading signal callers wait on. CustomMetricBuilder seeds
 * its form from these ONCE, on mount; mounting it while the vocabulary was
 * still empty would seed a form that no later prop change repairs. An `initial:
 * []` would make "still loading" and "loaded, nothing there" the same value.
 *
 * @returns {{
 *   fields: import('vue').ComputedRef<Array|undefined>,
 *   templates: import('vue').Ref<Array|undefined>,
 *   loading: import('vue').ComputedRef<boolean>,
 * }}
 */
export function useAnalyticsModuleFields() {
  const allFields = useLiveQuery(async (db) => db.AnalyticsModuleField.where().exec(), {
    models: 'AnalyticsModuleField',
  })

  // The custom modules THIS tenant owns. Same source the sidebar uses to decide
  // which module nav entries to draw — which is why the nav never leaked.
  // The whole row, not just the key: the builder reads `schema` off these to
  // offer a module's reporting keys as a picker (reportingKeyOptions). Same
  // query, same subscription — the keys below are derived from it rather than
  // fetched a second time.
  const ownModuleTemplates = useLiveQuery(
    async (db) => (await db.FormTemplate.where().exec()).filter((t) => t.isModule && t.internalName),
    { models: 'FormTemplate' },
  )

  const ownModuleKeys = computed(() => (ownModuleTemplates.value || []).map((t) => t.internalName))

  const fields = computed(() => {
    // Preserve undefined: the caller's `loading` depends on it.
    if (allFields.value === undefined) return undefined
    const rows = allFields.value || []
    const mine = new Set(ownModuleKeys.value || [])
    // A module id is "custom" only when some FormTemplate claims it. We cannot
    // ask that of templates we cannot see, so the test is the other way round:
    // keep a row unless its module is a custom one that is NOT ours. Anything
    // built-in, and anything of ours, stays.
    const customSourced = rows.filter((f) => f.sourceTable === 'analytics_field_values')
    const customKeys = new Set(customSourced.map((f) => f.moduleId))
    return rows.filter((f) => !customKeys.has(f.moduleId) || mine.has(f.moduleId))
  })

  const loading = computed(
    () => allFields.value === undefined || ownModuleTemplates.value === undefined,
  )

  return { fields, templates: ownModuleTemplates, loading }
}
