<script setup>
import { IconSend, IconLock, IconMail } from '@tabler/icons-vue'
import { post } from '@/api'

const props = defineProps({
  complaintId: { type: String, required: true },
  customerEmail: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const toast = useToast()
const body = ref('')
const isInternal = ref(false)
const sendEmail = ref(true)
const sending = ref(false)

const canEmail = computed(() => Boolean(props.customerEmail) && !isInternal.value)

async function handleSend() {
  if (!body.value.trim()) {
    toast.notify({ type: 'negative', message: 'Type a reply first' })
    return
  }
  sending.value = true
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    // The server applies side effects (parent updated_at touch,
    // outbound email enqueue) atomically; doing the message create via
    // db.CustomerComplaintMessage.create() would skip those.
    await post(`/v1/services/customerComplaints/${props.complaintId}/messages`, {
      body: body.value,
      isInternal: isInternal.value,
      sendEmail: canEmail.value && sendEmail.value,
    })
    body.value = ''
    toast.notify({
      type: 'positive',
      message: isInternal.value ? 'Internal note added' : 'Reply sent',
    })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to send' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
      <button
        class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors tw:flex tw:items-center tw:gap-1"
        :class="
          !isInternal
            ? 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-300'
            : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
        "
        @click="isInternal = false"
      >
        Reply to customer
      </button>
      <button
        class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors tw:flex tw:items-center tw:gap-1"
        :class="
          isInternal
            ? 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-300'
            : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
        "
        @click="isInternal = true"
      >
        <IconLock :size="12" />
        Internal note
      </button>
    </div>
    <BaseTextarea
      v-model="body"
      :placeholder="
        isInternal
          ? 'Note for the team (not sent to customer)…'
          : 'Reply to the customer…'
      "
      rows="4"
      :disabled="disabled"
    />
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:flex-wrap">
      <label
        v-if="!isInternal"
        class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary tw:cursor-pointer"
        :class="{ 'tw:opacity-50 tw:cursor-not-allowed': !customerEmail }"
      >
        <BaseCheckbox v-model="sendEmail" :disabled="!customerEmail" />
        <span class="tw:flex tw:items-center tw:gap-1">
          <IconMail :size="14" />
          Email this reply
        </span>
        <span v-if="!customerEmail" class="tw:text-xs tw:text-secondary">
          (no customer email on file)
        </span>
      </label>
      <span v-else class="tw:text-xs tw:text-secondary">
        Internal notes are never emailed.
      </span>
      <BaseButton
        variant="primary"
        :loading="sending"
        :disabled="sending || disabled || !body.trim()"
        @click="handleSend"
      >
        <template #icon>
          <IconSend :size="16" />
        </template>
        {{ isInternal ? 'Add note' : 'Send reply' }}
      </BaseButton>
    </div>
  </div>
</template>
