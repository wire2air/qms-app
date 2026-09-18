<script setup>
/**
 * The document's review decisions, newest first.
 *
 * This list is the answer to the assessor's actual question — "show me the
 * review decisions for this SOP", plural. Before document_reviews existed the
 * honest answer was one overwritten timestamp.
 */
import { IconClipboardCheck } from '@tabler/icons-vue'

const props = defineProps({
  documentId: { type: String, required: true },
})

const reviews = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [documentId]) =>
    db.DocumentReview.where('documentId', documentId).orderBy('reviewedAt', 'desc').exec(),
  { models: ['DocumentReview'], initial: [] },
)

const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })

function reviewerName(id) {
  const u = users.value.find((x) => x.id === id)
  return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : '—'
}

const OUTCOME_LABEL = {
  NO_CHANGE: 'No change required',
  REVISION: 'Revision required',
  OBSOLETE: 'Obsoletion proposed',
}
const OUTCOME_CLASS = {
  NO_CHANGE: 'tw:bg-green-100 tw:text-green-700',
  REVISION: 'tw:bg-amber-100 tw:text-amber-700',
  OBSOLETE: 'tw:bg-gray-200 tw:text-gray-700',
}
</script>

<template>
  <div v-if="reviews?.length" class="tw:flex tw:flex-col tw:gap-2">
    <BaseText color="secondary" class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:uppercase tw:tracking-wide">
      <IconClipboardCheck :size="14" />
      Review history
    </BaseText>

    <div class="tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider">
      <div v-for="r in reviews" :key="r.id" class="tw:flex tw:flex-col tw:gap-1 tw:px-3 tw:py-2">
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <BaseBadge :class="OUTCOME_CLASS[r.outcome] || 'tw:bg-gray-100 tw:text-gray-600'">
            {{ OUTCOME_LABEL[r.outcome] || r.outcome }}
          </BaseBadge>
          <BaseText class="tw:text-xs">{{ reviewerName(r.reviewedBy) }}</BaseText>
          <BaseText color="secondary" class="tw:text-xs">
            {{ r.reviewedAt?.formatDate('datetime') }}
          </BaseText>
          <BaseText v-if="r.signatureId" color="secondary" class="tw:text-xs">· signed</BaseText>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div
          v-if="r.justification"
          class="tw:text-xs tw:text-secondary"
          v-html="r.justification"
        />
      </div>
    </div>
  </div>
</template>
