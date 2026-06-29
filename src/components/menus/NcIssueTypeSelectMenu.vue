<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  // Form-style empty prompt (standardized like User/Group menus). The filter
  // "— All issue types —" wording belongs on filter bars, not entry forms.
  nullLabel: { type: String, default: '— Select Issue Type —' },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const issueTypes = useLiveQuery(
  (db) => db.NcIssueType.where().orderBy('displayOrder').exec(),

  { models: ['NcIssueType'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="issueTypes"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <NcIssueTypeBadgeById
          v-for="o in options"
          :key="o.value"
          :issueTypeId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
