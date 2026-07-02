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
      <BaseSelect
        v-model="filters.modules"
        :options="moduleItems"
        optionLabel="name"
        optionValue="id"
        multiple
        placeholder="All modules"
        style="min-width: 160px"
      >
        <template #selected="{ options }">
          <span class="tw:text-sm">{{ options.length }} module(s)</span>
        </template>
      </BaseSelect>

      <!-- Action filter -->
      <BaseSelect
        v-model="filters.actions"
        :options="actionOptions"
        optionLabel="name"
        optionValue="id"
        multiple
        placeholder="All actions"
        style="min-width: 140px"
      >
        <template #selected="{ options }">
          <span class="tw:text-sm">{{ options.length }} action(s)</span>
        </template>
      </BaseSelect>

      <!-- Performed by -->
      <UserSelectMenu v-model="filters.performedBy" nullLabel="Any user" style="min-width: 140px" />

      <!-- Date from -->
      <div class="tw:flex tw:flex-col tw:gap-0.5">
        <span class="tw:text-caption tw:font-medium tw:text-secondary tw:uppercase tw:tracking-wider"
          >Start date</span
        >
        <BaseDateField v-model="filters.dateFrom" mode="date" />
      </div>

      <!-- Date to -->
      <div class="tw:flex tw:flex-col tw:gap-0.5">
        <span class="tw:text-caption tw:font-medium tw:text-secondary tw:uppercase tw:tracking-wider"
          >End date</span
        >
        <BaseDateField v-model="filters.dateTo" mode="date" />
      </div>
    </template>
  </BaseFilterBar>
</template>
