<script setup>
import { IconFolder, IconHistory, IconUser, IconEye } from '@tabler/icons-vue'

defineProps({
  doc: { type: Object, default: null },
  workflowVersion: { type: Object, default: null },
  statusLabel: { type: String, default: 'Unknown' },
  statusColor: { type: String, default: 'amber' },
})

defineEmits(['viewDocument'])
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:p-6">
    <div class="tw:flex tw:flex-col tw:md:flex-row tw:md:items-start tw:justify-between tw:gap-4">
      <div class="tw:space-y-2">
        <div class="tw:flex tw:items-center tw:gap-2">
          <span
            v-if="doc?.documentType"
            class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:bg-primary/10 tw:text-primary tw:px-2 tw:py-0.5 tw:rounded"
          >
            {{ doc.documentType.name }}
          </span>
          <span class="tw:text-secondary tw:text-sm">#{{ doc?.docNumber }}</span>
        </div>
        <h1 class="tw:text-2xl tw:font-semibold tw:tracking-tight tw:text-on-main tw:leading-tight">
          {{ doc?.title }}
        </h1>
        <div
          class="tw:flex tw:flex-wrap tw:items-center tw:gap-x-6 tw:gap-y-2 tw:text-sm tw:text-secondary"
        >
          <div v-if="workflowVersion?.workflow?.module" class="tw:flex tw:items-center tw:gap-1.5">
            <IconFolder :size="14" />
            <span>
              Module: <b>{{ workflowVersion.workflow.module.name }}</b>
            </span>
          </div>
          <div v-if="doc?.currentVersion" class="tw:flex tw:items-center tw:gap-1.5">
            <IconHistory :size="14" />
            <span>
              Version:
              <b>
                {{
                  doc.currentVersion.versionLabel ||
                  `v${doc.currentVersion.versionMajor}.${doc.currentVersion.versionMinor}`
                }}
              </b>
            </span>
          </div>
          <div v-if="doc?.user" class="tw:flex tw:items-center tw:gap-1.5">
            <IconUser :size="14" />
            <span>
              Owner: <b>{{ doc.user.firstName }} {{ doc.user.lastName }}</b>
            </span>
          </div>
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

        <BaseButton variant="outline" @click="$emit('viewDocument')">
          <IconEye :size="14" class="tw:mr-1" />
          View Full Document
        </BaseButton>
      </div>
    </div>
  </div>
</template>
