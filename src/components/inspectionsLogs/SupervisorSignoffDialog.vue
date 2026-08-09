<script setup>
/**
 * Over-the-shoulder supervisor sign-off (2026-08-09).
 *
 * Shown when the logged-in OPERATOR isn't a reviewer but the log book allows
 * over-the-shoulder review: the designated Supervisor steps up to the operator's
 * workstation and enters their PIN to approve/reject on the spot — no session
 * switch. Emits `verified` with the PIN; the caller POSTs the review with
 * `overTheShoulder: true`, and the backend verifies the PIN against the book's
 * supervisor, attributes the signature to them, and records the operator's
 * session on signatures.proxy_session_user_id.
 *
 * We already KNOW who the supervisor is (the book's supervisorUserId), so this
 * only asks for their PIN — the operator can't sign off as anyone else.
 */
import { IconLock, IconUserShield } from '@tabler/icons-vue'

const props = defineProps({
  supervisorUserId: { type: String, default: null },
  // 'Approve' | 'Reject' — drives the confirm button + heading.
  action: { type: String, default: 'Approve' },
  // How many entries this sign-off covers (bulk); 1 for a single entry.
  count: { type: Number, default: 1 },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['verified'])
const open = defineModel({ type: Boolean, default: false })

const pin = ref('')

const supervisor = useLiveQueryWithDeps(
  [() => props.supervisorUserId],
  async (db, [id]) => (id ? db.User.findByPk(id) : null),
  { models: ['User'] },
)
const supervisorName = computed(() => {
  const u = supervisor.value
  if (!u) return 'the supervisor'
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || 'the supervisor'
})

const entriesLabel = computed(() =>
  props.count === 1 ? 'this entry' : `${props.count} entries`,
)

watch(open, (isOpen) => {
  if (isOpen) pin.value = ''
})

function confirm() {
  if (!pin.value || props.loading) return
  emit('verified', { token: pin.value })
}
</script>

<template>
  <BaseDialog v-model="open" title="Over-the-shoulder sign-off" maxWidth="md" persistent>
    <div class="tw:flex tw:flex-col tw:gap-4 tw:py-1">
      <div class="tw:flex tw:items-start tw:gap-3 tw:bg-main-hover tw:rounded-lg tw:p-3">
        <div
          class="tw:w-9 tw:h-9 tw:rounded-full tw:bg-primary/10 tw:text-primary tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconUserShield :size="20" />
        </div>
        <div class="tw:text-sm tw:text-on-main">
          <span class="tw:font-semibold">{{ supervisorName }}</span>
          is signing off {{ entriesLabel }} as
          <span :class="action === 'Reject' ? 'tw:text-red-600' : 'tw:text-emerald-600'" class="tw:font-semibold">
            {{ action === 'Reject' ? 'Rejected' : 'Approved' }}</span>
          at this workstation. This is recorded under the supervisor's identity, with the
          logged-in operator's session captured in the audit trail.
        </div>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Supervisor e-signature PIN" required>
        <BaseTextInput
          :id="fieldId"
          v-model="pin"
          type="password"
          noReveal
          placeholder="Supervisor's PIN"
          autocomplete="off"
          @keyup.enter="confirm"
        >
          <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
        </BaseTextInput>
      </BaseField>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="`Sign off — ${action}`"
        :loading="loading"
        :disabled="!pin || loading"
        @cancel="close"
        @submit="confirm"
      />
    </template>
  </BaseDialog>
</template>
