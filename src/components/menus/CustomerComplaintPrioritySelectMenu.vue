<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  // "— All priorities —" for filter bars; pass "— Select —" in forms.
  nullLabel: { type: String, default: '— All priorities —' },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const items = [
  { id: 'LOW', name: 'Low' },
  { id: 'MEDIUM', name: 'Medium' },
  { id: 'HIGH', name: 'High' },
  { id: 'CRITICAL', name: 'Critical' },
]
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <CustomerComplaintPriorityBadgeById
          v-for="o in options"
          :key="o.value"
          :priorityId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
