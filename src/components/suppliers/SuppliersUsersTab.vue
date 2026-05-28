<script setup>
import { IconUserPlus, IconMail, IconUser } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

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

const users = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.User.where('supplierId', supplierId).exec()
    return rows
      .filter((u) => u.kind === 'EXTERNAL_SUPPLIER')
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)

const showInvite = ref(false)
const invite = ref({ firstName: '', lastName: '', email: '', jobTitle: '' })
const isInviting = ref(false)

function openInvite() {
  if (!props.canUpdate) return
  invite.value = { firstName: '', lastName: '', email: '', jobTitle: '' }
  showInvite.value = true
}

async function submitInvite() {
  if (isInviting.value) return
  if (!invite.value.firstName.trim() || !invite.value.email.trim()) {
    toast.error('First name and email are required')
    return
  }
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
  if (u.userStatusId === 'ACTIVE') return { text: 'Active', cls: 'tw:bg-green-100 tw:text-green-700' }
  if (u.inviteSent) return { text: 'Invited', cls: 'tw:bg-amber-100 tw:text-amber-700' }
  return { text: 'Inactive', cls: 'tw:bg-gray-100 tw:text-gray-600' }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:flex-wrap">
      <div>
        <h3 class="tw:text-base tw:font-semibold tw:text-on-main">Supplier users</h3>
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

    <div
      v-if="users.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-10 tw:text-secondary tw:bg-white tw:rounded-lg tw:border tw:border-divider"
    >
      <IconUser :size="32" class="tw:opacity-60" />
      <div class="tw:text-sm">No supplier users yet.</div>
      <div class="tw:text-xs">Invite one to give them dashboard access + workflow eligibility.</div>
    </div>

    <div v-else class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main-hover tw:text-secondary tw:text-xs tw:uppercase">
          <tr>
            <th class="tw:text-left tw:px-3 tw:py-2">Name</th>
            <th class="tw:text-left tw:px-3 tw:py-2">Email</th>
            <th class="tw:text-left tw:px-3 tw:py-2">Title</th>
            <th class="tw:text-left tw:px-3 tw:py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in users"
            :key="u.id"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
          >
            <td class="tw:px-3 tw:py-2 tw:text-on-main">
              {{ u.firstName }} {{ u.lastName || '' }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-on-main">
              <span class="tw:inline-flex tw:items-center tw:gap-1">
                <IconMail :size="12" class="tw:text-secondary" />
                {{ u.email }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-secondary">{{ u.jobTitle || '—' }}</td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:rounded tw:px-2 tw:py-0.5"
                :class="statusLabel(u).cls"
              >
                {{ statusLabel(u).text }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Invite dialog -->
    <BaseDialog v-model="showInvite" title="Invite supplier user" size="md">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
              First name <span class="tw:text-bad">*</span>
            </label>
            <BaseTextInput v-model="invite.firstName" />
          </div>
          <div>
            <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
              Last name
            </label>
            <BaseTextInput v-model="invite.lastName" />
          </div>
        </div>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Email <span class="tw:text-bad">*</span>
          </label>
          <BaseTextInput v-model="invite.email" type="email" placeholder="user@supplier.example" />
        </div>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Job title
          </label>
          <BaseTextInput v-model="invite.jobTitle" placeholder="Quality Manager, Sales Lead, …" />
        </div>
        <p class="tw:text-[11px] tw:text-secondary tw:italic">
          They'll get an invitation email to set their password. Role / data-access assignment lands
          in the next step — for now an invited user has read-only access only to records explicitly
          shared with them.
        </p>
      </div>
      <template #actions>
        <BaseButton variant="secondary" @click="showInvite = false">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="isInviting" @click="submitInvite">
          Send invitation
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
