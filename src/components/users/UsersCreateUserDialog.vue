<script setup>
import { required, email } from '@shared/components/form/validators.js'
// Action RPC (not entity CRUD — POST /v1/services/users/:id/invite) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'

const open = defineModel({
  type: Boolean,
  default: false,
})

// Creating the person and granting them authority are two acts with two bars.
// This dialog does both: the User row needs `user_management:create`, and each
// roles_on_users row needs `role_permission_management:update`.
//
// The Roles field was unconditionally `required`, so a holder of
// `user_management:create` alone — an onboarder, exactly the persona the field
// was for — could not complete the form at all. Worse, the failure came late:
// `createUser` saves the User first and then loops the role rows, so the write
// that was refused left a real user behind and threw. Onboarding half-worked
// and reported an error.
//
// Hidden rather than disabled: a create-only holder onboards the person, and
// someone with permission-management authority grants the roles afterwards.
// A user with no roles holds no permissions, which is a safe resting state and
// the same one an invitation sits in before it is accepted. See F-18 in
// docs/modules/roles.
const canAssignRoles = computed(() => isAllowed(['role_permission_management:update']))

const toast = useToast()

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

// Create user mutation
const createUser = useLiveMutation(async (db, data) => {
  const { roleIds, inviteSent, ...userData } = data
  // The user stays INACTIVE until they accept. The invite endpoint sends the
  // email and sets inviteSent; it is ACCEPTANCE that flips the row to ACTIVE
  // (backend/api/controllers/auth/invitation.js). There is no INVITED status —
  // `user_statuses` holds ACTIVE and INACTIVE and the column is FK-constrained
  // to them; "invited, not yet accepted" is INACTIVE + inviteSent.
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
  timezone: 'UTC',
  languageId: 'en-US',
})

// Email uniqueness check (per-company — the IDB is company-scoped). Mirrors the
// site/department code check so duplicates are blocked before hitting the server
// instead of silently creating a second user with the same email.
const emailAvailable = useLiveQueryWithDeps(
  [() => form.value.email],
  async (db, [emailValue]) => {
    const e = (emailValue || '').trim().toLowerCase()
    if (!e) return true
    const all = await db.User.where().exec()
    return !all.some((u) => (u.email || '').trim().toLowerCase() === e)
  },
  { models: ['User'], initial: true },
)

const emailInUseError = computed(() =>
  form.value.email && !emailAvailable.value ? 'A user with this email already exists' : '',
)

function emailUnique() {
  return emailAvailable.value || 'A user with this email already exists'
}

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
      timezone: 'UTC',
      languageId: 'en-US',
    }
    saveError.value = ''
  }
})

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
  try {
    const { user, inviteSent } = await createUser(form.value)
    if (inviteSent && user?.id) {
      try {
        await post(`/v1/services/users/${user.id}/invite`, {})
      } catch (err) {
        toast?.notify?.({
          type: 'negative',
          message: err?.message || 'User created but invitation email failed',
        })
      }
    }
    open.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to create user'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Create New User" maxWidth="lg">
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:grid tw:grid-cols-12 tw:gap-0">
        <!-- Main Content -->
        <div class="tw:col-span-12 tw:sm:col-span-8 tw:p-4">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
              <BaseField label="First Name" required :value="form.firstName" :rules="[required()]">
                <template #default="field">
                  <BaseTextInput v-bind="field" v-model="form.firstName" placeholder="e.g. John" />
                </template>
              </BaseField>

              <BaseField label="Last Name" required :value="form.lastName" :rules="[required()]">
                <template #default="field">
                  <BaseTextInput v-bind="field" v-model="form.lastName" placeholder="e.g. Doe" />
                </template>
              </BaseField>
            </div>

            <BaseField
              label="Email"
              required
              :value="form.email"
              :rules="[required(), email(), emailUnique]"
              :error="emailInUseError"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.email"
                  placeholder="e.g. john.doe@example.com"
                  type="email"
                />
              </template>
            </BaseField>

            <BaseField
              v-if="canAssignRoles"
              label="Roles"
              required
              :value="form.roleIds"
              :rules="[required()]"
            >
              <RoleSelectMenu v-model="form.roleIds" :required="true" multiple />
            </BaseField>

            <BaseField label="Site" required :value="form.siteId" :rules="[required()]">
              <SiteSelectMenu v-model="form.siteId" :required="true" />
            </BaseField>

            <BaseField label="Department" required :value="form.departmentId" :rules="[required()]">
              <DepartmentSelectMenu
                v-model="form.departmentId"
                :siteId="form.siteId"
                :required="true"
              />
            </BaseField>
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
              <div class="tw:text-micro tw:text-secondary tw:ml-2">Send an email invitation.</div>
            </div>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Create User"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="open = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
