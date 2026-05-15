<script setup>
import { IconSearch } from '@tabler/icons-vue'

const filters = defineModel('filters', { type: Object, required: true })
const activeFilter = defineModel('activeFilter', { type: String, required: true })

const filterPills = [
  { value: 'all_open', label: 'All open' },
  { value: 'mine', label: 'My CAPAs' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'closed', label: 'Closed' },
]
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div class="tw:bg-main-hover tw:rounded-lg">
      <div class="tw:flex tw:items-center tw:p-2 tw:gap-2 tw:flex-wrap">
        <div class="tw:w-full tw:md:w-1/3 tw:relative">
          <IconSearch
            :size="16"
            class="tw:absolute tw:left-2 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
          />
          <BaseTextInput
            v-model="filters.search"
            placeholder="Search CAPA number, title…"
            class="tw:pl-7"
          />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <CapaStatusSelectMenu v-model="filters.statusId" />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <CapaPrioritySelectMenu v-model="filters.priorityId" />
        </div>
        <div class="tw:w-full tw:md:w-1/6">
          <CapaTypeSelectMenu v-model="filters.typeId" />
        </div>
      </div>
    </div>
    <div class="tw:flex tw:gap-2 tw:flex-wrap tw:items-center">
      <button
        v-for="pill in filterPills"
        :key="pill.value"
        class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
        :class="
          activeFilter === pill.value
            ? 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-300'
            : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
        "
        @click="activeFilter = pill.value"
      >
        {{ pill.label }}
      </button>
    </div>
  </div>
</template>
