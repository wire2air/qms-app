<script setup>
import { IconMailOff, IconPlus, IconTrash } from '@tabler/icons-vue'
import { post, del } from '@/api' // Action RPC — CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'

/**
 * Support Desk → Spam blocklist (spec §2.5): the sender rules learned from
 * "Mark as spam" plus any added by hand. Future email / form / chat from a
 * listed value lands straight in the Spam box — kept, silent, reversible.
 */
const toast = useToast()
const { confirm } = useConfirm()
const canEdit = computed(() => isAllowed(['complaint_management:update']))

const entries = useLiveQuery(
  async (db) =>
    (await db.SupportBlocklistEntry.where().exec()).sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    ),
  { models: ['SupportBlocklistEntry'], initial: [] },
)
const brands = useLiveQuery((db) => db.SupportBrand.where().exec(), {
  models: ['SupportBrand'],
  initial: [],
})
function brandName(id) {
  return id ? (brands.value.find((b) => b.id === id)?.name ?? 'Brand') : 'All brands'
}
const KIND_LABEL = { EMAIL: 'Email', DOMAIN: 'Domain', VISITOR: 'Visitor', IP_HASH: 'IP' }

const showDialog = ref(false)
const saving = ref(false)
const form = ref({ kind: 'EMAIL', value: '', brandId: null, reason: '' })
function openCreate() {
  form.value = { kind: 'EMAIL', value: '', brandId: null, reason: '' }
  showDialog.value = true
}
async function save() {
  if (!form.value.value.trim()) return toast.error('Value is required')
  saving.value = true
  try {
    await post('/v1/services/supportDesk/blocklist', {
      kind: form.value.kind,
      value: form.value.value.trim(),
      brandId: form.value.brandId || null,
      reason: form.value.reason.trim() || undefined,
    })
    showDialog.value = false
    toast.success('Blocked')
  } catch (e) {
    toast.error(e?.message || 'Could not add')
  } finally {
    saving.value = false
  }
}
async function remove(e) {
  const ok = await confirm({
    title: 'Unblock',
    message: `Allow ${e.value} again? New messages from it will reach the inbox.`,
    okLabel: 'Unblock',
  })
  if (!ok) return
  try {
    await del(`/v1/services/supportDesk/blocklist/${e.id}`)
  } catch (err) {
    toast.error(err?.message || 'Could not remove')
  }
}
</script>

<template>
  <PageSection title="Spam blocklist" :icon="IconMailOff" variant="card">
    <template #actions>
      <BaseButton v-if="canEdit" variant="primary" size="sm" @click="openCreate">
        <IconPlus :size="16" class="tw:mr-1" /> Block sender
      </BaseButton>
    </template>
    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Senders learned from <strong>Mark as spam</strong> and any you add here. Matching email, form
      or chat still creates a ticket, but it opens in the Spam box with no notifications or
      auto-assignment. “Not spam” on a ticket removes what that ticket taught.
    </p>

    <div v-if="entries.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="e in entries"
        :key="e.id"
        class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <BaseBadge class="tw:bg-gray-100 tw:text-secondary tw:shrink-0">{{
          KIND_LABEL[e.kind] || e.kind
        }}</BaseBadge>
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:truncate tw:font-mono tw:text-sm">{{ e.value }}</div>
          <div class="tw:text-xs tw:text-secondary">
            {{ brandName(e.brandId) }}<template v-if="e.reason"> · {{ e.reason }}</template>
            <template v-if="e.createdAt"> · {{ e.createdAt.formatDate('date') }}</template>
          </div>
        </div>
        <button
          v-if="canEdit"
          class="tw:text-secondary tw:hover:text-red-600"
          title="Unblock"
          @click="remove(e)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>
    <div v-else class="tw:text-sm tw:text-secondary tw:italic">Nothing blocked.</div>

    <BaseDialog v-model="showDialog" title="Block sender" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <BaseField label="Kind">
          <BaseSelect
            v-model="form.kind"
            :options="[
              { value: 'EMAIL', label: 'Email address' },
              { value: 'DOMAIN', label: 'Whole domain' },
            ]"
          />
        </BaseField>
        <BaseField label="Value" required>
          <BaseTextInput
            v-model="form.value"
            :placeholder="form.kind === 'DOMAIN' ? 'spammer.example' : 'someone@spammer.example'"
          />
        </BaseField>
        <BaseField v-if="brands.length > 1" label="Scope">
          <BaseSelect
            v-model="form.brandId"
            :options="brands.map((b) => ({ value: b.id, label: b.name }))"
            nullLabel="All brands"
            clearable
          />
        </BaseField>
        <BaseField label="Reason"
          ><BaseTextInput v-model="form.reason" placeholder="optional note"
        /></BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Block"
          submitVariant="danger"
          :loading="saving"
          @cancel="close"
          @submit="save"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>
