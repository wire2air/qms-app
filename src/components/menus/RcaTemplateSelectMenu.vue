<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const templates = useLiveQuery((db) => db.RcaTemplate.where().exec(), {
  models: ['RcaTemplate'],
  initial: [],
})

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
            <RcaTemplateBadgeById
              v-for="id in getArray()"
              :key="id"
              :templateId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >— All RCA templates —</span
          >
        </template>
        <template v-else>
          <RcaTemplateBadgeById
            v-if="modelValue"
            :templateId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >— All RCA templates —</span
          >
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
