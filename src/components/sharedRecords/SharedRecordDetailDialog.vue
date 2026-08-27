<script setup>
/**
 * One share, in full: who holds it, what it points at, every time it was
 * opened, and the button that takes it away.
 *
 * This is the "full view not just share and forget" half of the feature — a
 * share is an OBJECT with a lifecycle, not an event that fired once. Access
 * history is the part that cannot be reconstructed later, so it is the body of
 * this dialog rather than a footnote.
 */
import { IconBan, IconExternalLink } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  row: { type: Object, required: true },
})

const emit = defineEmits(['close'])

const toast = useToast()
const revoking = ref(false)
const confirmingRevoke = ref(false)

/**
 * Every view of this link, newest first.
 *
 * Read from the synced table rather than a count on the link, because "who
 * opened it and when" is the question, and a counter cannot answer it.
 */
// Package manifest (Audit Records Package rows) — what exactly the link
// exposes, resolved to numbers/titles.
const packageItems = useLiveQueryWithDeps(
  [() => (props.row.entityType === 'AuditInstance' ? props.row.id : null)],
  async (db, [linkId]) => {
    if (!linkId) return []
    return db.RecordShareLinkItem.where('recordShareLinkId', linkId).exec()
  },
  { models: ['RecordShareLinkItem'], initial: [] },
)
const PKG_ITEM_MODELS = {
  Document: { model: 'Document', numberField: 'docNumber', label: 'Document' },
  Capa: { model: 'Capa', numberField: 'capaNumber', label: 'CAPA' },
  Nonconformance: { model: 'Nonconformance', numberField: 'ncNumber', label: 'NC' },
  QualityEvent: { model: 'QualityEvent', numberField: 'eventNumber', label: 'Quality Event' },
  ChangeRequest: { model: 'ChangeRequest', numberField: 'crNumber', label: 'Change Request' },
  Record: { model: 'Record', numberField: 'recordNumber', label: 'Module record' },
}
const packageResolved = useLiveQueryWithDeps(
  [() => packageItems.value.map((i) => `${i.entityType}:${i.entityId}`).join(',')],
  async (db, [csv]) => {
    const out = []
    for (const pair of (csv || '').split(',').filter(Boolean)) {
      const [entityType, entityId] = pair.split(':')
      const cfg = PKG_ITEM_MODELS[entityType]
      const rec = cfg ? await db[cfg.model]?.findByPk(entityId) : null
      out.push({
        key: pair,
        label: cfg?.label || entityType,
        reference: rec?.[cfg?.numberField] || null,
        title: rec?.title || null,
      })
    }
    return out
  },
  { initial: [] },
)

const views = useLiveQueryWithDeps(
  [() => props.row.id],
  async (db, [shareLinkId]) =>
    db.RecordShareLinkView.where('shareLinkId', shareLinkId).orderBy('viewedAt', 'desc').exec(),
  { models: ['RecordShareLinkView'], initial: [] },
)

