<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

// Only PUBLISHED templates can be attached to new documents. DRAFT templates
// are not yet usable; ARCHIVED templates are read-only and not re-attachable.
const templates = useLiveQuery(
  async (db) => db.DocumentTemplate.where('statusId', 'PUBLISHED').exec(),

  { models: ['DocumentTemplate'], initial: [] },
)

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="templates" :required="required" :multiple="multiple">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <DocumentTemplateBadgeById
              v-for="templateId in getArray()"
              :key="templateId"
              :documentTemplateId="templateId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(templateId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Templates
          </span>
        </template>
        <template v-else>
          <DocumentTemplateBadgeById
            v-if="modelValue"
            :documentTemplateId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Template
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
