<script setup>
import { IconCirclePlus, IconInfoCircle } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'
import { useRoles } from '@/composables/useRoles.js'

const emit = defineEmits(['created'])

const show = defineModel({ type: Boolean, default: false })

const { roles, createRole } = useRoles()

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

const form = ref({
  name: '',
  description: '',
  copyFromRoleId: 'custom',
})

// Computed options for the "Copy from" select
const copyFromOptions = computed(() => [
  {
    id: 'custom',
    name: 'Custom',
    description: 'Start with no permissions',
  },
  ...roles.value.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description || 'No description provided',
  })),
])

// Permission IDs to copy from the selected role
const selectedRolePermissions = computed(() => {
  if (form.value.copyFromRoleId === 'custom') return []
  const selectedRole = roles.value.find((role) => role.id === form.value.copyFromRoleId)
  return selectedRole?.permissionAssignments?.map((pa) => pa.permissionId) ?? []
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || '',
      statusId: 'ACTIVE',
      permissionIds: selectedRolePermissions.value,
    }
    const result = await createRole(payload)
    if (result?.success) {
      emit('created', result.role)
      show.value = false
    } else {
      saveError.value = 'Failed to create role'
    }
  } catch (err) {
    saveError.value = err?.message || 'Failed to create role'
  } finally {
    isSubmitting.value = false
  }
}

// Reset form when dialog closes
watch(show, (val) => {
  if (!val) {
    form.value = { name: '', description: '', copyFromRoleId: 'custom' }
    saveError.value = ''
  }
})
</script>

<template>
  <BaseDialog v-model="show" maxWidth="md">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconCirclePlus class="tw:size-5 tw:text-primary" />
        </div>
        <span>Create Role</span>
      </div>
    </template>

    <div class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:mb-2">
      Define a new role with specific permissions to control access to features and data.
    </div>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField
        label="Role Name"
        required
        :value="form.name"
        :rules="[required('Role name is required')]"
      >
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g., Field Supervisor"
            autofocus
          />
        </template>
      </BaseField>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        placeholder="Describe the purpose and responsibilities of this role"
        class="tw:min-h-24"
      />

      <BaseField label="Copy From">
        <BaseSelectMenu v-model="form.copyFromRoleId" :items="copyFromOptions" :required="true">
          <template #button>
            <span class="tw:text-sm tw:font-medium">
              {{ copyFromOptions.find((o) => o.id === form.copyFromRoleId)?.name || 'Select...' }}
            </span>
          </template>
        </BaseSelectMenu>
      </BaseField>

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
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Create Role"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
