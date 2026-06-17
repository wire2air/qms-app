<script setup>
import { IconCircleCheck, IconX, IconEdit } from '@tabler/icons-vue'
import { post } from '@/api'

const props = defineProps({
  action: {
    type: String,
    required: true,
    validator: (value) => ['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(value),
  },
  taskInstanceId: { type: String, required: true },
  instanceStepId: { type: String, default: null },
  requireEsignature: { type: Boolean, default: false },
})

const emit = defineEmits(['done'])

const toast = useToast()

// ── State ──────────────────────────────────────────────────────────────────────
const showFeedbackDialog = ref(false)
const showEsignDialog = ref(false)
const feedbackAction = ref('') // 'REJECT' or 'REQUEST_CHANGES'
const pendingAction = ref(null)
const comment = ref('')
const actionLoading = ref(false)

const dialogTitle = computed(() => {
  return feedbackAction.value === 'REJECT' ? 'Reject Step' : 'Request Changes'
})

const dialogMessage = computed(() => {
  return feedbackAction.value === 'REJECT'
    ? 'Are you sure you want to reject this document? Your section comments will be shared with the document owner.'
    : 'Are you sure you want to request changes? Your section comments will be shared with the document owner.'
})

// ── Action map ─────────────────────────────────────────────────────────────────
const actionMap = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  requestChanges: 'CHANGES_REQUESTED',
}

// ── Trigger: open identity dialog before any action ────────────────────────────
function openIdentityDialog(actionKey) {
  pendingAction.value = actionKey
  if (props.requireEsignature) {
    showEsignDialog.value = true
  } else {
    submitWorkflowAction(actionKey, {})
  }
}

function onEsignVerified(esign) {
  if (pendingAction.value) {
    submitWorkflowAction(pendingAction.value, esign)
  }
}

async function submitWorkflowAction(actionKey, { method, provider, token } = {}) {
  actionLoading.value = true
  try {
    const body = {
      action: actionMap[actionKey],
    }
    if (method) body.method = method
    if (token) body.token = token
    if (provider) body.provider = provider
    if (comment.value) body.comment = comment.value

    await post(`/v1/services/taskInstances/${props.taskInstanceId}/action`, body)

    const labels = { approve: 'approved', reject: 'rejected', requestChanges: 'changes requested' }
    toast.success(`Step ${labels[actionKey]} successfully`)

    showEsignDialog.value = false
    showFeedbackDialog.value = false
    pendingAction.value = null
    comment.value = ''
    emit('done')
  } catch {
    // Keep dialogs open so user doesn't lose their input
  } finally {
    actionLoading.value = false
  }
}

// ── Button handlers ────────────────────────────────────────────────────────────
function onApprove() {
  openIdentityDialog('approve')
}

function onReject() {
  feedbackAction.value = 'REJECT'
  comment.value = ''
  showFeedbackDialog.value = true
}

function onRequestChanges() {
  feedbackAction.value = 'REQUEST_CHANGES'
  comment.value = ''
  showFeedbackDialog.value = true
}

function onConfirmFeedback() {
  showFeedbackDialog.value = false
  openIdentityDialog(feedbackAction.value === 'REJECT' ? 'reject' : 'requestChanges')
}
</script>

<template>
  <div class="tw:text-center">
    <BaseButton
      v-if="action === 'APPROVE'"
      :isLoading="actionLoading"
      class="tw:font-bold tw:shadow-md tw:shadow-primary/20!"
      @click="onApprove"
    >
      <template #icon>
        <IconCircleCheck :size="18" />
      </template>
      Approve
    </BaseButton>

    <BaseButton
      v-if="action === 'REJECT'"
      variant="outline"
      class="tw:text-red-600! tw:border-red-200! tw:hover:bg-red-50! tw:font-bold"
      :isLoading="actionLoading"
      @click="onReject"
    >
      <template #icon>
        <IconX :size="18" />
      </template>
      Reject
    </BaseButton>

    <BaseButton
      v-if="action === 'REQUEST_CHANGES'"
      variant="outline"
      class="tw:text-secondary tw:border-divider tw:hover:bg-main tw:font-bold"
      :isLoading="actionLoading"
      @click="onRequestChanges"
    >
      <template #icon>
        <IconEdit :size="18" />
      </template>
      Request Changes
    </BaseButton>

    <!-- Feedback Dialog (Reject / Request Changes) -->
    <BaseDialog v-model="showFeedbackDialog" :title="dialogTitle" maxWidth="md" persistent>
      <p class="tw:text-sm tw:text-secondary">
        {{ dialogMessage }}
      </p>

      <BaseTextarea
        v-model="comment"
        label="Comment (optional)"
        :rows="3"
        autosize
        class="tw:mt-4"
      />

      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="feedbackAction === 'REJECT' ? 'Reject' : 'Request Changes'"
          :submitVariant="feedbackAction === 'REJECT' ? 'danger' : 'primary'"
          :loading="actionLoading"
          @cancel="close"
          @submit="onConfirmFeedback"
        />
      </template>
    </BaseDialog>

    <!-- Identity Verification Dialog -->
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />
  </div>
</template>
