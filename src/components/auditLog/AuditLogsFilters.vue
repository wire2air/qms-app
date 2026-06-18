<script setup>
import { IconFilter } from '@tabler/icons-vue'
import { useAuditLogs } from '@/composables/useAuditLogs.js'
import { MODULE_OPTIONS, AUDIT_ACTIONS } from '@/utils/auditConstants.js'

const { filters, resetFilters } = useAuditLogs()

const actionOptions = Object.keys(AUDIT_ACTIONS).map((key) => ({
  id: key,
  name: key.replace(/_/g, ' '),
}))

const moduleItems = MODULE_OPTIONS.map((m) => ({ id: m.value, name: m.label }))

const hasActiveFilters = computed(
  () =>
    filters.value.modules.length > 0 ||
    filters.value.actions.length > 0 ||
    filters.value.performedBy ||
    filters.value.entityType ||
    filters.value.dateFrom ||
    filters.value.dateTo,
)
</script>

<template>
  <BaseFilterBar hideSearch :showClear="hasActiveFilters" @clear="resetFilters">
    <template #filters>
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-secondary tw:text-sm">
        <IconFilter :size="16" />
        <span class="tw:font-medium">Filters</span>
      </div>

      <!-- Module filter -->
      <BaseSelectMenu
        v-model="filters.modules"
        :items="moduleItems"
        multiple
        placeholder="All modules"
        style="min-width: 160px"
      >
        <template #button>
          <span class="tw:text-sm">
            {{ filters.modules.length ? `${filters.modules.length} module(s)` : 'All modules' }}
          </span>
        </template>
      </BaseSelectMenu>

      <!-- Action filter -->
      <BaseSelectMenu
        v-model="filters.actions"
        :items="actionOptions"
        multiple
        placeholder="All actions"
        style="min-width: 140px"
      >
        <template #button>
          <span class="tw:text-sm">
            {{ filters.actions.length ? `${filters.actions.length} action(s)` : 'All actions' }}
          </span>
        </template>
      </BaseSelectMenu>

      <!-- Performed by -->
      <UserSelectMenu v-model="filters.performedBy" nullLabel="Any user" style="min-width: 140px" />

      <!-- Date from -->
      <div class="tw:flex tw:flex-col tw:gap-0.5">
        <span class="tw:text-micro tw:font-medium tw:text-secondary tw:uppercase tw:tracking-wide"
          >Start date</span
        >
        <BaseDatePicker v-model="filters.dateFrom" :showShortcuts="false" />
      </div>

      <!-- Date to -->
      <div class="tw:flex tw:flex-col tw:gap-0.5">
        <span class="tw:text-micro tw:font-medium tw:text-secondary tw:uppercase tw:tracking-wide"
          >End date</span
        >
        <BaseDatePicker v-model="filters.dateTo" :showShortcuts="false" />
      </div>
    </template>
  </BaseFilterBar>
</template>
