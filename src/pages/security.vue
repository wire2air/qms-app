<route lang="yaml">
redirect:
  path: /profile
  query:
    tab: security
</route>

<script setup>
// Security is now a tab on the unified /profile page. This route redirects to
// the Personal Security tab (see the <route> block) so password / MFA / sessions
// live in exactly one place. Kept so existing /security bookmarks still work.
defineOptions({ name: 'SecurityRedirect' })
</script>

<template>
  <!-- Never rendered — the route redirects before this mounts. -->
  <div />
</template>
