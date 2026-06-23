<script setup>
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'
import { buildWorkflowInstanceSections } from './workflowInstanceDetailConfig.js'

const props = defineProps({
  instanceId: { type: String, required: true },
})

const router = useRouter()

const instance = useLiveQueryWithDeps(
  [() => props.instanceId],
  async (db, [instanceId]) => {
    if (!instanceId) return null
    return db.WorkflowInstance.findByPk(instanceId)
  },
  { models: ['WorkflowInstance'] },
)

const steps = useLiveQueryWithDeps(
  [() => props.instanceId],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    return db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber')
      .exec()
  },

  { models: ['WorkflowInstanceStep'], initial: [] },
)

const documentVersion = useLiveQueryWithDeps(
  [() => instance.value?.resourceType, () => instance.value?.resourceId],

  async (db, [resourceType, resourceId]) => {
    if (!resourceId || resourceType !== 'DocumentVersion') return null
    return db.DocumentVersion.findByPk(resourceId)
  },
  { models: ['DocumentVersion'] },
)

const doc = useLiveQueryWithDeps(
  [() => documentVersion.value?.documentId],

  async (db, [documentId]) => {
    if (!documentId) return null
    return db.Document.findByPk(documentId)
  },
  { models: ['Document'] },
)

const nc = useLiveQueryWithDeps(
  [() => instance.value?.resourceType, () => instance.value?.resourceId],

  async (db, [resourceType, resourceId]) => {
    if (!resourceId || resourceType !== 'Nonconformance') return null
    return db.Nonconformance.findByPk(resourceId)
  },
  { models: ['Nonconformance'] },
)

const workflowVersion = useLiveQueryWithDeps(
  [() => instance.value?.workflowVersionId],

  async (db, [wvId]) => {
    if (!wvId) return null
    return db.WorkflowVersion.findByPk(wvId)
  },
  { models: ['WorkflowVersion'] },
)

const instanceStatus = useLiveQueryWithDeps(
  [() => instance.value?.statusId],

  async (db, [statusId]) => {
    if (!statusId) return null
    return db.WorkflowInstanceStatus.findByPk(statusId)
  },
  { models: ['WorkflowInstanceStatus'] },
)

const loading = computed(() => instance.value === undefined)

const statusLabel = computed(() => instanceStatus.value?.name || 'Unknown')

const statusColor = computed(() => {
  const id = instance.value?.statusId
  if (id === 'COMPLETED') return 'emerald'
  if (id === 'REJECTED') return 'red'
  if (id === 'CHANGES_REQUESTED') return 'orange'
  return 'amber'
})

const STATUS_BADGE_CLASS = {
  emerald: 'tw:bg-emerald-100 tw:text-emerald-700',
  red: 'tw:bg-red-100 tw:text-red-700',
  orange: 'tw:bg-orange-100 tw:text-orange-700',
  amber: 'tw:bg-amber-100 tw:text-amber-700',
}

const progressPercent = computed(() => {
  if (!steps.value.length) return 0
  const completed = steps.value.filter((s) => s.statusId === 'APPROVED').length
  return Math.round((completed / steps.value.length) * 100)
})

const completedSteps = computed(() => steps.value.filter((s) => s.statusId === 'APPROVED').length)

const elapsedTime = computed(() => {
  if (!instance.value?.startedAt) return 'N/A'
  const start = instance.value.startedAt
  const end = instance.value.completedAt || DateTime.now()
  const diff = end.diff(start, ['hours', 'minutes'])
  const hours = Math.floor(diff.hours)
  const minutes = Math.floor(diff.minutes)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
})

const breadcrumbs = computed(() => {
  if (instance.value?.resourceType === 'Nonconformance') {
    return [
      { label: 'Workflow Instances', to: getCompanyPath('/workflow-instances') },
      {
        label: nc.value?.ncNumber || nc.value?.title || 'Nonconformance',
        to: nc.value?.id ? getCompanyPath(`/nonconformances/${nc.value.id}`) : undefined,
      },
      { label: 'Workflow' },
    ]
  }
  return [
    { label: 'Workflow Instances', to: getCompanyPath('/workflow-instances') },
    {
      label: doc.value?.title || 'Document',
      to: doc.value?.id ? getCompanyPath(`/documents/${doc.value.id}`) : undefined,
    },
    { label: 'Workflow' },
  ]
})

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const workflowInstanceDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    sections: buildWorkflowInstanceSections(instance.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="workflowInstanceDetailConfig"
    :record="instance"
    :loading="loading"
    :notFound="!loading && !instance"
    notFoundTitle="Workflow instance not found"
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">
        {{ workflowVersion?.name || 'Workflow Approval' }}
      </span>
    </template>

    <template #status>
      <BaseBadge v-if="instance" :class="STATUS_BADGE_CLASS[statusColor]">{{ statusLabel }}</BaseBadge>
    </template>

    <template v-if="instance" #meta>
      <span>{{ completedSteps }}/{{ steps.length }} steps</span>
      <span> · {{ elapsedTime }}</span>
    </template>

    <template v-if="instance" #section-details>
      <div class="tw:flex tw:flex-col tw:gap-6">
        <WorkflowInstanceDocumentSummary
          v-if="instance.resourceType === 'DocumentVersion'"
          :doc="doc"
          :workflowVersion="workflowVersion"
          :statusLabel="statusLabel"
          :statusColor="statusColor"
          @viewDocument="router.push(getCompanyPath(`/documents/${doc?.id}`))"
        />

        <template v-else-if="instance.resourceType === 'Nonconformance'">
          <WorkflowInstanceNcSummary
            :nc="nc"
            :workflowVersion="workflowVersion"
            :statusLabel="statusLabel"
            :statusColor="statusColor"
            @viewNc="router.push(getCompanyPath(`/nonconformances/${nc?.id}`))"
          />
          <WorkflowInstanceNcOutcomeBanner :instanceStatusId="instance.statusId" />
        </template>

        <WorkflowInstanceTimeline :workflowInstanceId="props.instanceId" />
      </div>
    </template>

    <template v-if="instance" #rail>
      <WorkflowInstanceHealthCard
        :progressPercent="progressPercent"
        :elapsedTime="elapsedTime"
        :completedSteps="completedSteps"
        :totalSteps="steps.length"
      />
    </template>
  </BaseDetailLayout>
</template>
