<script setup>
import { IconCirclePlus, IconInfoCircle } from '@tabler/icons-vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { useRoles } from '@/composables/useRoles.js'

const show = defineModel({ type: Boolean, default: false })

const { roles, createRole } = useRoles()

const form = ref({
  name: '',
  description: '',
  copyFromRoleId: 'custom',
})

const rules = computed(() => ({
  name: { required: helpers.withMessage('Role name is required', required) },
}))

const validator = useValidator(rules, form)

const loading = ref(false)

// Computed options for the "Copy from" select
const copyFromOptions = computed(() => {
  const options = [
    {
      label: 'Custom',
      value: 'custom',
      description: 'Start with no permissions',
    },
    ...roles.value.map((role) => ({
      label: role.name,
      value: role.id,
      description: role.description || 'No description provided',
    })),
  ]

  return options
})

// Get permission IDs from selected role
const selectedRolePermissions = computed(() => {
  if (form.value.copyFromRoleId === 'custom') {
    return []
  }

  const selectedRole = roles.value.find((role) => role.id === form.value.copyFromRoleId)
  if (!selectedRole || !selectedRole.permissionAssignments) {
    return []
  }

  return selectedRole.permissionAssignments.map((pa) => pa.permissionId)
})

async function handleSubmit() {
  const valid = await validator.value.$validate()
  if (!valid) return

  loading.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || '',
      statusId: 'ACTIVE',
      permissionIds: selectedRolePermissions.value,
    }

    const result = await createRole(payload)

    if (result.success) {
      show.value = false
      form.value = {
        name: '',
        description: '',
        copyFromRoleId: 'custom',
      }
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Create Role" :loading="loading" @close="show = false">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-5">
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconCirclePlus :size="24" />
        </div>
        <div class="tw:text-2xl tw:font-bold tw:text-on-main">Create Role</div>
      </div>

      <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
        Define a new role with specific permissions to control access to features and data.
      </div>

      <div class="tw:flex tw:flex-col tw:gap-4" @keydown.enter.prevent="handleSubmit">
        <BaseTextInput
          v-model="form.name"
          name="name"
          label="Role Name"
          placeholder="e.g., Field Supervisor"
          autofocus
        />

        <BaseTextarea
          v-model="form.description"
          label="Description"
          placeholder="Describe the purpose and responsibilities of this role"
          class="tw:min-h-24"
        />

        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1"
            >Copy From</label
          >
          <BaseSelectMenu
            v-model="form.copyFromRoleId"
            :items="
              copyFromOptions.map((o) => ({
                id: o.value,
                name: o.label,
                description: o.description,
              }))
            "
            :required="true"
          >
            <template #button>
              <span class="tw:text-sm tw:font-medium">
                {{
                  copyFromOptions.find((o) => o.value === form.copyFromRoleId)?.label || 'Select...'
                }}
              </span>
            </template>
          </BaseSelectMenu>
        </div>

        <div
          v-if="form.copyFromRoleId !== 'custom'"
          class="tw:text-xs tw:text-secondary tw:bg-primary/5 tw:p-3 tw:rounded-lg"
        >
          <div class="tw:flex tw:items-center tw:gap-2">
            <IconInfoCircle :size="16" class="tw:text-primary" />
            <span>
              {{ selectedRolePermissions.length }} permission{{
                selectedRolePermissions.length !== 1 ? 's' : ''
              }}
              will be copied from the selected role
            </span>
          </div>
        </div>
      </div>

      <div class="tw:flex tw:justify-end tw:gap-3 tw:mt-2">
        <button
          class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:border tw:border-divider tw:rounded-lg tw:cursor-pointer tw:hover:bg-main-hover tw:transition-colors"
          @click="show = false"
        >
          Cancel
        </button>
        <button
          class="tw:px-6 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
          :disabled="loading"
          @click="handleSubmit"
        >
          <BaseSpinner v-if="loading" size="sm" color="white" class="tw:mr-2" />
          Create Role
        </button>
      </div>
    </div>
  </BaseDialog>
</template>
