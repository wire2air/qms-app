<script setup>
import { IconChevronDown, IconHelpCircle } from '@tabler/icons-vue'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: [Object, Function], default: null },
  // Optional purpose tooltip shown as a help icon next to the title (hover /
  // focus). Reuses the shared BaseTooltip — set on any rail card that needs it.
  titleHelp: { type: String, default: '' },
  collapsible: { type: Boolean, default: true },
  defaultOpen: { type: Boolean, default: true },
  // Lay the body fields out in an auto-fit 2-column grid (matches the "General"
  // card). Each field keeps a 8rem min, so it collapses to 1 column when the
  // rail is narrow. Default stacks the fields.
  grid: { type: Boolean, default: false },
})

const open = ref(props.defaultOpen)
const bodyId = `railcard-${Math.random().toString(36).slice(2, 9)}`

function toggle() {
  if (props.collapsible) open.value = !open.value
}
</script>

<template>
  <BaseCard padding="sm" class="tw:flex tw:flex-col tw:gap-2">
    <button
      v-if="collapsible"
      type="button"
      class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="tw:flex tw:items-center tw:gap-2">
        <component :is="icon" v-if="icon" :size="14" aria-hidden="true" />
        {{ title }}
        <BaseTooltip v-if="titleHelp" :content="titleHelp">
          <span
            class="tw:inline-flex tw:cursor-help tw:text-secondary tw:hover:text-on-main"
            @click.stop.prevent
          >
            <IconHelpCircle :size="14" aria-hidden="true" />
          </span>
        </BaseTooltip>
      </span>
      <IconChevronDown
        :size="16"
        class="tw:transition-transform tw:duration-150 tw:motion-reduce:transition-none"
        :class="open ? '' : 'tw:-rotate-90'"
        aria-hidden="true"
      />
    </button>
    <h3
      v-else
      class="tw:flex tw:items-center tw:gap-2 tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
    >
      <component :is="icon" v-if="icon" :size="14" aria-hidden="true" />
      {{ title }}
      <BaseTooltip v-if="titleHelp" :content="titleHelp">
        <span class="tw:inline-flex tw:cursor-help tw:text-secondary tw:hover:text-on-main">
          <IconHelpCircle :size="14" aria-hidden="true" />
        </span>
      </BaseTooltip>
    </h3>
    <div
      v-if="open"
      :id="bodyId"
      :class="
        grid
          ? 'tw:grid tw:gap-x-4 tw:gap-y-3 tw:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]'
          : 'tw:flex tw:flex-col tw:gap-3'
      "
    >
      <slot />
    </div>
  </BaseCard>
</template>
