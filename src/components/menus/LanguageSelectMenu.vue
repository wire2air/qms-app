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
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :clearable="!required"
    nullLabel="— All languages —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <LanguageBadge
          v-for="o in options"
          :key="o.value"
          :languageId="o.value"
          :clearable="false"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
