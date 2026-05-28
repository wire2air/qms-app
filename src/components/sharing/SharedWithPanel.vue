<script setup>
import { IconShare, IconUser, IconUsers, IconRoute, IconTrash } from '@tabler/icons-vue'
import { post, del } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

/**
 * Generic per-record "Shared with" panel — drop on any document / CAPA
 * / NC detail page (or future entity types). Lists who has access via
 * the shared_with_user junction and exposes the share dialog.
 *
 * Entity-agnostic: the component knows nothing about Documents vs CAPAs
 * vs NCs — entityType is just an opaque string the API + RLS branch on.
 */
const props = defineProps({
  entityType: {
    type: String,
    required: true,
    validator: (v) => ['Document', 'Capa', 'Nonconformance'].includes(v),
  },
  entityId: { type: String, required: true },
  // Whether the current user is allowed to grant / revoke shares.
  // Mirrors the per-entity update permission — the backend's RLS gates
  // INSERT/DELETE on the same.
  canShare: { type: Boolean, default: false },
})

const toast = useToast()

const shares = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) => {
    if (!entityType || !entityId) return []
    const rows = await db.SharedWithUser.where('[entityType+entityId]', [
      entityType,
      entityId,
    ]).exec()
    return rows.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const showShareDialog = ref(false)
const pendingUserId = ref(null)
const pendingNotes = ref('')
const isSharing = ref(false)

function openShareDialog() {
  if (!props.canShare) return
  pendingUserId.value = null
  pendingNotes.value = ''
  showShareDialog.value = true
}

async function confirmShare() {
  if (!pendingUserId.value) {
    toast.error('Pick a user to share with')
    return
  }
  isSharing.value = true
  try {
    await post('/v1/services/sharing', {
      entityType: props.entityType,
      entityId: props.entityId,
      userId: pendingUserId.value,
      notes: pendingNotes.value?.trim() || null,
    })
    toast.success('Shared')
    showShareDialog.value = false
  } catch (err) {
    toast.error(err?.message || 'Failed to share')
  } finally {
    isSharing.value = false
  }
}

async function revokeShare(share) {
  if (!props.canShare) return
  if (!confirm(`Revoke this share? The user will no longer see this ${props.entityType}.`)) {
    return
  }
  try {
    await del(`/v1/services/sharing/${share.id}`)
    toast.success('Share revoked')
  } catch (err) {
    toast.error(err?.message || 'Failed to revoke')
  }
}

function viaLabel(s) {
  return s.grantedVia === 'WORKFLOW_ASSIGNMENT' ? 'via workflow' : 'manual'
}
</script>

<template>
  <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3">
    <div class="tw:flex tw:items-center tw:justify-between tw:gap-3">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconUsers :size="18" class="tw:text-primary" />
        <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">
          Shared with
          <span v-if="shares.length" class="tw:text-secondary tw:font-normal">
            ({{ shares.length }})
          </span>
        </h3>
      </div>
      <BaseButton v-if="canShare" variant="primary" size="sm" @click="openShareDialog">
        <IconShare :size="14" />
        Share
      </BaseButton>
    </div>

    <p v-if="!canShare && shares.length === 0" class="tw:text-xs tw:text-secondary">
      No one outside the default permission scope has been given access to this {{ entityType }}.
    </p>

    <div v-else-if="shares.length === 0" class="tw:text-xs tw:text-secondary tw:italic">
      Not shared with anyone yet. Click <strong>Share</strong> to grant a user (typically a supplier
      user) read access.
    </div>

    <ul v-else class="tw:flex tw:flex-col tw:gap-1.5">
      <li
        v-for="share in shares"
        :key="share.id"
        class="tw:flex tw:items-center tw:gap-2 tw:rounded tw:border tw:border-divider tw:p-2 tw:bg-card"
      >
        <IconUser :size="14" class="tw:text-secondary tw:shrink-0" />
        <div class="tw:flex-1 tw:min-w-0">
          <UserBadgeById :userId="share.userId" />
        </div>
        <span
          class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5"
          :class="
            share.grantedVia === 'WORKFLOW_ASSIGNMENT'
              ? 'tw:bg-blue-50 tw:text-blue-700'
              : 'tw:bg-gray-100 tw:text-secondary'
          "
        >
          <IconRoute v-if="share.grantedVia === 'WORKFLOW_ASSIGNMENT'" :size="10" class="tw:inline" />
          {{ viaLabel(share) }}
        </span>
        <button
          v-if="canShare"
          type="button"
          class="tw:p-1 tw:rounded tw:bg-transparent tw:border-0 tw:text-secondary tw:hover:text-bad tw:cursor-pointer"
          :title="`Revoke share with this user`"
          @click="revokeShare(share)"
        >
          <IconTrash :size="14" />
        </button>
      </li>
    </ul>

    <!-- Share dialog -->
    <BaseDialog v-model="showShareDialog" title="Share with a user" size="md">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            User <span class="tw:text-bad">*</span>
          </label>
          <UserSelectMenu v-model="pendingUserId" />
          <p class="tw:text-[11px] tw:text-secondary tw:italic tw:mt-1">
            Typically a supplier user. Internal users with a normal read permission don't need an
            explicit share.
          </p>
        </div>
        <div>
          <label class="tw:text-xs tw:font-semibold tw:text-secondary tw:block tw:mb-1">
            Notes (optional)
          </label>
          <BaseTextarea v-model="pendingNotes" :rows="2" placeholder="Why this is being shared" />
        </div>
      </div>
      <template #actions>
        <BaseButton variant="secondary" @click="showShareDialog = false">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="isSharing" @click="confirmShare">
          Share
        </BaseButton>
      </template>
    </BaseDialog>
  </section>
</template>
