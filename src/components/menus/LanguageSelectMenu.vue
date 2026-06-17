<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, null],
  default: null,
})

const items = computed(() => [
  { id: 'en-US', name: 'English (US)' },
  { id: 'en-GB', name: 'English (UK)' },
  { id: 'es', name: 'Spanish' },
  { id: 'fr', name: 'French' },
  { id: 'de', name: 'German' },
  { id: 'it', name: 'Italian' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'zh', name: 'Chinese' },
  { id: 'ja', name: 'Japanese' },
])
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="items" nullLabel="— All languages —" :required="required">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <LanguageBadge
          v-if="modelValue"
          :languageId="modelValue"
          :clearable="!required"
          selectable
          @clear="() => scope.clear(modelValue)"
        />
        <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> Select Language </span>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
