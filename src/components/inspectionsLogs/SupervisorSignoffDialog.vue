<script setup>
/**
 * Over-the-shoulder sign-off (2026-08-09).
 *
 * The logged-in OPERATOR isn't a reviewer, but the log book allows
 * over-the-shoulder review: an AUTHORIZED REVIEWER (the supervisor OR an
 * additional reviewer) steps up to the operator's workstation, picks their name
 * and enters their PIN to approve/reject on the spot — no session switch.
 * Emits { reviewerUserId, token }; the caller POSTs the review with
 * `overTheShoulder: true`, and the backend verifies the PIN against that
 * reviewer, confirms they're authorized for the book, attributes the signature
 * to them, and records the operator on signatures.proxy_session_user_id.
 */
import { IconLock, IconUserShield } from '@tabler/icons-vue'

const props = defineProps({
  // Candidate authorized reviewers (userIds) for the book, resolved by caller.
  reviewerUserIds: { type: Array, default: () => [] },
  // 'Approve' | 'Reject'.
  action: { type: String, default: 'Approve' },
  // How many entries this sign-off covers (bulk); 1 for a single entry.
  count: { type: Number, default: 1 },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['verified'])
const open = defineModel({ type: Boolean, default: false })

const reviewerId = ref(null)
const pin = ref('')

const reviewers = useLiveQueryWithDeps(
  [() => props.reviewerUserIds.join(',')],
  async (db, [ids]) => {
    const list = ids ? ids.split(',').filter(Boolean) : []
    const out = []
    for (const id of list) {
      const u = await db.User.findByPk(id)
      if (u) out.push({ id: u.id, name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  },
  { models: ['User'], initial: [] },
)

const entriesLabel = computed(() => (props.count === 1 ? 'this entry' : `${props.count} entries`))

watch(open, (isOpen) => {
  if (isOpen) {
    pin.value = ''
    reviewerId.value = props.reviewerUserIds.length === 1 ? props.reviewerUserIds[0] : null
  }
})
// Default to the sole reviewer once resolved.
watch(reviewers, (list) => {
  if (!reviewerId.value && list.length === 1) reviewerId.value = list[0].id
})

const canConfirm = computed(() => !!reviewerId.value && !!pin.value && !props.loading)

function confirm() {
  if (!canConfirm.value) return
  emit('verified', { reviewerUserId: reviewerId.value, token: pin.value })
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
          A reviewer is signing off {{ entriesLabel }} as
          <span :class="action === 'Reject' ? 'tw:text-red-600' : 'tw:text-emerald-600'" class="tw:font-semibold">
            {{ action === 'Reject' ? 'Rejected' : 'Approved' }}</span>
          at this workstation. This is recorded under the reviewer's identity, with the logged-in
          operator's session captured in the audit trail.
        </div>
      </div>

      <div
        v-if="reviewers.length === 0"
        class="tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:text-xs"
      >
        No authorized reviewer is available for this log book. Set a Supervisor or add reviewers on
        the log book's Details tab.
      </div>
      <template v-else>
        <BaseField label="Reviewer" required>
          <BaseSelect
            v-model="reviewerId"
            :options="reviewers"
            optionLabel="name"
            optionValue="id"
            nullLabel="Select reviewer…"
            :disabled="reviewers.length === 1"
          />
        </BaseField>
        <BaseField v-slot="{ id: fieldId }" label="Reviewer e-signature PIN" required>
          <BaseTextInput
            :id="fieldId"
            v-model="pin"
            type="password"
            noReveal
            placeholder="Reviewer's PIN"
            autocomplete="off"
            @keyup.enter="confirm"
          >
            <template #icon><IconLock :size="18" class="tw:text-secondary" /></template>
          </BaseTextInput>
        </BaseField>
      </template>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="`Sign off — ${action}`"
        :loading="loading"
        :disabled="!canConfirm"
        @cancel="close"
        @submit="confirm"
      />
    </template>
  </BaseDialog>
</template>
