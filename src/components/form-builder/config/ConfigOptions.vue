<script setup>
import { IconTrash, IconPlus } from '@tabler/icons-vue'
import { db } from '@models/index'
import { GROUP_TYPE_OPTIONS } from '@/constants/formBuilderConfig'

const field = defineModel('field', {
  type: Object,
  required: true,
})

const useCustomOptions = ref(!field.value.optionSetId)

if (!field.value.options) {
  field.value.options = []
}

const groupTypeItems = computed(() =>
  GROUP_TYPE_OPTIONS.map((opt) => ({ id: opt.value, name: opt.label })),
)

watch(useCustomOptions, (val) => {
  if (val) {
    field.value.optionSetId = null
    if (field.value.optionSet) delete field.value.optionSet
  } else {
    field.value.options = []
  }
})

// Embed an OptionSet snapshot onto the field whenever the admin picks
// one. Pairs with the OptionSetSelect / OptionSetOptionGroup /
// FormSchemaReadonlyView "prefer embedded over FK" reads — lets
// supplier users render the form without optionSets:read RLS and
// locks the option list at workflow-creation time so editing the
// underlying OptionSet doesn't silently reshape in-flight forms.
watch(
  () => field.value?.optionSetId,
  async (id) => {
    if (!id) {
      if (field.value?.optionSet) delete field.value.optionSet
      return
    }
    const set = await db.OptionSet.findByPk(id)
    if (!set) return
    field.value.optionSet = {
      id: set.id,
      name: set.name,
      options: set.options,
    }
  },
  { immediate: true },
)

function addOption() {
  if (!field.value.options) {
    field.value.options = []
  }
  field.value.options.push('')
}

function removeOption(index) {
  field.value.options.splice(index, 1)
}
</script>

<template>
  <div>
    <div v-if="field.type === 'optionGroup'" class="tw:mb-4">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <BaseSelectMenu v-model="field.groupType" :items="groupTypeItems" :required="true" />
        <BaseCheckbox v-model="field.inline" label="Horizontal Alignment" />
      </div>
    </div>
    <!-- Option Source Toggle -->
    <div class="tw:mb-4">
      <BaseCheckbox v-model="useCustomOptions" label="Use Custom Options" />
    </div>

    <!-- Option Set Selector -->
    <div v-if="!useCustomOptions" class="tw:mb-4">
      <OptionSetSelectMenu v-model="field.optionSetId" :required="false" />
    </div>

    <!-- Custom Options Manager -->
    <div v-else class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:text-sm tw:text-secondary tw:font-medium">Options</div>
      <div
        v-for="(option, index) in field.options"
        :key="index"
        class="tw:bg-main-hover tw:p-2 tw:rounded-lg"
      >
        <div class="tw:flex tw:gap-2 tw:items-center">
          <div class="tw:flex-1">
            <BaseTextInput v-model="field.options[index]" placeholder="Option" />
          </div>
          <button
            class="tw:p-1.5 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
            @click="removeOption(index)"
          >
            <IconTrash :size="16" />
          </button>
        </div>
      </div>
      <button
        class="tw:mt-1 tw:self-start tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
        @click="addOption"
      >
        <IconPlus :size="14" />
        Add Option
      </button>
    </div>
  </div>
</template>
