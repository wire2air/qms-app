<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

// Only ACTIVE templates are attachable — drafts/archived can't back a
// public form.
const templates = useLiveQuery(
  async (db) => {
    const rows = await db.FormTemplate.where('statusId', 'ACTIVE').exec()
    return rows
      .map((t) => ({ id: t.id, name: t.title || t.code }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  { models: ['FormTemplate'], initial: [] },
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
            <FormTemplateBadgeById
              v-for="id in getArray()"
              :key="id"
              :formTemplateId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">— All forms —</span>
        </template>
        <template v-else>
          <FormTemplateBadgeById
            v-if="modelValue"
            :formTemplateId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            — All forms —
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
