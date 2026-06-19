<script setup>
import { IconEye } from '@tabler/icons-vue'

defineProps({
  nc: { type: Object, default: null },
  workflowVersion: { type: Object, default: null },
  statusLabel: { type: String, default: 'Unknown' },
  statusColor: { type: String, default: 'amber' },
})

defineEmits(['viewNc'])
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:p-6">
    <!-- ─── Header row ──────────────────────────────────────────────────── -->
    <div class="tw:flex tw:flex-col tw:md:flex-row tw:md:items-start tw:justify-between tw:gap-4">
      <div class="tw:space-y-2">
        <div class="tw:flex tw:items-center tw:gap-2">
          <span
            class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:bg-primary/10 tw:text-primary tw:px-2 tw:py-0.5 tw:rounded"
          >
            Nonconformance
          </span>
          <span v-if="nc?.ncNumber" class="tw:text-secondary tw:text-sm">#{{ nc.ncNumber }}</span>
        </div>
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-main tw:leading-tight">
          {{ nc?.title || '—' }}
        </h1>
        <div
          class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-6 tw:gap-y-2 tw:text-sm tw:text-secondary"
        >
          <span v-if="workflowVersion?.name">
            Workflow: <b>{{ workflowVersion.name }}</b>
          </span>
        </div>
      </div>

      <div class="tw:flex tw:flex-col tw:items-end tw:gap-3">
        <span
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-semibold"
          :class="{
            'tw:bg-amber-100 tw:text-amber-700': statusColor === 'amber',
            'tw:bg-emerald-100 tw:text-emerald-700': statusColor === 'emerald',
            'tw:bg-red-100 tw:text-red-700': statusColor === 'red',
            'tw:bg-orange-100 tw:text-orange-700': statusColor === 'orange',
          }"
        >
          <span
            class="tw:size-2 tw:rounded-full"
            :class="{
              'tw:bg-amber-500 tw:animate-pulse': statusColor === 'amber',
              'tw:bg-emerald-500': statusColor === 'emerald',
              'tw:bg-red-500': statusColor === 'red',
              'tw:bg-orange-500': statusColor === 'orange',
            }"
          ></span>
          {{ statusLabel }}
        </span>

        <BaseButton variant="outline" @click="$emit('viewNc')">
          <IconEye :size="14" class="tw:mr-1" />
          View Nonconformance
        </BaseButton>
      </div>
    </div>

    <!-- ─── NC lifecycle strip + metadata ─────────────────────────────── -->
    <div class="tw:mt-5 tw:pt-5 tw:border-t tw:border-divider tw:space-y-5">
      <!-- Lifecycle strip: shows where this NC sits in its DRAFT → CLOSED journey -->
      <NcLifecycleStrip :nc="nc" />

      <!-- Metadata grid -->
      <div class="tw:grid tw:grid-cols-2 tw:md:grid-cols-3 tw:gap-4">
        <BaseDetailField label="Severity">
          <NcSeverityBadgeById v-if="nc?.severityId" :severityId="nc.severityId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Type">
          <NcTypeBadgeById v-if="nc?.typeId" :typeId="nc.typeId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Source">
          <NcSourceBadgeById v-if="nc?.sourceId" :sourceId="nc.sourceId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Owner">
          <UserBadgeById v-if="nc?.ownerId" :userId="nc.ownerId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>

        <BaseDetailField label="Detected" :value="nc?.detectedAt?.formatDate('date')" />
      </div>
    </div>
  </div>
</template>
