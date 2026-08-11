<script setup>
/**
 * Route wrapper for /sites.
 *
 * There is no detail route for Sites — `src/pages/sites.vue` renders this with
 * no props and no child route is registered — so the `id` prop and the
 * `<RouterView v-else>` branch that consumed it were unreachable and have been
 * removed. Add them back alongside a real child route, not before.
 */
</script>

<template>
  <SitesHome />
</template>
