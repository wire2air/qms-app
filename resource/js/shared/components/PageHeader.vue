<script setup>
/**
 * PageHeader — the page title block teleported into the app header.
 *
 * Replaces the copy-pasted
 *   <SafeTeleport to="#main-header-title">
 *     <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
 *       <IconX class="tw:text-primary" :size="24" />
 *       <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Title</h2>
 *     </div>
 *   </SafeTeleport>
 * found in ~73 page components.
 *
 * Icons are NOT auto-imported — pass the imported component:
 *   <PageHeader :icon="IconBuilding" title="Departments" />
 *
 * Optional #actions slot teleports into #main-header-actions (the header's
 * right-hand action area).
 */
defineProps({
  // An @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  iconSize: { type: Number, default: 24 },
})
</script>

<template>
  <SafeTeleport to="#main-header-title">
    <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
      <component :is="icon" v-if="icon" class="tw:text-primary" :size="iconSize" />
      <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">
        <slot name="title">{{ title }}</slot>
      </h2>
    </div>
  </SafeTeleport>

  <SafeTeleport v-if="$slots.actions" to="#main-header-actions">
    <slot name="actions" />
  </SafeTeleport>
</template>
