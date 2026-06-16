<script setup>
import { IconDotsVertical } from '@tabler/icons-vue'

defineProps({
  /** @type {import('vue').PropType<Array<{as?: string, name: string, click: () => {}}>>} */
  items: {
    type: Array,
    default: () => [],
  },
})
</script>

<template>
  <BasePopover placement="bottom-end" :shift="8">
    <template #button>
      <slot name="trigger">
        <button
          aria-label="More actions"
          class="tw:flex tw:items-center tw:justify-center tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-sidebar-hover tw:hover:text-on-sidebar tw:transition-colors tw:duration-150"
        >
          <IconDotsVertical :size="16" />
        </button>
      </slot>
    </template>

    <template #content="{ close }">
      <slot name="items">
        <div class="tw:flex tw:flex-col tw:py-1">
          <button
            v-for="item in items"
            :key="item.name"
            :disabled="item.disabled"
            :title="item.title"
            :class="[
              'tw:group tw:flex tw:w-full tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:transition-colors tw:duration-100',
              item.disabled
                ? 'tw:text-secondary tw:opacity-50 tw:cursor-not-allowed'
                : 'tw:text-on-sidebar tw:hover:bg-main-hover tw:hover:text-on-main',
            ]"
            @click="
              () => {
                if (item.disabled) return
                item.click()
                close()
              }
            "
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              :size="15"
              class="tw:shrink-0 tw:text-secondary tw:group-hover:text-on-main"
            />
            {{ item.name }}
          </button>
        </div>
      </slot>
    </template>
  </BasePopover>
</template>
