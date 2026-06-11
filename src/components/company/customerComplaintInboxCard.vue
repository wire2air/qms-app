<script setup>
import { IconMailForward, IconCopy, IconRefresh, IconCheck } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// The inbound mailbox is intentionally not a synced model (it's a
// routing secret) — it's served and rotated via REST only.
import { get, post } from '@/api'

const toast = useToast()

const loading = ref(true)
const inboundAddress = ref(null)
const loadError = ref(null)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const data = await get('/v1/services/customerComplaints/emailSettings')
    inboundAddress.value = data.inboundAddress
  } catch (e) {
    loadError.value = e.message || 'Failed to load email settings'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const copied = ref(false)
async function copyAddress() {
  if (!inboundAddress.value) return
  await navigator.clipboard.writeText(inboundAddress.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const showRegenerateDialog = ref(false)
const regenerating = ref(false)

async function handleRegenerate() {
  regenerating.value = true
  try {
    const data = await post('/v1/services/customerComplaints/emailSettings/regenerate', {})
    inboundAddress.value = data.inboundAddress
    showRegenerateDialog.value = false
    toast.notify({ type: 'positive', message: 'Support inbox address regenerated' })
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to regenerate address' })
  } finally {
    regenerating.value = false
  }
}
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <IconMailForward :size="18" class="tw:text-primary" />
      <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
        Support Inbox — Email Tickets
      </div>
    </div>

    <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>
    <div v-else-if="loadError" class="tw:text-sm tw:text-red-600">{{ loadError }}</div>

    <div v-else class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <label class="tw:text-sm tw:font-medium tw:text-secondary">
          Your generated inbound email address
        </label>
        <div class="tw:flex tw:items-center tw:gap-2">
          <code
            class="tw:flex-1 tw:text-sm tw:font-mono tw:bg-gray-50 tw:border tw:border-divider tw:rounded-md tw:px-3 tw:py-2 tw:truncate"
          >
            {{ inboundAddress }}
          </code>
          <BaseButton variant="outline" size="sm" @click="copyAddress">
            <component :is="copied ? IconCheck : IconCopy" :size="16" class="tw:mr-1" />
            {{ copied ? 'Copied' : 'Copy' }}
          </BaseButton>
        </div>
      </div>

      <div
        class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-md tw:p-3 tw:text-sm tw:text-blue-800"
      >
        <p class="tw:font-semibold tw:mb-1">Forward your support email to this address</p>
        <p>
          Set up forwarding from your existing support mailbox (e.g.
          <span class="tw:font-mono">support@yourcompany.com</span>) to the address above. Every
          email becomes a complaint ticket automatically; replies on existing tickets are added to
          their conversation thread.
        </p>
      </div>

      <div class="tw:flex tw:items-center tw:justify-between tw:pt-2 tw:border-t tw:border-divider">
        <p class="tw:text-xs tw:text-secondary">
          Regenerating gives you a fresh address — the old one stops receiving immediately, so
          update your forwarding rule afterwards.
        </p>
        <BaseButton variant="outline" size="sm" @click="showRegenerateDialog = true">
          <IconRefresh :size="16" class="tw:mr-1" />
          Regenerate
        </BaseButton>
      </div>
    </div>

    <BaseDialog v-model="showRegenerateDialog" title="Regenerate Inbound Address" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:p-1">
        This replaces the current support inbox address with a new one. Email forwarded to the old
        address will <strong>no longer create tickets</strong> until you update your forwarding
        rule. Continue?
      </p>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="regenerating" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="regenerating" @click="handleRegenerate">
          {{ regenerating ? 'Regenerating…' : 'Regenerate' }}
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
