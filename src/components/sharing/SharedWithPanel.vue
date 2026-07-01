<script setup>
import { IconUser, IconUsers, IconRoute, IconPaperclip } from '@tabler/icons-vue'

/**
 * Per-record "Access" panel — drops on document / CAPA / NC detail
 * pages. Lists who has been granted access via the shared_with_user
 * junction.
 *
 * Read-only by design. The 2026-05-29 product decision: supplier access
 * to NC / CAPA / Document is driven by **workflow step assignment**
 * (see backend/api/services/workflowInstanceService.js →
 * autoShareSupplierUsers, which mints a SharedWithUser row whenever a
 * step assigns an EXTERNAL_SUPPLIER user). Manual "Share" / "Revoke"
 * was confusing parallel to the workflow truth, and is removed.
 *
 * The shared_with_user table itself is retained — it's the queryable
 * "who can see this" projection that RLS leans on, and the manual
 * (`granted_via='MANUAL'`) path stays available for future
 * out-of-workflow shares should we want them. We just don't expose
 * the manual buttons in the UI today.
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
})

const shares = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) => {
    if (!entityType || !entityId) return []
    const rows = await db.SharedWithUser.where('[entityType+entityId]', [
      entityType,
      entityId,
    ]).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['SharedWithUser'], initial: [] },
)

function viaLabel(s) {
  return s.grantedVia === 'WORKFLOW_ASSIGNMENT' ? 'via workflow' : 'manual'
}
</script>

<template>
  <!-- Only surfaces once the record is actually shared externally (a supplier
       user granted via workflow-step assignment). No shares → no panel. -->
  <section
    v-if="shares.length"
    class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
  >
    <div class="tw:flex tw:items-center tw:gap-2">
      <IconUsers :size="18" class="tw:text-primary" />
      <h3 class="tw:text-sm tw:font-semibold tw:text-on-main">
        External access
        <span class="tw:text-secondary tw:font-normal">({{ shares.length }})</span>
      </h3>
    </div>

    <p class="tw:text-caption tw:text-secondary tw:italic">
      Supplier users are granted read access automatically when a workflow step assigns them to this
      {{ entityType.toLowerCase() }}.
    </p>

    <ul class="tw:flex tw:flex-col tw:gap-1.5">
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
          class="tw:text-micro tw:rounded tw:px-1.5 tw:py-0.5 tw:inline-flex tw:items-center tw:gap-1"
          :class="
            share.grantedVia === 'WORKFLOW_ASSIGNMENT'
              ? 'tw:bg-blue-50 tw:text-blue-700'
              : 'tw:bg-gray-100 tw:text-secondary'
          "
        >
          <IconRoute v-if="share.grantedVia === 'WORKFLOW_ASSIGNMENT'" :size="10" />
          <IconPaperclip v-else :size="10" />
          {{ viaLabel(share) }}
        </span>
      </li>
    </ul>
  </section>
</template>
