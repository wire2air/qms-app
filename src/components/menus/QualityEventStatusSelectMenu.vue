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
  <BaseSelectMenu v-model="modelValue" :items="QUALITY_EVENT_STATUSES" :required="required">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <QualityEventStatusBadgeById
          v-if="modelValue"
          :statusId="modelValue"
          selectable
        />
        <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Status</span>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
