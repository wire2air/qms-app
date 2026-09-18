<script setup>
/**
 * Related records / lineage panel — the consistent cross-module view of what
 * caused a record, what it led to, and what a person has related to it by
 * hand. Backed by the generic record_links table.
 *
 *   ▲ Caused by   CAUSED links where to = this record (upstream sources)
 *   ▼ Led to      CAUSED links where from = this record (downstream records)
 *   🔗 Related     RELATED links in EITHER direction
 *
 * The two relations are read differently on purpose (2026-08-29). CAUSED is
 * lineage — the system wrote it and the direction is the fact. RELATED is a
 * person saying "see also", which has no direction: one row is stored, and
 * whichever end you are standing on, the chip shows the OTHER record.
 *
 * Drop it on any record detail page: <RecordLineagePanel type="Nonconformance"
 * :id="id" />. Pass `canEdit` to offer linking; without it the panel stays the
 * read-only view it has always been, and self-hides when there is nothing.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { del } from '@/api'
import { IconArrowUp, IconArrowDown, IconSitemap, IconPlus, IconX, IconLink } from '@tabler/icons-vue'

const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true },
  /** Offer "Link records" + unlink. The server checks the same thing. */
  canEdit: { type: Boolean, default: false },
})

const toast = useToast()
const showLinkDialog = ref(false)
const removingId = ref(null)

const causedBy = useLiveQueryWithDeps(
  [() => props.type, () => props.id],
  async (db, [type, id]) =>
    id ? db.RecordLink.where('[toType+toId]', [type, id]).exec() : [],
  { models: ['RecordLink'], initial: [] },
)
const ledTo = useLiveQueryWithDeps(
  [() => props.type, () => props.id],
  async (db, [type, id]) =>
    id ? db.RecordLink.where('[fromType+fromId]', [type, id]).exec() : [],
  { models: ['RecordLink'], initial: [] },
)

// CAUSED keeps its direction; RELATED is folded into one undirected list,
// each entry pointing at whichever end ISN'T this record.
const causedByLinks = computed(() => causedBy.value.filter((l) => l.relation !== 'RELATED'))
const ledToLinks = computed(() => ledTo.value.filter((l) => l.relation !== 'RELATED'))
const relatedLinks = computed(() =>
  [...causedBy.value, ...ledTo.value]
    .filter((l) => l.relation === 'RELATED')
    .map((l) => {
      const isFrom = l.fromType === props.type && l.fromId === props.id
      return { id: l.id, type: isFrom ? l.toType : l.fromType, refId: isFrom ? l.toId : l.fromId }
    }),
)

const show = computed(
  () =>
    props.canEdit ||
    causedByLinks.value.length > 0 ||
    ledToLinks.value.length > 0 ||
    relatedLinks.value.length > 0,
)

async function unlink(linkId) {
  if (removingId.value) return
  removingId.value = linkId
  try {
    await del(`/v1/services/record-links/${linkId}`)
  } catch (e) {
    toast.error(e?.message || 'Could not remove the link')
  } finally {
    removingId.value = null
  }
}
</script>

<template>
  <div
    v-if="show"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
  >
    <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
      <IconSitemap :size="16" />
      <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider">Related records</span>
      <button
        v-if="canEdit"
        type="button"
        class="tw:ms-auto tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-medium tw:text-primary tw:hover:text-primary/80"
        @click="showLinkDialog = true"
      >
        <IconPlus :size="14" /> Link records
      </button>
    </div>

    <div v-if="causedByLinks.length" class="tw:flex tw:flex-col tw:gap-1.5">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-caption tw:text-secondary">
        <IconArrowUp :size="13" /> Caused by
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <RecordRefChip
          v-for="l in causedByLinks"
          :id="l.fromId"
          :key="l.id"
          :type="l.fromType"
        />
      </div>
    </div>

    <div v-if="ledToLinks.length" class="tw:flex tw:flex-col tw:gap-1.5">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-caption tw:text-secondary">
        <IconArrowDown :size="13" /> Led to
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <RecordRefChip v-for="l in ledToLinks" :id="l.toId" :key="l.id" :type="l.toType" />
      </div>
    </div>

    <!-- Manual links: undirected, each removable. -->
    <div v-if="relatedLinks.length" class="tw:flex tw:flex-col tw:gap-1.5">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-caption tw:text-secondary">
        <IconLink :size="13" /> Related
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <span v-for="l in relatedLinks" :key="l.id" class="tw:inline-flex tw:items-center tw:gap-0.5">
          <RecordRefChip :id="l.refId" :type="l.type" />
          <button
            v-if="canEdit"
            type="button"
            class="tw:rounded tw:p-0.5 tw:text-secondary tw:hover:text-bad tw:disabled:opacity-50"
            :disabled="removingId === l.id"
            aria-label="Remove link"
            @click="unlink(l.id)"
          >
            <IconX :size="12" />
          </button>
        </span>
      </div>
    </div>

    <p
      v-if="canEdit && !causedByLinks.length && !ledToLinks.length && !relatedLinks.length"
      class="tw:text-sm tw:text-secondary tw:italic"
    >
      No related records yet.
    </p>

    <RecordLinkDialog v-if="canEdit" :id="id" v-model="showLinkDialog" :type="type" />
  </div>
</template>
