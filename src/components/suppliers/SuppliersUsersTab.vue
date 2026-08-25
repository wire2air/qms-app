<script setup>
import { IconUserPlus, IconMail, IconX } from '@tabler/icons-vue'
import { post, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required } from '@shared/components/form/validators.js'

/**
 * Users at this supplier — EXTERNAL_SUPPLIER kind. Distinct from
 * SupplierContact (name + email metadata only); these are real login
 * identities that can participate in workflows (document approvals,
 * CAPA/NC actions) and see the supplier dashboard.
 *
 * Lists existing users and exposes the invite flow. The invite POST hits
 * /v1/services/suppliers/:id/users, which mirrors the internal user
 * createUser → audit-side-effect → send_invitation_email pipeline and
 * pins kind + supplier_id from the URL.
 */
const props = defineProps({
  supplierId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const toast = useToast()
const { confirm } = useConfirm()

const users = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.User.where('supplierId', supplierId).exec()
    return rows
      .filter((u) => u.kind === 'EXTERNAL_SUPPLIER')
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['User'], initial: [] },
)

const columns = [
  { name: 'name', label: 'NAME', field: 'firstName', align: 'left' },
  { name: 'email', label: 'EMAIL', field: 'email', align: 'left' },
  { name: 'title', label: 'TITLE', field: 'jobTitle', align: 'left' },
  { name: 'status', label: 'STATUS', field: 'userStatusId', align: 'left' },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

const showInvite = ref(false)
const invite = ref({ firstName: '', lastName: '', email: '', jobTitle: '' })
const isInviting = ref(false)
const formRef = ref(null)

function openInvite() {
  if (!props.canUpdate) return
  invite.value = { firstName: '', lastName: '', email: '', jobTitle: '' }
  showInvite.value = true
}

async function onValidSubmit() {
  if (isInviting.value) return
  isInviting.value = true
  try {
    await post(`/v1/services/suppliers/${props.supplierId}/users`, {
      firstName: invite.value.firstName.trim(),
      lastName: invite.value.lastName.trim() || null,
      email: invite.value.email.trim(),
      jobTitle: invite.value.jobTitle.trim() || null,
    })
    toast.success('Invitation sent')
    showInvite.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to invite user')
  } finally {
    isInviting.value = false
  }
}

function statusLabel(u) {
  if (u.userStatusId === 'ACTIVE')
    return { text: 'Active', cls: 'tw:bg-green-100 tw:text-green-700' }
  if (u.inviteSent) return { text: 'Invited', cls: 'tw:bg-amber-100 tw:text-amber-700' }
  return { text: 'Inactive', cls: 'tw:bg-gray-100 tw:text-gray-600' }
}

// "Invited but never accepted" is the only state where canceling makes
// sense — the user hasn't logged in yet, so deleting unwinds the invite
// cleanly. Once they're ACTIVE we treat the row as a real user and
// expect a different lifecycle (deactivate / impersonate / etc.).
function canCancelInvite(u) {
  return props.canUpdate && u.userStatusId !== 'ACTIVE' && u.inviteSent
}

async function cancelInvite(u) {
  if (!canCancelInvite(u)) return
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
  if (
    !(await confirm({
      title: 'Cancel invitation',
      message: `Cancel the invitation for ${name}? They won't be able to use the link anymore.`,
      okLabel: 'Cancel invitation',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/users/${u.id}`)
    toast.success('Invitation cancelled')
  } catch (err) {
    toast.error(err?.message || 'Failed to cancel invitation')
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:flex-wrap">
      <div>
        <BaseText as="h3" weight="semibold">Supplier users</BaseText>
        <p class="tw:text-xs tw:text-secondary">
          People at the supplier who can log in to the supplier dashboard, participate in document
          approvals, and act on CAPAs / NCs assigned to them. Distinct from Contacts (notification
          targets only).
        </p>
      </div>
      <BaseButton v-if="canUpdate" variant="primary" @click="openInvite">
        <IconUserPlus :size="16" />
        Invite user
      </BaseButton>
    </div>

    <DataTable
      :rows="users"
      :columns="columns"
      rowKey="id"
      :mobileCards="false"
      searchable
      exportManager
      exportFilename="supplier-users.csv"
      persistKey="suppliers:users"
      noDataLabel="No supplier users yet. Invite one to give them dashboard access + workflow eligibility."
    >
      <template #body-cell-name="{ row }">
        <span class="tw:text-on-main">{{ row.firstName }} {{ row.lastName || '' }}</span>
      </template>

      <template #body-cell-email="{ row }">
        <span class="tw:inline-flex tw:items-center tw:gap-1 tw:text-on-main">
          <IconMail :size="12" class="tw:text-secondary" />
          {{ row.email }}
        </span>
      </template>

      <template #body-cell-title="{ row }">
        <span class="tw:text-secondary">{{ row.jobTitle || '—' }}</span>
      </template>

      <template #body-cell-status="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:rounded tw:px-2 tw:py-0.5"
          :class="statusLabel(row).cls"
        >
          {{ statusLabel(row).text }}
        </span>
      </template>

      <template #body-cell-actions="{ row }">
        <button
          v-if="canCancelInvite(row)"
          type="button"
          title="Cancel invitation"
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-bad tw:hover:bg-red-50 tw:bg-transparent tw:border-0 tw:cursor-pointer"
          @click="cancelInvite(row)"
        >
          <IconX :size="14" />
        </button>
      </template>
    </DataTable>

    <!-- Invite dialog -->
    <BaseDialog v-model="showInvite" title="Invite supplier user" size="md">
      <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
            <BaseField label="First name" required :value="invite.firstName" :rules="[required()]">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="invite.firstName" />
              </template>
            </BaseField>
            <BaseField label="Last name">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="invite.lastName" />
              </template>
            </BaseField>
          </div>
          <BaseField label="Email" required :value="invite.email" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="invite.email"
                type="email"
                placeholder="user@supplier.example"
              />
            </template>
          </BaseField>
          <BaseField label="Job title">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="invite.jobTitle"
                placeholder="Quality Manager, Sales Lead, …"
              />
            </template>
          </BaseField>
          <p class="tw:text-caption tw:text-secondary tw:italic">
            They'll get an invitation email to set their password. Role / data-access assignment
            lands in the next step — for now an invited user has read-only access only to records
            explicitly shared with them.
          </p>
        </div>
      </BaseForm>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Send invitation"
          :loading="isInviting"
          @cancel="close"
          @submit="formRef.submit()"
        />
      </template>
    </BaseDialog>
  </div>
</template>
