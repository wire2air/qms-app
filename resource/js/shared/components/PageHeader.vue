<script setup>
/**
 * PageHeader — the page's identity in the top app bar. It teleports an
 * icon + title into the bar's left zone (#main-header-title) and any actions
 * into the bar's right zone (#main-header-actions). The global search sits
 * centered between the two zones (see MainHeader.vue).
 *
 * Render it (conventionally) as the FIRST child of <BasePage>; it produces no
 * in-body output — everything teleports into MainHeader, so every page's title
 * and actions land in the exact same place.
 *
 *   <PageHeader :icon="IconUsers" title="Users">
 *     <template #actions><BaseButton @click="create">Create User</BaseButton></template>
 *   </PageHeader>
 *
 * `subtitle` is accepted for API stability (pages pass it) but intentionally not
 * shown in the compact bar.
 */
defineProps({
  // A @tabler/icons-vue component, imported by the consumer.
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  // Accepted but not rendered in the compact top bar.
  subtitle: { type: String, default: '' },
  iconSize: { type: Number, default: 22 },
})
</script>

<template>
  <SafeTeleport to="#main-header-title">
    <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:text-on-sidebar">
      <component
        :is="icon"
        v-if="icon"
        :size="iconSize"
        class="tw:shrink-0 tw:text-primary"
        aria-hidden="true"
      />
      <h1 class="tw:truncate tw:text-section-title tw:font-semibold tw:tracking-tight">
        <slot name="title">{{ title }}</slot>
      </h1>
    </div>
  </SafeTeleport>

  <SafeTeleport v-if="$slots.actions" to="#main-header-actions">
    <slot name="actions" />
  </SafeTeleport>
</template>
