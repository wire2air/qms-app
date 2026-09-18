<script setup>
/** Row-density picker: compact / cozy / comfortable. Two-way binds the density model. */
import { IconLineHeight, IconCheck } from '@tabler/icons-vue'

const model = defineModel({ type: String, default: 'comfortable' })

const OPTIONS = [
  { value: 'compact', label: 'Compact' },
  { value: 'cozy', label: 'Cozy' },
  { value: 'comfortable', label: 'Comfortable' },
]
</script>

<template>
  <BasePopover placement="bottom-end">
    <template #button>
      <button
        type="button"
        title="Row density"
        class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
      >
        <IconLineHeight :size="16" />
        <span class="tw:hidden sm:tw:inline">Density</span>
      </button>
    </template>
    <template #content>
      <div class="tw:w-40 tw:p-1">
        <button
          v-for="opt in OPTIONS"
          :key="opt.value"
          type="button"
          class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:transition-colors tw:hover:bg-main-hover"
          @click="model = opt.value"
        >
          <span>{{ opt.label }}</span>
          <IconCheck v-if="model === opt.value" :size="15" class="tw:shrink-0 tw:text-primary" />
        </button>
      </div>
    </template>
  </BasePopover>
</template>
