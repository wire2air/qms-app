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
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-4">
      <div class="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
        <BaseAvatar v-if="isFull && (avatarName || icon)" :name="avatarName || title" shape="square" size="md" />
        <component :is="icon" v-else-if="icon" :size="22" aria-hidden="true" />
        <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
          <slot name="title">
            <h1 class="tw:truncate tw:text-section-title tw:font-bold tw:text-on-main">{{ title }}</h1>
          </slot>
          <slot name="status" />
        </div>
      </div>
      <div class="tw:shrink-0">
        <slot name="actions"><DetailActionBar :actions="actions" /></slot>
      </div>
    </div>
    <p v-if="isFull" class="tw:text-body tw:text-secondary">
      <slot name="meta" />
    </p>
  </header>
</template>
