<script setup>
const open = defineModel({
  type: Boolean,
  default: false,
})

const form = ref({
  name: '',
  color: '#6366f1',
  isLeadership: false,
  userIds: [],
})

const isSubmitting = ref(false)
const saveError = ref(null)

const createGroup = useLiveMutation(async (db, { name, color, isLeadership, userIds }) => {
  const team = db.Team.create({ name, color, isLeadership })
  await team.save()
  for (const userId of userIds) {
    const membership = db.UserOnTeam.create({ teamId: team.id, userId })
    await membership.save()
  }
  return team
})

watch(open, (val) => {
  if (!val) {
    form.value = { name: '', color: '#6366f1', isLeadership: false, userIds: [] }
    saveError.value = null
  }
})

async function onSubmit() {
  if (!form.value.name.trim()) return
  isSubmitting.value = true
  saveError.value = null
  try {
    await createGroup({ ...form.value })
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
    <div class="tw:grid tw:grid-cols-12 tw:gap-0">
      <!-- Main Content -->
      <div class="tw:col-span-12 tw:sm:col-span-8 tw:p-4">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseField v-slot="{ id: fieldId }" label="Group Name" required>
            <BaseTextInput
              :id="fieldId"
              v-model="form.name"
              name="name"
              placeholder="e.g. Quality Assurance Team"
            />
          </BaseField>

          <BaseField label="Members">
            <UserSelectMenu v-model="form.userIds" multiple />
          </BaseField>

          <p v-if="saveError" class="tw:text-sm tw:text-red-600">{{ saveError }}</p>
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
            <div class="tw:text-[10px] tw:text-secondary">Core management group.</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:hover:text-on-main tw:transition-colors"
        @click="open = false"
      >
        Cancel
      </button>
      <BaseButton :disabled="isSubmitting || !form.name.trim()" @click="onSubmit">
        {{ isSubmitting ? 'Creating...' : 'Create Group' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
