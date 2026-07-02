<script setup>
/**
 * Related records / lineage panel — the consistent cross-module view of what
 * caused a record and what it led to, backed by the generic record_links table.
 *
 *   ▲ Caused by   = links where to = this record (upstream sources)
 *   ▼ Led to      = links where from = this record (downstream records)
 *
 * Drop it on any record detail page: <RecordLineagePanel type="Nonconformance"
 * :id="id" />. Self-hides when the record has no links either way.
 */
import { IconArrowUp, IconArrowDown, IconSitemap } from '@tabler/icons-vue'

const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true },
})

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

const show = computed(() => causedBy.value.length > 0 || ledTo.value.length > 0)
</script>

<template>
  <div
    v-if="show"
    class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
  >
    <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
      <IconSitemap :size="16" />
      <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider">Related records</span>
    </div>

    <div v-if="causedBy.length" class="tw:flex tw:flex-col tw:gap-1.5">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-caption tw:text-secondary">
        <IconArrowUp :size="13" /> Caused by
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <RecordRefChip
          v-for="l in causedBy"
          :id="l.fromId"
          :key="l.id"
          :type="l.fromType"
        />
      </div>
    </div>

    <div v-if="ledTo.length" class="tw:flex tw:flex-col tw:gap-1.5">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-caption tw:text-secondary">
        <IconArrowDown :size="13" /> Led to
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <RecordRefChip v-for="l in ledTo" :id="l.toId" :key="l.id" :type="l.toType" />
      </div>
    </div>
  </div>
</template>
