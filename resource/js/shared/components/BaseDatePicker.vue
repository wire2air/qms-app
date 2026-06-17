<script setup>
import { DateTime } from 'luxon'
import { IconCalendar, IconChevronDown } from '@tabler/icons-vue'

const props = defineProps({
  firstDayOfWeek: {
    type: Number,
    default: 2,
  },
  minDate: {
    type: [Object, undefined],
    default: undefined,
  },
  maxDate: {
    type: [Object, undefined],
    default: undefined,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  showShortcuts: {
    type: Boolean,
    default: true,
  },
})

const modelValue = defineModel({
  type: [DateTime, null],
  default: null,
})

const nativeDate = computed({
  get() {
    return modelValue.value?.toJSDate?.() ?? null
  },
  set(val) {
    modelValue.value = val ? DateTime.fromJSDate(val) : null
  },
})
</script>

<template>
  <BaseDatePickerDropMenu
    v-model:selectedDate="nativeDate"
    :minDate="props.minDate"
    :maxDate="props.maxDate"
    :showShortcuts="props.showShortcuts"
    :firstDayOfWeek="firstDayOfWeek"
  >
    <template #button="{ open }">
      <button
        :disabled="disabled"
        tabindex="0"
        class="tw:flex tw:h-8 tw:shrink-0 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:disabled:cursor-default tw:focus:ring-2 tw:focus:ring-primary/20 tw:focus:ring-offset-2 tw:focus:outline-none tw:transition-[border,background-color,color,box-shadow] tw:duration-300"
        :class="{
          'tw:hover:border-divider-hover tw:hover:bg-sidebar-hover': !open && !disabled,
          'tw:border-primary tw:bg-sidebar-hover tw:ring-2 tw:ring-primary/20': open,
        }"
      >
        <IconCalendar :size="16" />

        <span class="tw:whitespace-nowrap tw:text-sm">
          {{ modelValue ? modelValue.formatDate('date') : 'Select date' }}
        </span>

        <IconChevronDown class="tw:-mr-1 tw:size-3" />
      </button>
    </template>
  </BaseDatePickerDropMenu>
</template>