async function revoke() {
  revoking.value = true
  try {
    await post(`/v1/services/recordShareLinks/${props.row.id}/revoke`, {}, { showError: true })
    // Withdrawal takes effect on the next request, including for files already
    // on screen — there is no cached copy anywhere to clean up.
    toast.success(`Access withdrawn for ${props.row.email}.`)
    emit('close')
  } finally {
    revoking.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="true" title="Shared record" size="md" @update:modelValue="emit('close')">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
        <div class="tw:min-w-0">
          <BaseText color="secondary" class="tw:text-xs tw:uppercase tw:tracking-wide">
            {{ props.row.entityLabel }}
          </BaseText>
          <RouterLink
            v-if="props.row.to"
            :to="props.row.to"
            class="tw:flex tw:items-center tw:gap-1 tw:font-medium tw:text-on-main tw:hover:text-primary"
          >
            {{ props.row.reference || 'Open record' }}
            <IconExternalLink :size="14" />
          </RouterLink>
          <BaseText v-else class="tw:font-medium">{{ props.row.reference || '—' }}</BaseText>
          <BaseText v-if="props.row.recordTitle" color="secondary" class="tw:text-sm">
            {{ props.row.recordTitle }}
          </BaseText>
        </div>
        <ShareLinkStatusBadgeById :statusId="props.row.statusId" />
      </div>

      <dl class="tw:grid tw:gap-x-6 tw:gap-y-3 sm:tw:grid-cols-2">
        <div>
          <dt class="tw:text-xs tw:text-secondary">Shared with</dt>
          <dd class="tw:mt-0.5 tw:text-sm tw:break-all">{{ props.row.email }}</dd>
        </div>
        <div>
          <dt class="tw:text-xs tw:text-secondary">Shared by</dt>
          <dd class="tw:mt-0.5 tw:text-sm">
            {{ props.row.sharedBy || `${props.row.origin} (automatic)` }}
          </dd>
        </div>
        <div>
          <dt class="tw:text-xs tw:text-secondary">Shared on</dt>
          <dd class="tw:mt-0.5 tw:text-sm">
            {{ props.row.createdAt ? props.row.createdAt.formatDate('datetime') : '—' }}
          </dd>
        </div>
        <div>
          <dt class="tw:text-xs tw:text-secondary">Expires</dt>
          <dd class="tw:mt-0.5 tw:text-sm">
            {{ props.row.expiresAt ? props.row.expiresAt.formatDate('datetime') : '—' }}
          </dd>
        </div>
      </dl>

      <div v-if="props.row.entityType === 'AuditInstance' && packageResolved.length">
        <BaseText variant="overline" class="tw:mb-1 tw:block">
          Package contents ({{ packageResolved.length }})
        </BaseText>

        <ul
          class="tw:m-0 tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:rounded-lg tw:border tw:border-divider tw:p-0"
        >
          <li
            v-for="it in packageResolved"
            :key="it.key"
            class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1.5 tw:text-sm tw:list-none"
          >
            <span
              class="tw:w-28 tw:shrink-0 tw:text-xs tw:uppercase tw:tracking-wide tw:text-secondary"
            >
              {{ it.label }}
            </span>

            <span class="tw:min-w-0 tw:truncate">
              <span class="tw:font-medium">{{ it.reference || '—' }}</span>

              <template v-if="it.title"> · {{ it.title }}</template>
            </span>
          </li>
        </ul>
      </div>

      <div>
        <BaseText color="secondary" class="tw:mb-2 tw:text-xs tw:uppercase tw:tracking-wide">
          Access history
        </BaseText>

        <BaseText v-if="!views?.length" color="secondary" class="tw:text-sm">
          <!-- Sent but never opened is a finding in itself: it usually means the
               email did not reach anybody. -->
          Never opened. The code is emailed to {{ props.row.email }} on each visit.
        </BaseText>

        <div
          v-else
          class="tw:max-h-64 tw:overflow-auto tw:rounded-xl tw:border tw:border-divider tw:divide-y tw:divide-divider"
        >
          <div v-for="view in views" :key="view.id" class="tw:px-3 tw:py-2">
            <BaseText class="tw:text-sm">{{ view.viewedAt.formatDate('datetime') }}</BaseText>
            <BaseText v-if="view.ip" color="secondary" class="tw:block tw:text-xs">
              {{ view.ip }}
            </BaseText>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2">
        <BaseText v-if="confirmingRevoke" color="secondary" class="tw:text-sm">
          {{ props.row.email }} loses access immediately.
        </BaseText>
        <div v-else />

        <div class="tw:flex tw:gap-2">
          <BaseButton variant="secondary" @click="emit('close')">Close</BaseButton>
          <BaseButton
            v-if="props.row.statusId === 'ACTIVE'"
            variant="danger"
            :loading="revoking"
            @click="confirmingRevoke ? revoke() : (confirmingRevoke = true)"
          >
            <IconBan :size="14" class="tw:mr-1.5" />
            {{ confirmingRevoke ? 'Confirm withdraw' : 'Withdraw access' }}
          </BaseButton>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>
