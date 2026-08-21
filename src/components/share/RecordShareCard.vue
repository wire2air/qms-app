<script setup>
/**
 * "Shared externally" rail card — share a record with someone outside the
 * company, and see who currently has access.
 *
 * A share is an OBJECT, not a fired action: it is listed, it shows whether it
 * has actually been opened, and it can be withdrawn. Without that, nobody can
 * answer "who still has access", which is the first question asked when an
 * external party turns out to have seen something.
 *
 * Gated on `<module>:manage_access` AT RECORD SCOPE — the same check the server
 * runs. Sharing is its own verb rather than riding on `update`: someone trusted
 * to fix a typo on an NC has not thereby been trusted to send it to the
 * supplier it accuses.
 */
import { IconSend, IconTrash, IconEye, IconClock, IconRobot } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { isAllowedOnRecord } from '@/utils/currentSession.js'

const props = defineProps({
  /** Share entity type, e.g. 'Nonconformance'. */
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  /** Permission module for this record, e.g. 'ncr'. */
  module: { type: String, required: true },
  /** The record itself — needed for the record-scope permission check. */
  record: { type: Object, default: null },
})

const toast = useToast()
const email = ref('')
const sending = ref(false)

const canShare = computed(() =>
  props.record ? isAllowedOnRecord(`${props.module}:manage_access`, props.record) : false,
)

const links = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) =>
    db.RecordShareLink.where('entityId', entityId)
      .where('entityType', entityType)
      .orderBy('createdAt', 'desc')
      .exec(),
  { models: ['RecordShareLink'], initial: [] },
)

/** Revoked links stay in the list — "shared then withdrawn" is the history. */
const liveLinks = computed(() => (links.value || []).filter((l) => !l.revokedAt))
const revokedLinks = computed(() => (links.value || []).filter((l) => l.revokedAt))

function isExpired(link) {
  return new Date(link.expiresAt) <= new Date()
}

async function share() {
  const address = email.value.trim()
  if (!address) return
  sending.value = true
  try {
    const data = await post(
      '/v1/services/recordShareLinks',
      { entityType: props.entityType, entityId: props.entityId, email: address },
      { showError: true },
    )
    email.value = ''
    toast.success(
      data.reused
        ? `Sent a fresh link to ${address} — they already had access, so no second link was created.`
        : `Shared with ${address}.`,
    )
  } finally {
    sending.value = false
  }
}

async function revoke(link) {
  await post(`/v1/services/recordShareLinks/${link.id}/revoke`, {}, { showError: true })
  toast.success(`Access withdrawn for ${link.email}.`)
}
</script>

<template>
  <BaseRailCard
    title="Shared externally"
    titleHelp="People outside the company who can open a read-only summary of this record. They verify a code emailed to them each visit, and access can be withdrawn at any time."
  >
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div v-if="canShare" class="tw:flex tw:gap-2">
        <BaseTextInput
          v-model="email"
          placeholder="name@company.com"
          size="sm"
          class="tw:flex-1"
          @keyup.enter="share"
        />
        <BaseButton size="sm" :loading="sending" :disabled="!email.trim()" @click="share">
          <IconSend :size="14" />
        </BaseButton>
      </div>

      <div v-if="!liveLinks.length && !revokedLinks.length">
        <BaseText color="secondary" class="tw:text-sm">
          Not shared with anyone outside the company.
        </BaseText>
      </div>

      <div v-for="link in liveLinks" :key="link.id" class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
          <span class="tw:truncate tw:text-sm">{{ link.email }}</span>
          <button
            v-if="canShare"
            type="button"
            class="tw:text-secondary hover:tw:text-red-600"
            :aria-label="`Withdraw access for ${link.email}`"
            @click="revoke(link)"
          >
            <IconTrash :size="14" />
          </button>
        </div>
        <div
          class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1 tw:text-xs tw:text-secondary"
        >
          <!-- Origin, because "I shared this" and "a rule did at 3am" are
               different in kind. -->
          <span v-if="link.origin === 'NOTIFICATION'" class="tw:flex tw:items-center tw:gap-1">
            <IconRobot :size="12" /> sent by a notification
          </span>
          <span v-if="link.viewCount" class="tw:flex tw:items-center tw:gap-1">
            <IconEye :size="12" />
            viewed {{ link.viewCount }}×, last {{ link.lastViewedAt?.formatDate('date') }}
          </span>
          <span v-else class="tw:flex tw:items-center tw:gap-1">
            <IconEye :size="12" /> never opened
          </span>
          <span class="tw:flex tw:items-center tw:gap-1">
            <IconClock :size="12" />
            <template v-if="isExpired(link)">expired</template>
            <template v-else>expires {{ link.expiresAt?.formatDate('date') }}</template>
          </span>
        </div>
      </div>

      <div v-if="revokedLinks.length" class="tw:border-t tw:border-input-border tw:pt-2">
        <BaseText color="secondary" class="tw:text-xs">
          Withdrawn: {{ revokedLinks.map((l) => l.email).join(', ') }}
        </BaseText>
      </div>
    </div>
  </BaseRailCard>
</template>
