<script setup>
import { IconRobot, IconPlus } from '@tabler/icons-vue'
import {
  listServiceAccounts,
  setServiceAccountEnabled,
  deleteServiceAccount,
} from '@/api/serviceAccounts.js'

/**
 * Service Accounts — list page.
 *
 * Machine identities that own API keys. Read over REST rather than the
 * syncEngine: the payload is a DTO, not a model record (see
 * `src/api/serviceAccounts.js` for why), so there is no live query to drive the
 * list and `reload()` is the refresh mechanism.
 */
const accounts = ref(undefined)
const showCreateDialog = ref(false)

const list = useListLayout({
  total: () => accounts.value?.length ?? 0,
  loading: () => accounts.value === undefined,
  empty: () => accounts.value?.length === 0,
})

async function reload() {
  const res = await listServiceAccounts()
  accounts.value = res?.serviceAccounts ?? []
}

onMounted(reload)

async function handleToggle(account) {
  await setServiceAccountEnabled(account.id, account.statusId !== 'ACTIVE')
  await reload()
}

async function handleDelete(account) {
  await deleteServiceAccount(account.id)
  await reload()
}

function openDialog() {
  showCreateDialog.value = true
}
</script>

<template>
  <BaseListLayout
    helpSlug="KB/administration/service-accounts"
    title="Service Accounts"
    :icon="IconRobot"
    subtitle="Machine identities for integrations. A service account holds its own roles and owns the API keys an external system authenticates with — so an integration keeps working when the person who set it up leaves, and every write it makes is attributed to the integration rather than to them."
    :state="list.state.value"
    :emptyIcon="IconRobot"
    emptyTitle="No service accounts yet"
    emptyDescription="Create one to connect an external system — an ERP, a CRM — to QMS."
  >
    <template #actions>
      <BaseButton @click="openDialog">
        <IconPlus class="tw:size-4" />
        New Service Account
      </BaseButton>
    </template>

    <template #empty-action>
      <BaseButton @click="openDialog">New Service Account</BaseButton>
    </template>

    <ServiceAccountList
      :accounts="accounts"
      @toggle="handleToggle"
      @delete="handleDelete"
      @changed="reload"
    />
  </BaseListLayout>

  <!-- Outside BaseListLayout so it stays mounted in the empty state. -->
  <ServiceAccountCreateDialog v-model="showCreateDialog" @created="reload" />
</template>
