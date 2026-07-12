<script setup>
// Platform Console — Operators. The real super-admin roster (replaces the
// ADMIN_EMAILS env allowlist). View = support; grant/revoke = owner. Every
// change is audited (PLATFORM_ADMIN_GRANT / _REVOKE).
import { IconUserShield, IconUserPlus, IconTrash } from '@tabler/icons-vue'
import { useToast } from '@shared/composables/useToast.js'
import { useConfirm } from '@shared/composables/useConfirm.js'
import {
  listPlatformAdmins,
  grantPlatformAdmin,
  revokePlatformAdmin,
  PLATFORM_ROLES,
} from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

const toast = useToast()
const { confirm } = useConfirm()

const rows = ref([])
const loading = ref(false)
const canManage = computed(() => hasPlatformRole('owner'))

const grantDialog = ref(false)
const grantForm = ref({ email: '', role: 'support' })
const granting = ref(false)

const columns = [
  { name: 'name', label: 'OPERATOR', field: 'name', align: 'left', sortable: true },
  { name: 'email', label: 'EMAIL', field: 'email', align: 'left', sortable: true },
  { name: 'role', label: 'ROLE', field: 'role', align: 'left', sortable: true },
  { name: 'createdAt', label: 'SINCE', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'role', desc: true }])

async function load() {
  loading.value = true
  try {
    const data = await listPlatformAdmins()
    rows.value = (data?.admins || []).map((a) => ({
      id: a.id,
      role: a.role,
      createdAt: a.createdAt,
      email: a.user?.email || '—',
      name: `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim() || '—',
    }))
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openGrant() {
  grantForm.value = { email: '', role: 'support' }
  grantDialog.value = true
}

async function handleGrant() {
  if (!grantForm.value.email.trim()) {
    toast.notify({ type: 'negative', message: 'Email is required' })
    return
  }
  granting.value = true
  try {
    await grantPlatformAdmin({
      email: grantForm.value.email.trim().toLowerCase(),
      role: grantForm.value.role,
    })
    grantDialog.value = false
    await load()
  } finally {
    granting.value = false
  }
}

async function onRevoke(row) {
  const ok = await confirm({
    title: 'Revoke platform operator',
    message: `Remove platform access for ${row.email}? They lose all cross-tenant abilities immediately.`,
    okLabel: 'Revoke',
    danger: true,
  })
  if (!ok) return
  await revokePlatformAdmin(row.id)
  await load()
}
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconUserShield" title="Platform Operators">
      <template #actions>
        <BaseButton v-if="canManage" variant="primary" @click="openGrant">
          <template #icon><IconUserPlus :size="16" /></template>
          Add operator
        </BaseButton>
      </template>
    </PageHeader>

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      rowKey="id"
      :mobileCards="false"
      searchable
    >
      <template #body-cell-name="{ row }">
        <div class="tw:font-semibold tw:text-on-main">{{ row.name }}</div>
      </template>
      <template #body-cell-email="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.email }}</span>
      </template>
      <template #body-cell-role="{ row }">
        <span
          class="tw:inline-flex tw:items-center tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-semibold tw:bg-indigo-100 tw:text-indigo-700 tw:capitalize"
        >
          {{ row.role }}
        </span>
      </template>
      <template #body-cell-createdAt="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
      </template>
      <template #body-cell-actions="{ row }">
        <div v-if="canManage" class="tw:flex tw:justify-end" @click.stop>
          <BaseButton variant="danger" size="sm" iconOnly aria-label="Revoke" @click="onRevoke(row)">
            <template #icon><IconTrash :size="16" /></template>
          </BaseButton>
        </div>
      </template>
    </DataTable>

    <BaseDialog v-model="grantDialog" title="Add platform operator">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput
          v-model="grantForm.email"
          label="User email"
          placeholder="operator@yourcompany.com"
          :required="true"
        />
        <BaseSelect
          v-model="grantForm.role"
          label="Role"
          :options="PLATFORM_ROLES"
          optionLabel="label"
          optionValue="id"
          :required="true"
          :clearable="false"
        />
        <p class="tw:text-xs tw:text-secondary">
          The user must already have a QMS account. Roles are rank-ordered: readonly &lt; support
          &lt; admin &lt; owner.
        </p>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="secondary" :disabled="granting" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="granting" @click="handleGrant">
          {{ granting ? 'Saving…' : 'Grant access' }}
        </BaseButton>
      </template>
    </BaseDialog>
  </BasePage>
</template>
