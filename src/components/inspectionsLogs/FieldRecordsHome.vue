<script setup>
/**
 * Dedicated /inspections-logs/records page — wraps FieldRecordsList
 * with the standard page header. The list itself is reused by the
 * legacy /records page as a second section.
 */
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Field Records</h2>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Field Records</div>
      <div class="tw:text-sm tw:text-secondary">
        Submitted records on OPERATIONAL_LOG and CONTROLLED_RECORD form templates. Distinct from
        the legacy /records page which shows UTILITY records — but the legacy page now also
        shows these for a unified view.
      </div>
    </div>

    <FieldRecordsList />
  </div>
</template>
