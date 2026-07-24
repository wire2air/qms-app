<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  allowCreate: { type: Boolean, default: true },
  nullLabel: { type: String, default: undefined },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const families = useLiveQuery(
  (db) => db.ProductFamily.where().orderBy('displayOrder').exec(),
  { models: ['ProductFamily'], initial: [] },
)

const showCreateDialog = ref(false)

function openCreate(closePopover) {
  closePopover?.()
  showCreateDialog.value = true
}

function onFamilyCreated(newFamily) {
  if (!newFamily?.id) return
  if (props.multiple) {
    const arr = Array.isArray(modelValue.value) ? modelValue.value : []
    if (!arr.includes(newFamily.id)) modelValue.value = [...arr, newFamily.id]
  } else {
    modelValue.value = newFamily.id
  }
}

const canCreate = computed(() => props.allowCreate && isAllowed(['company_settings:manage', 'owner']))
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="families"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel ?? 'All'"
    placeholder="Select group"
  >
    <template v-if="$slots.button" #trigger="scope">
      <slot name="button" v-bind="scope" />
    </template>

    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <ProductFamilyBadgeById
          v-for="o in options"
          :key="o.value"
          :productFamilyId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>

    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreate(close)"
      >
        <IconPlus :size="16" />
        Add New Group
      </button>
    </template>
  </BaseSelect>

  <ProductFamilyCreateDialog
    v-if="showCreateDialog"
    v-model="showCreateDialog"
    @created="onFamilyCreated"
  />
</template>
