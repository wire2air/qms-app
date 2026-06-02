<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * Dedicated /inspections-logs/records page — wraps FieldRecordsList
 * with the standard page header. The list itself is reused by the
 * legacy /records page as a second section.
 *
 * "Submit a log" routes to the dedicated fill page (/inspections-logs/fill)
 * rather than opening an in-page modal — the same page is fired from a
 * task (with the log book pre-selected), so there's one fill surface.
 */
const router = useRouter()

const canSubmit = computed(() => isAllowed(['fieldRecords:create']))

function goSubmit() {
  // Single pick-a-log-book surface: the logging dashboard.
  router.push(getCompanyPath('/logging'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Logs</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canSubmit" variant="primary" @click="goSubmit">
        <IconPlus :size="16" />
        Submit a log
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Logs</div>
      <div class="tw:text-sm tw:text-secondary">
        Every log entry submitted across your log books. Use the Form filter to scope into a
        specific log book (e.g. daily temperature, gemba round). Entries are immutable after the
        edit window closes.
      </div>
    </div>

    <FieldRecordsList />
  </div>
</template>
