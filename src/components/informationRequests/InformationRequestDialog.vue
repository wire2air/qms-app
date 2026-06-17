<script setup>
/**
 * Generic Request-for-Information dialog.
 *
 * Three modes drive what the dialog shows + which endpoint it hits:
 *   - mode='create'      → ask: question textarea + submit
 *   - mode='respond'     → reply: shows question, response textarea + submit
 *   - mode='view'        → read-only thread, optional acknowledge button
 *
 * The host entity is identified by entityType + entityId. The dialog
 * resolves the recipient (NC owner / CAPA owner / Document owner) by
 * looking up the row directly — no need for callers to pass it.
 */
import { IconQuestionMark, IconSend, IconCheck } from '@tabler/icons-vue'
import { post } from '@/api'

const props = defineProps({
  // 'create' | 'respond' | 'view'
  mode: { type: String, required: true },
  entityType: { type: String, default: null },
  entityId: { type: String, default: null },
  // Required in respond/view. Ignored (and resolved by backend) in create.
  rfiId: { type: String, default: null },
})

const emit = defineEmits(['submitted'])
const open = defineModel({ type: Boolean, default: false })

const toast = useToast()
const submitting = ref(false)
const questionDraft = ref('')
const responseDraft = ref('')

// Existing RFI for respond/view modes. Live so changes (e.g. the other
// party responded while the dialog was open) flow in.
const rfi = useLiveQueryWithDeps(
  [() => props.rfiId],

  async (db, [id]) => (id ? db.InformationRequest.findByPk(id) : null),
  { models: ['InformationRequest'] },
)

// Resolve the entity owner for the "send to" hint shown in create mode.
const recipient = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId, () => rfi.value?.recipientId],

  async (db, [entityType, entityId, rfiRecipientId]) => {
    // In respond/view, the RFI already names the recipient.
    if (rfiRecipientId) return db.User.findByPk(rfiRecipientId)
    if (!entityType || !entityId) return null
    if (entityType === 'Nonconformance') {
      const nc = await db.Nonconformance.findByPk(entityId)
      return nc?.ownerId ? db.User.findByPk(nc.ownerId) : null
    }
    if (entityType === 'Capa') {
      const capa = await db.Capa.findByPk(entityId)
      return capa?.ownerId ? db.User.findByPk(capa.ownerId) : null
    }
    return null
  },
  { models: ['User', 'Nonconformance', 'Capa'] },
)

const requester = useLiveQueryWithDeps(
  [() => rfi.value?.requesterId],

  async (db, [id]) => (id ? db.User.findByPk(id) : null),
  { models: ['User'] },
)

function userLabel(u) {
  if (!u) return '—'
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email
}

const title = computed(() => {
  if (props.mode === 'create') return 'Request information'
  if (props.mode === 'respond') return 'Respond to information request'
  return 'Information request'
})

watch(open, (isOpen) => {
  if (isOpen && props.mode === 'create') {
    questionDraft.value = ''
  }
  if (isOpen && props.mode === 'respond') {
    responseDraft.value = ''
  }
})

async function handleCreate() {
  if (!questionDraft.value.trim()) {
    toast.warning('Please enter a question')
    return
  }
  submitting.value = true
  try {
    await post('/v1/services/informationRequests', {
      entityType: props.entityType,
      entityId: props.entityId,
      question: questionDraft.value.trim(),
    })
    toast.success('Information request sent')
    open.value = false
    emit('submitted')
  } catch (e) {
    toast.error(e?.message || 'Failed to send request')
  } finally {
    submitting.value = false
  }
}

async function handleRespond() {
  if (!responseDraft.value.trim()) {
    toast.warning('Please enter a response')
    return
  }
  submitting.value = true
  try {
    await post(`/v1/services/informationRequests/${props.rfiId}/respond`, {
      response: responseDraft.value.trim(),
    })
    toast.success('Response sent')
    open.value = false
    emit('submitted')
  } catch (e) {
    toast.error(e?.message || 'Failed to send response')
  } finally {
    submitting.value = false
  }
}

async function handleAcknowledge() {
  submitting.value = true
  try {
    await post(`/v1/services/informationRequests/${props.rfiId}/acknowledge`, {})
    toast.success('Acknowledged')
    open.value = false
    emit('submitted')
  } catch (e) {
    toast.error(e?.message || 'Failed to acknowledge')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" :title="title" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- ── CREATE MODE ───────────────────────────────────────────── -->
      <template v-if="mode === 'create'">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200"
        >
          <IconQuestionMark :size="20" class="tw:text-blue-600 tw:shrink-0 tw:mt-0.5" />
          <div class="tw:text-sm tw:text-blue-800">
            Ask <strong>{{ userLabel(recipient) }}</strong> for clarification on this record.
            They'll get a task in their inbox and respond here. You'll get a follow-up task once
            they reply.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Your question" required>
          <BaseTextarea
            :id="fieldId"
            v-model="questionDraft"
            :rows="5"
            placeholder="What clarification do you need?"
          />
        </BaseField>
      </template>

      <!-- ── RESPOND MODE ──────────────────────────────────────────── -->
      <template v-else-if="mode === 'respond'">
        <div>
          <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Question from {{ userLabel(requester) }}
          </div>
          <p
            class="tw:text-sm tw:text-on-main tw:bg-main-hover tw:rounded-md tw:p-3 tw:whitespace-pre-wrap"
          >
            {{ rfi?.question || '—' }}
          </p>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Your response" required>
          <BaseTextarea
            :id="fieldId"
            v-model="responseDraft"
            :rows="5"
            placeholder="Provide the clarification…"
          />
        </BaseField>
      </template>

      <!-- ── VIEW MODE ─────────────────────────────────────────────── -->
      <template v-else>
        <div>
          <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Question from {{ userLabel(requester) }}
          </div>
          <p
            class="tw:text-sm tw:text-on-main tw:bg-main-hover tw:rounded-md tw:p-3 tw:whitespace-pre-wrap"
          >
            {{ rfi?.question || '—' }}
          </p>
        </div>
        <div v-if="rfi?.response">
          <div class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Response from {{ userLabel(recipient) }}
          </div>
          <p
            class="tw:text-sm tw:text-on-main tw:bg-emerald-50 tw:border tw:border-emerald-200 tw:rounded-md tw:p-3 tw:whitespace-pre-wrap"
          >
            {{ rfi.response }}
          </p>
        </div>
        <div v-else class="tw:text-xs tw:text-secondary tw:italic">Awaiting response.</div>
      </template>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="submitting" @click="close">Close</BaseButton>
      <BaseButton
        v-if="mode === 'create'"
        variant="primary"
        :loading="submitting"
        :disabled="!questionDraft.trim() || submitting"
        @click="handleCreate"
      >
        <template #icon><IconSend :size="16" /></template>
        Send request
      </BaseButton>
      <BaseButton
        v-else-if="mode === 'respond'"
        variant="primary"
        :loading="submitting"
        :disabled="!responseDraft.trim() || submitting"
        @click="handleRespond"
      >
        <template #icon><IconSend :size="16" /></template>
        Send response
      </BaseButton>
      <BaseButton
        v-else-if="mode === 'view' && rfi?.statusId === 'RESPONDED'"
        variant="primary"
        :loading="submitting"
        :disabled="submitting"
        @click="handleAcknowledge"
      >
        <template #icon><IconCheck :size="16" /></template>
        Acknowledge &amp; close
      </BaseButton>
    </template>
  </BaseDialog>
</template>
