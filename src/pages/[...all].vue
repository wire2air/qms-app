<script setup>
defineOptions({
  name: 'ErrorNotFound',
})
</script>

<template>
  <div
    class="tw:fixed tw:inset-0 tw:bg-primary tw:text-on-primary tw:flex tw:items-center tw:justify-center tw:text-center tw:p-6"
  >
    <div class="tw:flex tw:flex-col tw:items-center tw:gap-8">
      <div class="tw:text-[30vh] tw:font-bold tw:leading-none tw:opacity-20">404</div>

      <div class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-secondary">Oops. Nothing here...</div>

      <RouterLink
        to="/"
        class="tw:mt-8 tw:px-8 tw:font-bold tw:inline-flex tw:items-center tw:justify-center tw:h-12 tw:bg-white tw:text-primary tw:rounded-lg tw:text-lg tw:hover:bg-gray-100 tw:transition-colors"
      >
        Go Home
      </RouterLink>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
</route>
