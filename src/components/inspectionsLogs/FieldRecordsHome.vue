<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

/**
 * Dedicated /inspections-logs/records page — wraps FieldRecordsList
 * with the standard page header. The list itself is reused by the
 * legacy /records page as a second section.
 *
 * Owns the "Submit a log" button + AddRecordDialog mount. This is the
 * entry point that floor users hit today on desktop, and the same UX
 * pattern that the mobile portal will reuse when it lands.
 */
const showAddDialog = ref(false)
const toast = useToast()

const canSubmit = computed(() => isAllowed(['fieldRecords:create']))

function onCreated() {
  showAddDialog.value = false
  toast.success('Record submitted')
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Field Records</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canSubmit" variant="primary" @click="showAddDialog = true">
        <IconPlus :size="16" />
        Submit a log
      </BaseButton>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Field Records</div>
      <div class="tw:text-sm tw:text-secondary">
        Submitted records on OPERATIONAL_LOG and CONTROLLED_RECORD form templates. The "Submit a
        log" button picks from inspection-eligible templates only (legacy UTILITY templates flow
        to the standalone /records page).
      </div>
    </div>

    <FieldRecordsList />

    <!-- Filtered to inspection-eligible templates so the submit flow
         from this page never accidentally creates a legacy record. -->
    <AddRecordDialog
      v-model="showAddDialog"
      classificationFilter="inspections"
      @created="onCreated"
    />
  </div>
</template>
