<script setup>
import { required, email, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { post } from '@/api'

const open = defineModel({
  type: Boolean,
  default: false,
})

const toast = useToast()

// Create user mutation
const createUser = useLiveMutation(async (db, data) => {
  const { roleIds, inviteSent, ...userData } = data
  // userStatusId is finalised below — start as INACTIVE; the invite endpoint flips
  // it to INVITED on the backend when we trigger the email.
  const u = db.User.create({ ...userData, userStatusId: 'INACTIVE', inviteSent: false })
  await u.save()
  for (const roleId of roleIds) {
    const roleOnUser = db.RoleOnUser.create({ userId: u.id, roleId })
    await roleOnUser.save()
  }
  return { user: u, inviteSent }
})

const form = ref({
  firstName: '',
  lastName: '',
  email: '',
  roleIds: [],
  color: '#2563eb',
  inviteSent: false,
  siteId: null,
  departmentId: null,
})

const rules = computed(() => ({
  firstName: { required: helpers.withMessage('Required', required) },
  lastName: { required: helpers.withMessage('Required', required) },
  email: {
    required: helpers.withMessage('Required', required),
    email: helpers.withMessage('Invalid email format', email),
  },
}))

const validator = useValidator(rules, form)

const isSubmitting = ref(false)

// Reset form when closed
watch(open, (val) => {
  if (!val) {
    form.value = {
      firstName: '',
      lastName: '',
      email: '',
      roleIds: [],
      color: '#2563eb',
      inviteSent: false,
      siteId: null,
      departmentId: null,
    }
  }
})

async function onSubmit() {
  const valid = await validator.value.$validate()
  if (!valid) return

  isSubmitting.value = true
  try {
    const { user, inviteSent } = await createUser(form.value)
    if (inviteSent && user?.id) {
      try {
        await post(`/v1/services/users/${user.id}/invite`, {})
      } catch (err) {
        toast?.notify?.({ type: 'negative', message: err?.message || 'User created but invitation email failed' })
      }
    }
    open.value = false
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Create New User" maxWidth="lg">
    <div class="tw:grid tw:grid-cols-12 tw:gap-0">
      <!-- Main Content -->
      <div class="tw:col-span-12 tw:sm:col-span-8 tw:p-4">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseTextInput
              v-model="form.firstName"
              name="firstName"
              label="First Name"
              placeholder="e.g. John"
              :required="true"
            />

            <BaseTextInput
              v-model="form.lastName"
              name="lastName"
              label="Last Name"
              placeholder="e.g. Doe"
              :required="true"
            />
          </div>

          <BaseTextInput
            v-model="form.email"
            name="email"
            label="Email"
            placeholder="e.g. john.doe@example.com"
            type="email"
            :required="true"
          />

          <div>
            <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
              Roles <span class="tw:text-red">*</span>
            </label>
            <RoleSelectMenu v-model="form.roleIds" :required="true" multiple />
          </div>

          <div>
            <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
              Site <span class="tw:text-red">*</span>
            </label>
            <SiteSelectMenu v-model="form.siteId" :required="true" />
          </div>

          <div>
            <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
              Department <span class="tw:text-red">*</span>
            </label>
            <DepartmentSelectMenu
              v-model="form.departmentId"
              :siteId="form.siteId"
              :required="true"
            />
          </div>
        </div>
      </div>

      <!-- Mini Sidebar -->
      <div class="tw:col-span-12 tw:sm:col-span-4 tw:bg-main-hover tw:p-4 tw:rounded-r-lg">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div>
            <div class="tw:text-xs tw:text-secondary tw:mb-2 tw:font-medium">User Color</div>
            <BaseColorPicker v-model="form.color" />
          </div>

          <div class="tw:flex tw:gap-1">
            <BaseCheckbox v-model="form.inviteSent" label="Send Invite" />
            <div class="tw:text-[10px] tw:text-secondary tw:ml-2">Send an email invitation.</div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="open = false"> Cancel </BaseButton>
      <BaseButton :disabled="isSubmitting" @click="onSubmit"> Create User </BaseButton>
    </template>
  </BaseDialog>
</template>
