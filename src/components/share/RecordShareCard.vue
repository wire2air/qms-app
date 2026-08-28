<script setup>
/**
 * "Share externally" rail card — share a record with someone outside the
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
  /** Custodian column when it is not `ownerId` (module records: ownerUserId). */
  scopeOwnerField: { type: String, default: null },
})

const toast = useToast()
const email = ref('')
const sending = ref(false)

const canShare = computed(() =>
  props.record
    ? isAllowedOnRecord(
        `${props.module}:manage_access`,
        props.record,
        props.scopeOwnerField ? { ownerField: props.scopeOwnerField } : {},
      )
    : false,
)

const links = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) =>
    // The FIRST where() must name a real index — `entityId` alone is not one,
    // and asking for it throws NotFoundError out of IDBObjectStore.index(),
    // which kills the live query and takes the sync subscriber with it. The
    // model declares the compound [entityType+entityId]; use it.
    db.RecordShareLink.where('[entityType+entityId]', [entityType, entityId])
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

/**
 * Split what was typed into addresses.
 *
 * People paste from a mail client, so accept what a mail client emits —
 * commas, semicolons, newlines, spaces — rather than making them clean it up.
 */
function parseAddresses(value) {
  return value
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter(Boolean)
}

const addresses = computed(() => parseAddresses(email.value))

async function share() {
  const list = addresses.value
  if (!list.length) return
  sending.value = true
  try {
    // Each address gets its OWN link — own code, own expiry, revocable alone.
    const data = await post(
      '/v1/services/recordShareLinks',
      { entityType: props.entityType, entityId: props.entityId, emails: list },
      { showError: true },
    )
    email.value = ''

    const sent = data.shared ?? []
    const reused = sent.filter((s) => s.reused).length
    const parts = []
    if (sent.length === 1) {
      parts.push(
        sent[0].reused
          ? `Sent a fresh link to ${sent[0].shareLink.email} — they already had access, so no second link was created.`
          : `Shared with ${sent[0].shareLink.email}.`,
      )
    } else if (sent.length > 1) {
      parts.push(`Shared with ${sent.length} people.`)
      if (reused) parts.push(`${reused} already had access and got a fresh link.`)
    }
    if (parts.length) toast.success(parts.join(' '))

    // Surfaced separately: the valid addresses were sent, and only the typo
    // needs fixing.
    if (data.invalid?.length) {
      toast.error(`Not a valid email address: ${data.invalid.join(', ')}`)
    }
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
    title="Share externally"
    titleHelp="Give someone outside the company read-only access to a summary of this record. Each person gets their own link, opened with a code emailed to that same address, and access can be withdrawn at any time."
  >
    <div class="tw:flex tw:flex-col tw:gap-3">
      <div v-if="canShare" class="tw:flex tw:gap-2">
        <BaseTextInput
          v-model="email"
          placeholder="name@company.com, another@company.com"
          size="sm"
          class="tw:flex-1"
          @keyup.enter="share"
        />
        <BaseButton size="sm" :loading="sending" :disabled="!addresses.length" @click="share">
          <IconSend :size="14" />
        </BaseButton>
      </div>

      <!-- "Not shared with anyone outside the company" read as a RULE — as
           though the record were marked un-shareable — rather than as the
           current state. "Nobody … yet" can only be read as a fact about now. -->
      <div v-if="!liveLinks.length && !revokedLinks.length">
        <BaseText color="secondary" class="tw:text-sm">
          Nobody outside the company has access yet.
        </BaseText>
      </div>

      <BaseText
        v-if="liveLinks.length"
        color="secondary"
        class="tw:text-xs tw:uppercase tw:tracking-wide"
      >
        Has access
      </BaseText>

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
