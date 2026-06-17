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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}

const canCreate = computed(() => props.allowCreate && isAllowed(['company:manage', 'owner']))
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="families"
    :required="required"
    :multiple="multiple"
    v-bind="nullLabel !== undefined ? { nullLabel } : {}"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <ProductFamilyBadgeById
              v-for="id in getArray()"
              :key="id"
              :productFamilyId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Family</span>
        </template>
        <template v-else>
          <ProductFamilyBadgeById
            v-if="modelValue"
            :productFamilyId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Family</span>
        </template>
      </slot>
    </template>

    <template v-if="canCreate" #footer="{ close }">
      <button
        type="button"
        class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
        @click="openCreate(close)"
      >
        <IconPlus :size="16" />
        Add New Family
      </button>
    </template>
  </BaseSelectMenu>

  <ProductFamilyCreateDialog
    v-if="showCreateDialog"
    v-model="showCreateDialog"
    @created="onFamilyCreated"
  />
</template>
