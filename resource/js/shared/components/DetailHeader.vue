<script setup>
const props = defineProps({
  title: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  avatarName: { type: String, default: '' },
  variant: { type: String, default: 'full', validator: (v) => ['full', 'compact'].includes(v) },
  actions: { type: Array, default: () => [] },
  scrolled: { type: Boolean, default: false },
})
const isFull = computed(() => props.variant === 'full')
</script>

<template>
  <header
    class="tw:flex tw:flex-col tw:gap-2 tw:bg-card tw:px-1 tw:py-3 tw:transition-shadow tw:duration-150 tw:motion-reduce:transition-none"
    :class="scrolled ? 'tw:border-b tw:border-divider tw:shadow-raised' : ''"
  >
    <!-- flex-wrap lets the actions drop to their own full-width row on phones
         (the actions block is max-sm:w-full). On desktop everything fits on one
         line, so nothing wraps and the layout is unchanged. -->
    <div class="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-x-4 tw:gap-y-2">
      <div class="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
        <BaseAvatar v-if="isFull && (avatarName || icon)" :name="avatarName || title" shape="square" size="md" />
        <component :is="icon" v-else-if="icon" :size="22" aria-hidden="true" />
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
          <slot name="title">
            <h1 class="tw:truncate tw:text-section-title tw:font-semibold tw:tracking-tight tw:text-on-main">{{ title }}</h1>
          </slot>
          <slot name="status" />
        </div>
      </div>
      <!-- On phones the actions take their own full-width row and stay
           right-aligned (the menu / overflow button sits on the right). -->
      <div class="tw:shrink-0 tw:max-sm:flex tw:max-sm:w-full tw:max-sm:justify-end">
        <slot name="actions"><DetailActionBar :actions="actions" /></slot>
      </div>
    </div>
    <p v-if="isFull" class="tw:text-body tw:text-secondary">
      <slot name="meta" />
    </p>
  </header>
</template>
