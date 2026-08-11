<script setup>
/**
 * SiteBadgeById — resolves a site id and renders SiteBadge.
 *
 * Three states, deliberately distinct:
 *
 *   unresolved (undefined) — the live query hasn't answered yet. Render
 *     nothing, so the badge doesn't flash a dash on every page load.
 *   resolved to a site      — render the badge.
 *   resolved to nothing     — the id points at a site that is soft-deleted or
 *     otherwise not in IndexedDB. Render the `—` fallback.
 *
 * That last case used to render NOTHING at all (`v-if="site"`): a deleted site
 * left a completely empty field across 13 read-only display sites — not
 * "Unknown", not the raw id, just blank, indistinguishable from "no site set".
 * Only QualityEventsPageId defended against it, with its own re-resolve and a
 * local `—`. This is that fallback, moved to where every consumer gets it.
 */
// Three possible roots (badge / fallback / nothing) means Vue can't decide
// where to put fallthrough attrs on its own — the badge branch binds them
// explicitly, exactly as before.
defineOptions({ inheritAttrs: false })

const props = defineProps({
  siteId: {
    type: String,
    default: null,
  },
})

// Sentinel for "the query ran and found no site", which must not be confused
// with `undefined` ("the query hasn't run yet").
const MISSING = Symbol('missing-site')

const site = useLiveQueryWithDeps(
  [() => props.siteId],
  async (db, [siteId]) => {
    if (!siteId) return null
    return (await db.Site.findByPk(siteId)) ?? MISSING
  },

  { models: ['Site'], initial: undefined },
)

const resolvedSite = computed(() => (site.value && site.value !== MISSING ? site.value : null))
const isMissing = computed(() => site.value === MISSING)
</script>

<template>
  <SiteBadge v-if="resolvedSite" :site="resolvedSite" v-bind="$attrs" />
  <BaseText
    v-else-if="isMissing"
    color="secondary"
    title="This site is no longer available — it may have been deleted."
    >—</BaseText
  >
</template>
