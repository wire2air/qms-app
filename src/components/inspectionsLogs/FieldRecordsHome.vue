<script setup>
import { IconPlus, IconFileText } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Dedicated /inspections-logs/records page — wraps FieldRecordsList
 * with the standard page header. The list itself is reused by the
 * legacy /records page as a second section.
 *
 * Built on BaseListLayout as the page shell. FieldRecordsList owns all
 * filter state, the rows live query, its own state/empty handling, and the
 * inline record-preview overlay — so this page declares no `useListLayout`
 * (nothing page-level to track) and the default slot always renders the
 * self-contained list (state stays the layout default).
 *
 * "Submit a log" routes to the dedicated fill page (/inspections-logs/fill)
 * rather than opening an in-page modal — the same page is fired from a
 * task (with the log book pre-selected), so there's one fill surface.
 */
const router = useRouter()

const canSubmit = computed(() => isAllowed(['field_records:create']))

function goSubmit() {
  // Single pick-a-log-book surface: the logging dashboard.
  router.push(getCompanyPath('/logging'))
}
</script>

<template>
  <BaseListLayout
    title="Logs"
    :icon="IconFileText"
    subtitle="Every log entry submitted across your log books. Use the Form filter to scope into a specific log book (e.g. daily temperature, gemba round). Entries are immutable after the edit window closes."
  >
    <template #actions>
      <BaseButton v-if="canSubmit" variant="primary" @click="goSubmit">
        <IconPlus :size="16" />
        Submit a log
      </BaseButton>
    </template>

    <FieldRecordsList />
  </BaseListLayout>
</template>
