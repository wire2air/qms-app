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
  // Multi-site variant of siteId (document applicability etc.) — departments
  // of ANY listed site, plus company-wide. Takes precedence over siteId.
  siteIds: {
    type: [Array, null],
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

// No `initial: []` — undefined means "still loading", and the stale-selection
// guard below must not treat a loading list as an empty one (it would wipe a
// legitimate preset value before the first query resolves).
const departments = useLiveQueryWithDeps(
  [() => props.siteId, () => (props.siteIds ? [...props.siteIds] : null)],
  async (db, [siteId, siteIds]) => {
    const all = await db.Department.where().exec()
    // Site filters keep company-wide departments (no site) — they belong to
    // every site, mirroring the RLS baseline (site's departments + site-less).
    if (siteIds?.length) return all.filter((d) => !d.siteId || siteIds.includes(d.siteId))
    if (siteId) return all.filter((d) => d.siteId === siteId || !d.siteId)
    return all
  },
  { models: ['Department'] },
)
const departmentOptions = computed(() => departments.value ?? [])

// A site change can strand a selection that belongs to the OLD site: the
// re-filtered list no longer contains it, so the trigger renders the
// placeholder (looks unselected) while the model still holds the stale id —
// `required()` then passes on the non-null value and the record saves a
// cross-site department (bug report 2026-08-10: NC created "without" a
// department that was actually another site's). Clear anything the loaded
// list doesn't contain; on required selects BaseSelect's auto-fill then
// picks the first valid department of the new site.
watch([departments, modelValue], ([list, value]) => {
  if (!Array.isArray(list) || value == null) return
  if (props.multiple) {
    if (!Array.isArray(value) || !value.length) return
    const valid = value.filter((id) => list.some((d) => d.id === id))
    if (valid.length !== value.length) modelValue.value = valid
  } else if (!list.some((d) => d.id === value)) {
    modelValue.value = null
  }
})

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
        :options="departmentOptions"
        optionLabel="name"
        optionValue="id"
        :nullLabel="resolvedNullLabel"
        :required="props.required"
        :multiple="props.multiple"
        :clearable="!props.required && !props.multiple"
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
