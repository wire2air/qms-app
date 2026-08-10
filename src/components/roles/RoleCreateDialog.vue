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

// Creating a role is TWO writes over TWO transports — a GraphQL mutation for the
// row, then a REST action RPC for the grants — and a browser cannot wrap them in
// one transaction. So step 2 can fail with step 1 already committed, leaving a
// permission-less role behind. Rather than pretend that didn't happen, we hold
// on to the created role: the dialog stays open, says exactly what state the
// tenant is in, and the submit button becomes a retry of the grant copy alone
// (never a second create — that's what `createdRole` being set prevents).
const createdRole = ref(null)
const grantCopyFailed = ref(false)

const form = ref({
  name: '',
  description: '',
  copyFromRoleId: 'custom',
})

const isClone = computed(() => !!props.cloneSource)

// After a failed grant copy the role already exists, so the button is no longer
// "Create" — it retries the one step that didn't land.
const submitLabel = computed(() => {
  if (grantCopyFailed.value) return 'Retry Copying Permissions'
  return isClone.value ? 'Clone Role' : 'Create Role'
})

// Block duplicate role names (case-insensitive) before submit. The role created
// by a first attempt whose grant copy failed is excluded — it is already in the
// live query, so without this exclusion it would collide with the name in the
// form and the retry could never get past validation.
const nameAvailable = computed(() => {
  const n = form.value.name.trim().toLowerCase()
  if (!n) return true
  return !roles.value.some(
    (r) => r.id !== createdRole.value?.id && (r.name || '').trim().toLowerCase() === n,
  )
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

  // ── Step 1: the role row (GraphQL / syncEngine) ───────────────────────────
  try {
    if (createdRole.value) {
      // Retry after a failed grant copy — the row already exists. Push any edits
      // the user made in the meantime rather than silently discarding them.
      createdRole.value.name = form.value.name.trim()
      createdRole.value.description = form.value.description.trim() || ''
      await createdRole.value.save()
    } else {
      createdRole.value = await createRole({
        name: form.value.name.trim(),
        description: form.value.description.trim() || '',
        statusId: 'ACTIVE',
      })
    }
  } catch (err) {
    isSubmitting.value = false
    saveError.value = err?.message || 'Failed to create role'
    return
  }

  // ── Step 2: the permission grants (REST action RPC) ───────────────────────
  // Already committed above; a failure here CANNOT be rolled back from the
  // browser, so it gets named instead of swallowed.
  if (form.value.copyFromRoleId !== 'custom') {
    try {
      const src = await get(`/v1/services/authz/roles/${form.value.copyFromRoleId}/permissions`)
      const permissions = (src.permissions || []).map((p) => ({
        module: p.module,
        action: p.action,
        scope: p.scope,
      }))
      if (permissions.length) {
        // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
        await put(`/v1/services/authz/roles/${createdRole.value.id}/permissions`, { permissions })
      }
    } catch (err) {
      grantCopyFailed.value = true
      isSubmitting.value = false
      saveError.value =
        `The role “${createdRole.value.name}” was created, but copying its permissions failed` +
        `${err?.message ? ` (${err.message})` : ''}. It currently has NO permissions and grants ` +
        `nobody access. Retry the copy, or close this dialog and set its permissions from the ` +
        `role's page.`
      return
    }
  }

  grantCopyFailed.value = false
  isSubmitting.value = false
  emit('created', createdRole.value)
  show.value = false
}

// Prefill on open: a fresh create, or a clone seeded from the source role.
// Reopening always starts a NEW role — the half-finished one from a previous
// attempt is left alone (it exists and is listed; abandoning it is the user's
// call, not something a dialog reopen should quietly re-adopt).
watch(show, (val) => {
  if (!val) return
  createdRole.value = null
  grantCopyFailed.value = false
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
        :submitLabel="submitLabel"
        :cancelLabel="grantCopyFailed ? 'Close' : 'Cancel'"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
