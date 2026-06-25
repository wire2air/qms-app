<script setup>
import { IconMailForward, IconPlus } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// Email channels are mail routing config, intentionally not a synced
// model — served and managed via REST only.
import { get, post, del } from '@/api'

/**
 * Email Channels admin (Zendesk: Admin Center → Channels → Email →
 * Support Addresses). Emails sent to any of these addresses become
 * complaint tickets.
 */
const toast = useToast()

const loading = ref(true)
const loadError = ref(null)
const channels = ref([])
const companyMailDomain = ref('')

function applySettings(data) {
  channels.value = data.channels ?? []
  companyMailDomain.value = data.companyMailDomain ?? ''
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    applySettings(await get('/v1/services/customerComplaints/emailChannels'))
  } catch (e) {
    loadError.value = e.message || 'Failed to load email channels'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ─── Add address ──────────────────────────────────────────────────────────────
const showCreateDialog = ref(false)
const setupChannel = ref(null)
const showSetupDialog = ref(false)

function onChannelCreated(response) {
  applySettings(response)
  // Forwarding channels go straight into the setup-instructions dialog
  // (Zendesk flow): forward FROM your address TO the generated one,
  // then verify.
  const created = channels.value.find((c) => c.id === response.createdChannelId)
  if (created?.channelType === 'FORWARDING') {
    setupChannel.value = created
    showSetupDialog.value = true
  }
}

function onOpenSetup(channel) {
  setupChannel.value = channel
  showSetupDialog.value = true
}

function onSetupUpdated(response) {
  applySettings(response)
  setupChannel.value = channels.value.find((c) => c.id === setupChannel.value?.id) ?? null
}

// ─── Row actions ──────────────────────────────────────────────────────────────
async function runChannelAction(promise, successMessage) {
  try {
    applySettings(await promise)
    if (successMessage) toast.notify({ type: 'positive', message: successMessage })
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Action failed' })
  }
}

function onVerify(channel) {
  runChannelAction(
    post(`/v1/services/customerComplaints/emailChannels/${channel.id}/verify`, {}),
    `Verification email sent to ${channel.publicEmail}`,
  )
}

function onMakeDefault(channel) {
  runChannelAction(
    post(`/v1/services/customerComplaints/emailChannels/${channel.id}/setDefault`, {}),
    `${channel.address} is now the default address`,
  )
}

function onSetState(channel, stateId) {
  runChannelAction(
    post(`/v1/services/customerComplaints/emailChannels/${channel.id}/setState`, { stateId }),
    stateId === 'ACTIVE' ? `${channel.address} enabled` : `${channel.address} disabled`,
  )
}

const deleteTarget = ref(null)
const deleting = ref(false)

async function handleDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    applySettings(
      await del(`/v1/services/customerComplaints/emailChannels/${deleteTarget.value.id}`),
    )
    deleteTarget.value = null
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to delete address' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <PageSection title="Support Addresses" :icon="IconMailForward" variant="card">
    <template #actions>
      <BaseButton variant="primary" size="sm" @click="showCreateDialog = true">
        <IconPlus :size="16" class="tw:mr-1" />
        Add address
      </BaseButton>
    </template>

    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Emails sent to any of these addresses become complaint tickets. System addresses on
      <span class="tw:font-mono">{{ companyMailDomain || '…' }}</span> work immediately; external
      addresses need forwarding set up and verified before they receive tickets. Agent replies are
      sent from the address the ticket arrived on.
    </p>

    <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>
    <div v-else-if="loadError" class="tw:text-sm tw:text-red-600">{{ loadError }}</div>

    <EmailChannelsTable
      v-else
      :channels="channels"
      @verify="onVerify"
      @setup="onOpenSetup"
      @makeDefault="onMakeDefault"
      @setState="onSetState"
      @delete="(row) => (deleteTarget = row)"
    />

    <EmailChannelCreateDialog
      v-model="showCreateDialog"
      :companyMailDomain="companyMailDomain"
      @created="onChannelCreated"
    />

    <EmailForwardingSetupDialog
      v-model="showSetupDialog"
      :channel="setupChannel"
      @updated="onSetupUpdated"
    />

    <BaseDialog
      :modelValue="!!deleteTarget"
      title="Delete Support Address"
      maxWidth="md"
      @update:modelValue="(v) => !v && (deleteTarget = null)"
    >
      <p class="tw:text-sm tw:text-on-main tw:p-1">
        Delete <span class="tw:font-mono">{{ deleteTarget?.address }}</span
        >? Email sent to it will <strong>no longer create tickets</strong>. Existing tickets keep
        their history. Update any forwarding rules pointing at it.
      </p>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Delete"
          submitVariant="danger"
          :loading="deleting"
          @cancel="close"
          @submit="handleDelete"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>
