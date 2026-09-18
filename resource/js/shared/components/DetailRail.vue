<script setup>
defineProps({
  railCards: { type: Array, default: () => [] },
})
const slots = useSlots()
const useSlot = computed(() => !!slots.default)
</script>

<template>
  <aside aria-label="Details" class="tw:flex tw:flex-col tw:gap-4">
    <slot v-if="useSlot" />
    <template v-else>
      <BaseRailCard
        v-for="card in railCards"
        :key="card.id"
        :title="card.title"
        :icon="card.icon || null"
        :collapsible="card.collapsible !== false"
      >
        <dl class="tw:flex tw:flex-col tw:gap-1.5 tw:text-body">
          <div
            v-for="(row, i) in card.items || []"
            :key="i"
            class="tw:flex tw:items-baseline tw:justify-between tw:gap-3"
          >
            <dt class="tw:text-secondary">{{ row.label }}</dt>
            <dd class="tw:text-right tw:font-medium">{{ row.value }}</dd>
          </div>
        </dl>
      </BaseRailCard>
    </template>
  </aside>
</template>
