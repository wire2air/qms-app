<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  siteId: {
    type: [String, null],
    default: null,
  },
  allowCreate: {
    type: Boolean,
    default: true,
  },
  isFilter: {
    type: Boolean,
    default: false,
  },
  nullLabel: {
    type: String,
    default: null,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const departments = useLiveQueryWithDeps(
  [() => props.siteId],
  async (db, [siteId]) => {
    console.debug('Fetching departments for siteId:', siteId)
    if (siteId) return await db.Department.where('siteId', siteId).exec()
    return await db.Department.where().exec()
  },

  { models: ['Department'], initial: [] },
)

const canCreateDepartment = computed(() => props.allowCreate && isAllowed(['departments:create']))

const showCreateDialog = ref(false)

function openCreateDialog(closePopover) {
  closePopover?.()
  showCreateDialog.value = true
}

function onDepartmentCreated(newDept) {
  if (!newDept?.id) return

  if (props.multiple) {
    const arr = Array.isArray(modelValue.value) ? modelValue.value : []
    if (!arr.includes(newDept.id)) {
      modelValue.value = [...arr, newDept.id]
    }
  } else {
    modelValue.value = newDept.id
  }
}

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All departments —' : '— Select department —'),
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <div class="tw:flex-1 tw:min-w-0">
      <BaseSelectMenu
        v-model="modelValue"
        :items="departments"
        :nullLabel="resolvedNullLabel"
        :required="props.required"
        :multiple="props.multiple"
      >
        <template #button="scope">
          <slot name="button" v-bind="scope">
            <!-- MULTIPLE MODE -->
            <template v-if="props.multiple">
              <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
                <DepartmentBadgeById
                  v-for="id in getArray()"
                  :key="id"
                  :departmentId="id"
                  :clearable="!props.required || getArray().length > 1"
                  @clear="() => scope.clear(id)"
                />
              </div>

              <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
                Select Departments
              </span>
            </template>

            <!-- SINGLE MODE -->
            <template v-else>
              <DepartmentBadgeById
                v-if="modelValue"
                :departmentId="modelValue"
                :clearable="!props.required"
                selectable
                @clear="() => scope.clear(modelValue)"
              />
              <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
                Select Department
              </span>
            </template>
          </slot>
        </template>

        <template v-if="canCreateDepartment" #footer="{ close }">
          <button
            type="button"
            class="tw:w-full tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2.5 tw:text-sm tw:font-medium tw:text-primary tw:hover:bg-primary/5 tw:border-t tw:border-divider tw:transition-colors"
            @click="openCreateDialog(close)"
          >
            <IconPlus :size="16" />
            Add New Department
          </button>
        </template>
      </BaseSelectMenu>
    </div>

    <DepartmentsCreateUpdateDialog
      v-if="showCreateDialog"
      v-model="showCreateDialog"
      @created="onDepartmentCreated"
    />
  </div>
</template>
