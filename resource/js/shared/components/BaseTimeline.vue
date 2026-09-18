<script setup>
/**
 * BaseTimeline — vertical activity/event feed with status-colored nodes and a
 * connector rail. For audit trails, version history, comment threads, workflow
 * progress.
 *
 *   <BaseTimeline :items="events">
 *     <template #item="{ item }">…custom row…</template>
 *   </BaseTimeline>
 *
 * Each item: { title?, subtitle?, time?, icon?, color? }.
 *   color ∈ 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral'
 * Provide a #item slot for custom bodies; otherwise title/subtitle/time render.
 */
const props = defineProps({
  items: { type: Array, default: () => [] },
  // smaller nodes + tighter spacing
  dense: { type: Boolean, default: false },
})

const COLOR = {
  primary: 'tw:bg-primary tw:text-on-primary tw:border-primary',
  success: 'tw:bg-success-500 tw:text-white tw:border-success-500',
  danger: 'tw:bg-danger-500 tw:text-white tw:border-danger-500',
  warning: 'tw:bg-warning-500 tw:text-white tw:border-warning-500',
  info: 'tw:bg-info-500 tw:text-white tw:border-info-500',
  neutral: 'tw:bg-card tw:text-secondary tw:border-divider',
}

function nodeClass(item) {
  return COLOR[item.color] || COLOR.neutral
}

const nodeSize = computed(() => (props.dense ? 'tw:size-6' : 'tw:size-8'))
const iconSize = computed(() => (props.dense ? 13 : 16))
</script>

<template>
  <div class="tw:flex tw:flex-col">
    <div v-for="(item, index) in items" :key="item.id ?? index" class="tw:flex tw:gap-3">
      <!-- Rail -->
      <div class="tw:flex tw:flex-col tw:items-center">
        <div
          class="tw:flex tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:border-2"
          :class="[nodeClass(item), nodeSize]"
        >
          <component :is="item.icon" v-if="item.icon" :size="iconSize" />
          <span v-else :class="dense ? 'tw:size-1.5' : 'tw:size-2'" class="tw:rounded-full tw:bg-current" />
        </div>
        <div
          v-if="index < items.length - 1"
          class="tw:w-0.5 tw:flex-1 tw:rounded-full tw:bg-divider"
        />
      </div>

      <!-- Body -->
      <div class="tw:flex-1" :class="dense ? 'tw:pb-3' : 'tw:pb-5'">
        <slot name="item" :item="item" :index="index">
          <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
            <div class="tw:min-w-0">
              <div v-if="item.title" class="tw:text-sm tw:font-semibold tw:text-on-main">
                {{ item.title }}
              </div>
              <div v-if="item.subtitle" class="tw:mt-0.5 tw:text-xs tw:text-secondary">
                {{ item.subtitle }}
              </div>
            </div>
            <span v-if="item.time" class="tw:shrink-0 tw:text-xs tw:text-secondary tw:whitespace-nowrap">
              {{ item.time }}
            </span>
          </div>
        </slot>
      </div>
    </div>
  </div>
</template>
