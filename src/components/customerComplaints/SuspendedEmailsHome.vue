<script setup>
import { IconMailPause, IconTrash, IconRefresh } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
// Suspended emails are an unsynced quarantine table, REST-managed.
import { get, del } from '@/api'

/**
 * Suspended emails — quarantined inbound mail that did not become a
 * ticket: auto-responders (mail-loop guard), mail to channels still
 * pending verification (e.g. Gmail forwarding confirmations), and
 * self-addressed mail. Visibility tab so nothing silently disappears.
 */
const toast = useToast()

const loading = ref(true)
const rows = ref([])

async function load() {
  loading.value = true
  try {
    const data = await get('/v1/services/customerComplaints/suspendedEmails', {
      showError: false,
    })
    rows.value = data.suspendedEmails ?? []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)

const REASON_MAP = {
  AUTO_RESPONDER: { name: 'Auto-responder', class: 'tw:bg-amber-100 tw:text-amber-700' },
  PENDING_CHANNEL: { name: 'Channel not verified', class: 'tw:bg-blue-100 tw:text-blue-700' },
  SELF_ADDRESSED: { name: 'Self-addressed', class: 'tw:bg-red-100 tw:text-red-700' },
}

function reason(id) {
  return REASON_MAP[id] || { name: id, class: 'tw:bg-gray-100 tw:text-gray-600' }
}

async function handleDelete(row) {
  try {
    await del(`/v1/services/customerComplaints/suspendedEmails/${row.id}`)
    rows.value = rows.value.filter((r) => r.id !== row.id)
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to delete' })
  }
}
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
    >
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconMailPause :size="18" class="tw:text-primary" />
        <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
          Suspended Emails
        </div>
      </div>
      <BaseButton variant="outline" size="sm" :disabled="loading" @click="load">
        <IconRefresh :size="14" class="tw:mr-1" />
        Refresh
      </BaseButton>
    </div>

    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Inbound mail that was quarantined instead of becoming a ticket — auto-responders, mail to
      unverified channels (including forwarding confirmation emails), and self-addressed loops.
    </p>

    <div v-if="loading" class="tw:py-8 tw:text-center tw:text-sm tw:text-secondary">Loading…</div>
    <div
      v-else-if="!rows.length"
      class="tw:py-8 tw:text-center tw:text-sm tw:text-secondary tw:italic"
    >
      No suspended emails.
    </div>
    <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <div v-for="row in rows" :key="row.id" class="tw:flex tw:items-start tw:gap-3 tw:py-3">
        <BaseBadge :class="reason(row.reason).class" class="tw:shrink-0 tw:mt-0.5">
          {{ reason(row.reason).name }}
        </BaseBadge>
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:text-sm tw:font-medium tw:truncate">
            {{ row.subject || '(no subject)' }}
          </div>
          <div class="tw:text-xs tw:text-secondary tw:truncate">
            From {{ row.fromEmail }} → {{ row.toEmail }}
          </div>
          <div v-if="row.bodyPreview" class="tw:text-xs tw:text-secondary tw:truncate tw:mt-0.5">
            {{ row.bodyPreview }}
          </div>
        </div>
        <div class="tw:text-xs tw:text-secondary tw:shrink-0">
          {{ row.createdAt?.formatDate?.('datetime') ?? '' }}
        </div>
        <button
          class="tw:text-secondary tw:hover:text-red-600 tw:shrink-0"
          title="Delete"
          @click="handleDelete(row)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
