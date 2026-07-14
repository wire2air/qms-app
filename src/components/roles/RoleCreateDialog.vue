<script setup>
import { IconCirclePlus, IconInfoCircle } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. Copies the
// source role's scoped permission grants (authz model) into the new role.
import { get, put } from '@/api'

const props = defineProps({
  cloneSource: { type: Object, default: null },
})

const emit = defineEmits(['created'])

const show = defineModel({ type: Boolean, default: false })

const roles = useLiveQuery((db) => db.Role.where().exec(), { models: ['Role'], initial: [] })
const createRole = useLiveMutation(async (db, payload) => {
  const r = db.Role.create(payload)
  await r.save()
  return r
})

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')
const copyCount = ref(0)

const form = ref({
  name: '',
  description: '',
  copyFromRoleId: 'custom',
})

const isClone = computed(() => !!props.cloneSource)

// Block duplicate role names (case-insensitive) before submit.
const nameAvailable = computed(() => {
  const n = form.value.name.trim().toLowerCase()
  if (!n) return true
  return !roles.value.some((r) => (r.name || '').trim().toLowerCase() === n)
})

const nameInUseError = computed(() =>
  form.value.name && !nameAvailable.value ? 'A role with this name already exists' : '',
)

function nameUnique() {
  return nameAvailable.value || 'A role with this name already exists'
}

const copyFromOptions = computed(() => [
  { id: 'custom', name: 'Custom', description: 'Start with no permissions' },
  ...roles.value.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description || 'No description provided',
  })),
])

// Count the source role's scoped permission grants for the hint (authz model).
watch(
  () => form.value.copyFromRoleId,
  async (id) => {
    if (!id || id === 'custom') {
      copyCount.value = 0
      return
    }
    try {
      const src = await get(`/v1/services/authz/roles/${id}/permissions`)
      copyCount.value = (src.permissions || []).length
    } catch {
      copyCount.value = 0
    }
  },
)

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const created = await createRole({
      name: form.value.name.trim(),
      description: form.value.description.trim() || '',
      statusId: 'ACTIVE',
    })
    // Copy the source role's scoped permissions into the new role.
    if (form.value.copyFromRoleId !== 'custom') {
      const src = await get(`/v1/services/authz/roles/${form.value.copyFromRoleId}/permissions`)
      const permissions = (src.permissions || []).map((p) => ({
        module: p.module,
        action: p.action,
        scope: p.scope,
      }))
      if (permissions.length) {
        await put(`/v1/services/authz/roles/${created.id}/permissions`, { permissions })
      }
    }
    emit('created', created)
    show.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to create role'
  } finally {
    isSubmitting.value = false
  }
}

// Prefill on open: a fresh create, or a clone seeded from the source role.
watch(show, (val) => {
  if (!val) return
  if (props.cloneSource) {
    form.value = {
      name: `Copy of ${props.cloneSource.name}`,
      description: props.cloneSource.description || '',
      copyFromRoleId: props.cloneSource.id,
    }
  } else {
    form.value = { name: '', description: '', copyFromRoleId: 'custom' }
  }
  saveError.value = ''
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
        <span>{{ isClone ? 'Clone Role' : 'Create Role' }}</span>
      </div>
    </template>

    <div class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:mb-2">
      {{
        isClone
          ? 'Create a new role that starts from the selected role’s permissions. You can adjust them after.'
          : 'Define a new role with specific permissions to control access to features and data.'
      }}
    </div>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField
        label="Role Name"
        required
        :value="form.name"
        :rules="[required('Role name is required'), nameUnique]"
        :error="nameInUseError"
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
        <BaseSelect
          v-model="form.copyFromRoleId"
          :options="copyFromOptions"
          optionLabel="name"
          optionValue="id"
          :required="true"
          placeholder="Select..."
        />
      </BaseField>

      <div
        v-if="form.copyFromRoleId !== 'custom'"
        class="tw:text-xs tw:text-secondary tw:bg-primary/5 tw:p-3 tw:rounded-lg"
      >
        <div class="tw:flex tw:items-center tw:gap-2">
          <IconInfoCircle :size="16" class="tw:text-primary" />
          <span>
            {{ copyCount }} permission grant{{ copyCount !== 1 ? 's' : '' }} will be copied from the
            selected role
          </span>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isClone ? 'Clone Role' : 'Create Role'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
