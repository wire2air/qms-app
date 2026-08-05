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
    const all = await db.Department.where().exec()
    // Site filter keeps org-wide departments (no site) — they belong to every
    // site, mirroring the RLS baseline (site's departments + site-less ones).
    if (siteId) return all.filter((d) => d.siteId === siteId || !d.siteId)
    return all
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

const resolvedNullLabel = computed(
  () => props.nullLabel ?? (props.isFilter ? '— All departments —' : '— Select department —'),
)
</script>

<template>
  <div class="tw:flex tw:items-center tw:gap-2">
    <div class="tw:flex-1 tw:min-w-0">
      <BaseSelect
        v-model="modelValue"
        :options="departments"
        optionLabel="name"
        optionValue="id"
        :nullLabel="resolvedNullLabel"
        :required="props.required"
        :multiple="props.multiple"
        :clearable="!props.required"
      >
        <template v-if="$slots.button" #trigger="scope">
          <slot name="button" v-bind="scope" />
        </template>

        <template #selected="{ options, remove }">
          <div class="tw:flex tw:flex-wrap tw:gap-1">
            <DepartmentBadgeById
              v-for="o in options"
              :key="o.value"
              :departmentId="o.value"
              :clearable="props.multiple && (!props.required || options.length > 1)"
              @clear="() => remove(o)"
            />
          </div>
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
      </BaseSelect>
    </div>

    <DepartmentsCreateUpdateDialog
      v-if="showCreateDialog"
      v-model="showCreateDialog"
      @created="onDepartmentCreated"
    />
  </div>
</template>
