<script setup>
import {
  IconLayoutKanban,
  IconCalendar,
  IconStar,
  IconStarFilled,
  IconCopy,
} from '@tabler/icons-vue'
defineProps({
  workflow: {
    type: Object,
    required: true,
  },
  canClone: {
    type: Boolean,
    default: false,
  },
})
defineEmits(['setDefault', 'clone'])
</script>

<template>
  <div
    class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-xl tw:p-4 tw:cursor-pointer tw:transition-all tw:duration-200 tw:hover:border-primary tw:hover:shadow-md"
  >
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconLayoutKanban :size="22" />
        </div>
        <div>
          <div class="tw:font-bold tw:text-on-main">
            {{ workflow.name }}
            <span
              v-if="workflow.isDefault"
              class="tw:ml-1 tw:text-micro tw:font-semibold tw:px-1.5 tw:py-0.5 tw:rounded tw:bg-primary/10 tw:text-primary tw:align-middle"
            >
              Default
            </span>
          </div>
        </div>
      </div>
      <div class="tw:flex tw:items-center tw:gap-1">
        <!-- Clone — copies the template (newest version's steps) into a new
             draft workflow. -->
        <button
          v-if="canClone"
          class="tw:p-1.5 tw:rounded tw:bg-transparent tw:border-0 tw:cursor-pointer tw:transition-colors tw:text-secondary tw:hover:text-primary"
          title="Clone this workflow"
          @click.stop="$emit('clone', workflow)"
        >
          <IconCopy :size="16" />
        </button>
        <!-- Default toggle — the module's default workflow is auto-selected
             when users create a new entity. -->
        <button
          class="tw:p-1.5 tw:rounded tw:bg-transparent tw:border-0 tw:cursor-pointer tw:transition-colors"
          :class="workflow.isDefault ? 'tw:text-amber-500' : 'tw:text-secondary tw:hover:text-amber-500'"
          :title="workflow.isDefault ? 'Default workflow for this module' : 'Set as default for this module'"
          @click.stop="$emit('setDefault', workflow)"
        >
          <component :is="workflow.isDefault ? IconStarFilled : IconStar" :size="16" />
        </button>
        <WorkflowVersionStatusBadgeById :statusId="workflow.statusId" />
      </div>
    </div>

    <div v-if="workflow.description" class="tw:text-sm tw:text-secondary tw:mb-3 tw:line-clamp-2">
      {{ workflow.description }}
    </div>

    <div class="tw:flex tw:items-center tw:gap-4 tw:text-xs tw:text-secondary">
      <span class="tw:flex tw:items-center tw:gap-1">
        <IconCalendar :size="16" />
        {{ workflow.createdAt?.toFormat ? workflow.createdAt.toFormat('dd MMM yyyy') : '' }}
      </span>
    </div>
  </div>
</template>
