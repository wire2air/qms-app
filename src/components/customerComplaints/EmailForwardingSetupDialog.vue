<script setup>
import { IconCopy, IconCheck, IconMailCheck, IconArrowDown } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

/**
 * Forwarding setup instructions for an external (FORWARDING) channel:
 * forward FROM the tenant's public address TO the generated internal
 * address, then trigger the verification round trip. Mirrors Zendesk's
 * "forward your email to Zendesk" setup screen.
 */
const props = defineProps({
  channel: { type: Object, default: null },
})

const emit = defineEmits(['updated'])
const model = defineModel({ type: Boolean, default: false })

const toast = useToast()

const copied = ref(false)
async function copyForwardingAddress() {
  if (!props.channel?.inboundAddress) return
  await navigator.clipboard.writeText(props.channel.inboundAddress)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const verifying = ref(false)
async function handleVerify() {
  if (!props.channel || verifying.value) return
  verifying.value = true
  try {
    const response = await post(
      `/v1/services/customerComplaints/emailChannels/${props.channel.id}/verify`,
      {},
    )
    emit('updated', response)
    toast.notify({
      type: 'positive',
      message: `Verification email sent to ${props.channel.publicEmail}`,
    })
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to send verification email' })
  } finally {
    verifying.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="model" title="Email Forwarding Setup" maxWidth="lg">
    <div v-if="channel" class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <div class="tw:flex tw:items-center tw:justify-between">
        <span class="tw:text-sm tw:text-secondary">Status</span>
        <EmailVerificationStatusBadge
          :verificationStatus="channel.verificationStatus"
          :stateId="channel.stateId"
        />
      </div>

      <!-- Forward FROM → TO -->
      <div class="tw:flex tw:flex-col tw:gap-2">
        <p class="tw:text-sm tw:font-medium tw:text-secondary">
          In your email provider, set up a forwarding rule:
        </p>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <BaseText variant="overline">Forward emails from</BaseText>
          <code
            class="tw:text-sm tw:font-mono tw:bg-gray-50 tw:border tw:border-divider tw:rounded-md tw:px-3 tw:py-2"
          >
            {{ channel.publicEmail }}
          </code>
        </div>
        <div class="tw:flex tw:justify-center tw:text-secondary">
          <IconArrowDown :size="18" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <BaseText variant="overline">To</BaseText>
          <div class="tw:flex tw:items-center tw:gap-2">
            <code
              class="tw:flex-1 tw:text-sm tw:font-mono tw:bg-gray-50 tw:border tw:border-divider tw:rounded-md tw:px-3 tw:py-2 tw:truncate"
            >
              {{ channel.inboundAddress }}
            </code>
            <BaseButton variant="outline" size="sm" @click="copyForwardingAddress">
              <component :is="copied ? IconCheck : IconCopy" :size="16" class="tw:mr-1" />
              {{ copied ? 'Copied' : 'Copy' }}
            </BaseButton>
          </div>
        </div>
      </div>

      <div
        class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-md tw:p-3 tw:text-sm tw:text-blue-800"
      >
        <BaseText as="h3" weight="semibold" color="inherit" class="tw:mb-1">How verification works</BaseText>
        <p>
          Click <em>Send verification email</em> — we email a verification message to
          <span class="tw:font-mono">{{ channel.publicEmail }}</span
          >. When your forwarding rule passes it back to us, the address flips to
          <strong>Verified</strong> automatically and starts creating tickets.
        </p>
      </div>

      <div
        v-if="channel.verificationStatus === 'FAILED'"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-3 tw:text-sm tw:text-red-700"
      >
        The last verification email could not be delivered. Check the address and try again.
      </div>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Close</BaseButton>
      <BaseButton
        v-if="channel && channel.verificationStatus !== 'VERIFIED'"
        variant="primary"
        :disabled="verifying"
        @click="handleVerify"
      >
        <IconMailCheck :size="16" class="tw:mr-1" />
        {{ verifying ? 'Sending…' : 'Send verification email' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
