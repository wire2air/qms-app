<script setup>
/**
 * /analytics/browse — the catalog-driven metric browser, formerly /analytics.
 *
 * Removed from the nav on 2026-09-21 in favour of the seeded dashboards
 * (Quality System Overview and its module siblings), which are curated rather
 * than a dump of whatever `metric_catalog()` returns for this caller.
 *
 * The page is KEPT, at its own path, because those boards answer a different
 * question. A dashboard shows the metrics somebody chose; this shows every
 * metric you are allowed to read, which is what you want when you are deciding
 * what to put ON a board, or checking whether a metric exists at all.
 *
 * Reachable from the Dashboards page's "Browse all metrics" action. Not in the
 * sidebar — six analytics entries was already the longest group in the nav.
 */
defineOptions({
  name: 'AnalyticsBrowsePage',
})
</script>

<template>
  <AnalyticsHome />
</template>
