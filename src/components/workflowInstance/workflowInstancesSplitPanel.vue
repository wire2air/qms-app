<script setup>
import { IconExternalLink, IconX } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  instance: { type: Object, required: true },
})

const emit = defineEmits(['close', 'done'])

// ─── Computed ────────────────────────────────────────────────────────────────
const currentUserId = computed(() => currentSession.value?.id)
const doc = computed(() => props.instance.resource)

const activeStep = computed(
  () => props.instance.steps?.find((s) => s.statusId === 'IN_PROGRESS') || null,
)

const myTask = computed(() =>
  activeStep.value?.tasks?.find((t) => (t.assignedTo || t.assignee?.id) === currentUserId.value),
)

const canActOnStep = computed(() => myTask.value?.statusId === 'ASSIGNED')
</script>

<template>
  <div
    class="tw:w-112.5 tw:shrink-0 tw:bg-sidebar tw:border tw:border-divider tw:rounded-xl tw:shadow-lg tw:flex tw:flex-col tw:overflow-hidden"
  >
    <!--Header-->
    <div class="tw:p-5 tw:border-b tw:border-divider tw:flex tw:justify-between tw:items-start">
      <div class="tw:flex-1 tw:min-w-0 tw:pr-3">
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
          <span
            class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wide tw:text-primary tw:bg-primary/10 tw:px-2 tw:py-0.5 tw:rounded"
          >
            Current Task
          </span>
          <BaseText variant="overline" class="">
            {{ doc?.docNumber || instance.id.slice(0, 8) }}
          </BaseText>
        </div>
        <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:truncate">
          {{ doc?.title || '—' }}
        </h3>
        <p class="tw:text-xs tw:text-secondary tw:mt-1">
          {{ instance.workflowVersion?.workflow?.name || '—' }} &bull;
          {{ doc?.documentType?.name || '—' }}
        </p>
      </div>
      <RouterLink
        :to="getCompanyPath(`/workflow-instances/${instance.id}`)"
        class="tw:p-1.5 tw:rounded-lg tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
      >
        <IconExternalLink :size="18" />
      </RouterLink>

      <button
        class="tw:p-1.5 tw:rounded-lg tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
        @click="emit('close')"
      >
        <IconX :size="18" />
      </button>
    </div>

    <!--body-->
    <div class="tw:flex-1 tw:overflow-y-auto">
      <DocumentsMainContentLeft
        v-if="doc?.id"
        :documentId="doc.id"
        :versionId="doc.latestVersion.id"
        :dense="true"
        :reviewMode="canActOnStep"
      />
    </div>

    <!-- Footer -->
    <div class="tw:p-2 tw:border-t tw:border-divider tw:bg-background">
      <template v-if="canActOnStep && instance.resourceType !== 'Nonconformance'">
        <div class="tw:grid tw:grid-cols-2 tw:gap-2">
          <WorkflowInstanceApproverAction
            action="APPROVE"
            :taskInstanceId="myTask?.id"
            :instanceStepId="activeStep.id"
            :requireEsignature="activeStep?.step?.requireEsignature"
            @done="emit('done')"
          />
          <WorkflowInstanceApproverAction
            action="REJECT"
            :taskInstanceId="myTask?.id"
            :instanceStepId="activeStep.id"
            :requireEsignature="activeStep?.step?.requireEsignature"
            @done="emit('done')"
          />
        </div>
      </template>
      <div v-else class="tw:text-center tw:text-sm tw:text-secondary tw:py-2">
        {{
          instance.resourceType === 'Nonconformance'
            ? 'Task actions not available for nonconformances.'
            : 'No action required from you on this step.'
        }}
      </div>
    </div>
  </div>
</template>
