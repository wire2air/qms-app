<script setup>
/**
 * QA Investigation notes — the QA team's internal investigation trail on a
 * complaint. Distinct from the customer-facing conversation: these are QA_NOTE
 * messages (never emailed, never flip status, hidden from the conversation).
 * QA members investigating a ticket assigned to them add notes here.
 */
import { IconClipboardText, IconSend } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  complaintId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const toast = useToast()

const notes = useLiveQueryWithDeps(
  [() => props.complaintId],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    const rows = await db.CustomerComplaintMessage.where('complaintId', complaintId).exec()
    return rows
      .filter((m) => m.kind === 'QA_NOTE')
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['CustomerComplaintMessage'], initial: [] },
)

const draft = ref('')
const saving = ref(false)

async function addNote() {
  const body = draft.value.trim()
  if (!body || saving.value) return
  saving.value = true
  try {
    await post(`/v1/services/customerComplaints/${props.complaintId}/reply`, {
      body,
      kind: 'QA_NOTE',
    })
    draft.value = ''
  } catch (e) {
    toast.error(e?.message || 'Failed to add note')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div class="tw:flex tw:items-center tw:gap-2">
      <IconClipboardText :size="18" class="tw:text-primary" />
      <BaseText as="h3" variant="subheading" weight="bold">QA Investigation</BaseText>
    </div>
    <p class="tw:text-xs tw:text-secondary">
      Internal QA notes — investigation findings, actions, and follow-ups. Never sent to the
      customer.
    </p>

    <div v-if="notes.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="note in notes"
        :key="note.id"
        class="tw:rounded-lg tw:border tw:border-divider tw:bg-amber-50/40 tw:p-3"
      >
        <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mb-1">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">
            {{ note.senderName || 'QA' }}
          </span>
          <span class="tw:text-xs tw:text-secondary">
            {{ note.createdAt?.formatDate('datetime') }}
          </span>
        </div>
        <div class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">{{ note.body }}</div>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">No QA notes yet.</div>

    <div v-if="canUpdate" class="tw:flex tw:flex-col tw:gap-2">
      <BaseTextarea
        v-model="draft"
        :rows="3"
        placeholder="Add an investigation note…"
        @keydown.meta.enter="addNote"
        @keydown.ctrl.enter="addNote"
      />
      <div class="tw:flex tw:justify-end">
        <BaseButton
          variant="primary"
          size="sm"
          :loading="saving"
          :disabled="!draft.trim() || saving"
          @click="addNote"
        >
          <template #icon><IconSend :size="14" /></template>
          Add note
        </BaseButton>
      </div>
    </div>
  </div>
</template>
