<script setup>
import { IconFileAlert } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { DateTime } from 'luxon'

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
</script>

<template>
  <BasePage width="standard" density="compact">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs v-if="instance" :items="breadcrumbs" />
    </SafeTeleport>

    <!-- Loading -->
    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:min-h-[60vh]">
      <BaseSpinner size="lg" />
    </div>

    <!-- Main Content -->
    <div v-else-if="instance" class="tw:max-w-350 tw:mx-auto tw:w-full tw:p-4 tw:lg:p-8">
      <div class="tw:flex tw:flex-col tw:lg:grid tw:lg:grid-cols-12 tw:gap-8">
        <!-- ─── Main Column ─────────────────────────────────────────────── -->
        <div class="tw:lg:col-span-8 tw:space-y-6">
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

        <!-- ─── Sidebar Column ──────────────────────────────────────────── -->
        <div class="tw:lg:col-span-4 tw:space-y-6">
          <WorkflowInstanceHealthCard
            :progressPercent="progressPercent"
            :elapsedTime="elapsedTime"
            :completedSteps="completedSteps"
            :totalSteps="steps.length"
          />
        </div>
      </div>
    </div>

    <!-- Not Found -->
    <div
      v-else
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:min-h-[60vh] tw:text-center"
    >
      <BaseEmptyState :icon="IconFileAlert" title="Workflow instance not found" />
    </div>
  </BasePage>
</template>
