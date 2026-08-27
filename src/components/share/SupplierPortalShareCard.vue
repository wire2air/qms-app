<script setup>
/**
 * "Supplier portal access" rail card — grant a supplier's portal users
 * VISIBILITY of this record, any time, any status (user request 2026-08-27:
 * a CLOSED record could not be shared, because the only supplier-share was
 * the draft-time workflow routing).
 *
 * This is the READ grant, not routing: it writes SharedWithUser rows — the
 * same rows the workflow engine writes for supplier fill-step assignees — so
 * the record appears in the supplier portal via the existing RLS branches.
 * Nothing about the record's workflow changes, which is exactly why it works
 * on a closed record.
 *
 * `entityType` follows each table's RLS convention: 'Document' / 'Capa' /
 * 'Nonconformance' for the built-ins, the record's moduleKey for admin-defined
 * module records (records_sel matches shared_with_user.entity_type against
 * records.module_key).
 */
import { IconBuildingStore, IconTrash, IconPlus } from '@tabler/icons-vue'
import { currentSession, isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  /** Permission module gating the grant UI (server: can_share_entity). */
  module: { type: String, required: true },
  /** Pre-scope the picker to this supplier (e.g. the record's supplier). */
  supplierId: { type: String, default: null },
})

const toast = useToast()

const canShare = computed(() => isAllowed([`${props.module}:update`]))

// Current grants on this record, EXTERNAL_SUPPLIER users only — internal
// grants (workflow visibility for colleagues) are not this card's business.
const grants = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) => {
    const rows = await db.SharedWithUser.where('[entityType+entityId]', [
      entityType,
      entityId,
    ]).exec()
    const out = []
    for (const g of rows) {
      const u = await db.User.findByPk(g.userId)
      if (!u || u.kind !== 'EXTERNAL_SUPPLIER') continue
      out.push({
        id: g.id,
        row: g,
        userId: g.userId,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
        email: u.email,
        grantedVia: g.grantedVia,
      })
    }
    return out
  },
  { models: ['SharedWithUser', 'User'], initial: [] },
)

// Supplier picker (free) or pinned to the record's supplier.
const pickedSupplierId = ref(props.supplierId || null)
watch(
  () => props.supplierId,
  (v) => {
    if (v) pickedSupplierId.value = v
  },
)

const pickedUserId = ref(null)
const granting = ref(false)

const grantShare = useLiveMutation(async (db, { userId }) => {
  const row = db.SharedWithUser.create({
    userId,
    entityType: props.entityType,
    entityId: props.entityId,
    grantedVia: 'MANUAL',
    grantedBy: currentSession.value?.userId ?? null,
  })
  await row.save()
  return row
})

async function onGrant() {
  if (!pickedUserId.value || granting.value) return
  if (grants.value.some((g) => g.userId === pickedUserId.value)) {
    toast.info('Already shared with that user.')
    return
  }
  granting.value = true
  try {
    await grantShare({ userId: pickedUserId.value })
    toast.success('Shared to the supplier portal.')
    pickedUserId.value = null
  } catch (e) {
    toast.error(e?.message || 'Could not share')
  } finally {
    granting.value = false
  }
}

async function onRevoke(grant) {
  try {
    await grant.row.delete()
    toast.success(`Portal access removed for ${grant.email}.`)
  } catch (e) {
    toast.error(e?.message || 'Could not revoke')
  }
}
</script>

<template>
  <BaseRailCard
    v-if="canShare"
    title="Supplier portal access"
    titleHelp="Grants the selected supplier users read access to this record in their portal — any status, closed included. Separate from workflow routing and from email share links."
  >
    <div class="tw:flex tw:flex-col tw:gap-2">
      <template v-if="!props.supplierId">
        <SupplierSelectMenu v-model="pickedSupplierId" nullLabel="— Select supplier —" />
      </template>
      <div v-if="pickedSupplierId" class="tw:flex tw:items-center tw:gap-2">
        <div class="tw:flex-1 tw:min-w-0">
          <SupplierUserSelectMenu
            v-model="pickedUserId"
            :supplierId="pickedSupplierId"
            nullLabel="— Select portal user —"
          />
        </div>
        <BaseButton
          variant="outline"
          size="sm"
          :disabled="!pickedUserId || granting"
          :isLoading="granting"
          @click="onGrant"
        >
          <template #icon><IconPlus :size="14" /></template>
          Share
        </BaseButton>
      </div>

      <div v-if="grants.length" class="tw:flex tw:flex-col tw:gap-1.5 tw:pt-1">
        <div
          v-for="g in grants"
          :key="g.id"
          class="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:px-2.5 tw:py-1.5"
        >
          <IconBuildingStore :size="14" class="tw:shrink-0 tw:text-secondary" />
          <div class="tw:min-w-0 tw:flex-1">
            <div class="tw:truncate tw:text-sm tw:text-on-main">{{ g.name }}</div>
            <div class="tw:truncate tw:text-xs tw:text-secondary">
              {{ g.email }}
              <template v-if="g.grantedVia === 'WORKFLOW_ASSIGNMENT'"> · via workflow</template>
            </div>
          </div>
          <BaseTooltip content="Remove portal access">
            <button
              type="button"
              class="tw:rounded tw:p-1 tw:text-secondary tw:hover:text-bad"
              :aria-label="`Remove portal access for ${g.email}`"
              @click="onRevoke(g)"
            >
              <IconTrash :size="14" />
            </button>
          </BaseTooltip>
        </div>
      </div>
      <BaseText v-else color="secondary" class="tw:text-xs">
        No supplier users have portal access to this record.
      </BaseText>
    </div>
  </BaseRailCard>
</template>
