<script setup>
import { required } from '@shared/components/form/validators.js'

const open = defineModel({
  type: Boolean,
  default: false,
})

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref(null)

const form = ref({
  name: '',
  color: '#6366f1',
  isLeadership: false,
  userIds: [],
})

const createGroup = useLiveMutation(async (db, { name, color, isLeadership, userIds }) => {
  const team = db.Team.create({ name, color, isLeadership })
  await team.save()
  for (const userId of userIds) {
    const membership = db.UserOnTeam.create({ teamId: team.id, userId })
    await membership.save()
  }
  return team
})

// Name uniqueness (case-insensitive, per company) — backed by the DB
// teams_company_name_unique partial index.
const nameAvailable = useLiveQueryWithDeps(
  [() => form.value.name],
  async (db, [name]) => {
    const n = (name || '').trim().toLowerCase()
    if (!n) return true
    const all = await db.Team.where().exec()
    return !all.some((t) => (t.name || '').trim().toLowerCase() === n)
  },
  { models: ['Team'], initial: true },
)
const nameInUseError = computed(() =>
  form.value.name && !nameAvailable.value ? 'A group with this name already exists' : '',
)
function nameUnique() {
  return nameAvailable.value || 'A group with this name already exists'
}

watch(open, (val) => {
  if (!val) {
    form.value = { name: '', color: '#6366f1', isLeadership: false, userIds: [] }
    saveError.value = null
  }
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = null
  try {
    const team = await createGroup({ ...form.value })
    // Undefined means the save failed (useLiveMutation already toasted). Keep the
    // dialog open so the user can correct and retry.
    if (!team) return
    open.value = false
  } catch (err) {
    saveError.value = err.message || 'Failed to create group'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Create New Group">
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:grid tw:grid-cols-12 tw:gap-0">
        <!-- Main Content -->
        <div class="tw:col-span-12 tw:sm:col-span-8 tw:p-4">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              label="Group Name"
              required
              :value="form.name"
              :rules="[required(), nameUnique]"
              :error="nameInUseError"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.name"
                  placeholder="e.g. Quality Assurance Team"
                />
              </template>
            </BaseField>

            <BaseField label="Members">
              <UserSelectMenu v-model="form.userIds" multiple />
            </BaseField>
          </div>
        </div>

        <!-- Mini Sidebar -->
        <div class="tw:col-span-12 tw:sm:col-span-4 tw:bg-main-hover tw:p-4 tw:rounded-r-lg">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <div>
              <div class="tw:text-xs tw:text-secondary tw:mb-2 tw:font-medium">Group Color</div>
              <BaseColorPicker v-model="form.color" />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer">
                <BaseCheckbox v-model="form.isLeadership" />
                <span class="tw:text-sm tw:font-medium tw:text-on-main">Leadership Team</span>
              </label>
              <div class="tw:text-micro tw:text-secondary">Core management group.</div>
            </div>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Create Group"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
