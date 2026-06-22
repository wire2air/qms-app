<!-- DetailActionBar.vue -->
<script setup>
// useDetailLayout is auto-imported (resource/js/shared/composables is in AutoImport.dirs).
const props = defineProps({
  actions: { type: Array, default: () => [] },
  maxVisible: { type: Number, default: 3 },
})

const { actionBuckets } = useDetailLayout({
  loading: false,
  actions: () => props.actions,
  maxVisibleActions: props.maxVisible,
})

const overflowItems = computed(() =>
  actionBuckets.value.overflow.map((a) => ({
    name: a.label,
    icon: a.icon,
    disabled: a.disabled,
    click: () => a.onSelect && a.onSelect(),
  })),
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <BaseButton
      v-for="a in actionBuckets.visible"
      :key="a.id"
      :variant="a.variant"
      size="sm"
      :loading="a.loading"
      :disabled="a.disabled"
      :as="a.to ? 'RouterLink' : 'button'"
      :to="a.to || undefined"
      @click="a.onSelect && a.onSelect()"
    >
      <component :is="a.icon" v-if="a.icon" :size="16" aria-hidden="true" />
      {{ a.label }}
    </BaseButton>
    <BaseMenu v-if="overflowItems.length" :items="overflowItems" />
  </div>
</template>
