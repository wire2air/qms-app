<script setup>
import { IconChartBar, IconRefresh, IconUsers, IconUser } from '@tabler/icons-vue'
import { useAiUsage } from '@/composables/useAiUsage'

const usage = useAiUsage()

const periods = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]
const activePeriodDays = ref(30)
function pickPeriod(days) {
  activePeriodDays.value = days
  usage.setPeriod(days)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconChartBar class="tw:text-primary tw:size-6" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">AI Usage</h2>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <!-- Scope toggle: only shown to admins -->
        <div
          v-if="usage.canViewAll.value"
          class="tw:inline-flex tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:overflow-hidden"
        >
          <button
            class="tw:flex tw:items-center tw:gap-1 tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:transition-colors"
            :class="
              usage.scope.value === 'mine'
                ? 'tw:bg-primary tw:text-white'
                : 'tw:text-secondary tw:hover:bg-main-hover'
            "
            @click="usage.scope.value = 'mine'"
          >
            <IconUser :size="13" /> Mine
          </button>
          <button
            class="tw:flex tw:items-center tw:gap-1 tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:transition-colors"
            :class="
              usage.scope.value === 'all'
                ? 'tw:bg-primary tw:text-white'
                : 'tw:text-secondary tw:hover:bg-main-hover'
            "
            @click="usage.scope.value = 'all'"
          >
            <IconUsers :size="13" /> Everyone
          </button>
        </div>

        <!-- Period toggle -->
        <div
          class="tw:inline-flex tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:overflow-hidden"
        >
          <button
            v-for="p in periods"
            :key="p.days"
            class="tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:transition-colors"
            :class="
              activePeriodDays === p.days
                ? 'tw:bg-primary tw:text-white'
                : 'tw:text-secondary tw:hover:bg-main-hover'
            "
            @click="pickPeriod(p.days)"
          >
            {{ p.label }}
          </button>
        </div>

        <BaseButton variant="outline" size="sm" @click="usage.refresh">
          <IconRefresh :size="14" class="tw:mr-1" /> Refresh
        </BaseButton>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">AI Usage</div>
      <div class="tw:text-sm tw:text-secondary">
        {{ usage.scope.value === 'all' ? 'Across all users' : 'Your activity' }} ·
        {{ activePeriodDays }} days
      </div>
    </div>

    <AiUsageHeadline :overview="usage.overview.value" :loading="usage.overviewLoading.value" />

    <AiUsageTimeSeries :overview="usage.overview.value" />

    <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-2 tw:gap-4">
      <AiUsageBreakdownTable
        title="By task"
        :rows="usage.overview.value?.byTask ?? []"
        :columns="[
          { key: 'task', label: 'Task' },
          { key: 'calls', label: 'Calls', align: 'right' },
          { key: 'inputTokens', label: 'In', align: 'right' },
          { key: 'outputTokens', label: 'Out', align: 'right' },
          { key: 'costUsd', label: 'Cost', align: 'right', format: 'usd' },
        ]"
      />
      <AiUsageBreakdownTable
        v-if="usage.scope.value === 'all'"
        title="By user"
        :rows="usage.overview.value?.byUser ?? []"
        :columns="[
          { key: 'userName', label: 'User' },
          { key: 'calls', label: 'Calls', align: 'right' },
          { key: 'inputTokens', label: 'In', align: 'right' },
          { key: 'outputTokens', label: 'Out', align: 'right' },
          { key: 'costUsd', label: 'Cost', align: 'right', format: 'usd' },
        ]"
      />
      <AiUsageBreakdownTable
        v-else
        title="By source"
        :rows="usage.overview.value?.bySource ?? []"
        :columns="[
          { key: 'source', label: 'Source' },
          { key: 'calls', label: 'Calls', align: 'right' },
          { key: 'errors', label: 'Errors', align: 'right' },
        ]"
      />
    </div>

    <AiUsageJobsTable
      :jobs="usage.jobs.value"
      :total="usage.jobsTotal.value"
      :limit="usage.jobsLimit.value"
      :offset="usage.jobsOffset.value"
      :loading="usage.jobsLoading.value"
      @page="usage.jobsOffset.value = $event"
    />
  </div>
</template>
