<script setup>
/**
 * Fixed-enum status picker (static items). Used on the detail header to change
 * an event's lifecycle state.
 */
import { QUALITY_EVENT_STATUSES } from '@/utils/qualityEventStatuses'

defineProps({
  required: { type: Boolean, default: true },
})

const modelValue = defineModel({ type: [String, null], default: null })
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="QUALITY_EVENT_STATUSES"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :clearable="!required"
    nullLabel="All"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <QualityEventStatusBadgeById
          v-for="o in options"
          :key="o.value"
          :statusId="o.value"
          :clearable="false"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
