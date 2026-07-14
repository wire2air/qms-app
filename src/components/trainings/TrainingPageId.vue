<script setup>
import { IconCircleCheck, IconTrash } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import {
  buildTrainingBanners,
  buildTrainingSections,
  buildTrainingActions,
} from './trainingDetailConfig.js'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const router = useRouter()

const training = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.Training.findByPk(id),
  { models: ['Training'] },
)

const loading = computed(() => training.value === undefined)

const canUpdate = computed(() => isAllowed(['training:update']))
const canManage = computed(() => isAllowed(['training:manage']))

const isEditable = computed(() => training.value?.status === 'DRAFT')

// ─── Instance count (for unpublish guard) ──────────────────────────────────────
const instanceCount = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return 0
    const [active, completed, cancelled] = await Promise.all([
      db.TrainingInstance.where('[trainingId+status]', [id, 'ACTIVE']).exec(),
      db.TrainingInstance.where('[trainingId+status]', [id, 'COMPLETED']).exec(),
      db.TrainingInstance.where('[trainingId+status]', [id, 'CANCELLED']).exec(),
    ])
    return active.length + completed.length + cancelled.length
  },

  { models: ['TrainingInstance'], initial: 0 },
)

const canUnpublish = computed(
  () => training.value?.status === 'ACTIVE' && instanceCount.value === 0,
)

// ─── Auto-save ─────────────────────────────────────────────────────────────────
const { isSaving } = useAutoSave(training, {
  enabled: () => canUpdate.value && isEditable.value,
})

// ─── Status actions ────────────────────────────────────────────────────────────
const actionLoading = ref(false)
const showPublishConfirm = ref(false)
const showDeleteConfirm = ref(false)
const publishError = ref('')

async function handlePublish() {
  if (!training.value) return
  if (!training.value.managerId) {
    publishError.value =
      'A Training Manager is required before publishing. Set one on the Details tab.'
    return
  }
  publishError.value = ''
  actionLoading.value = true
  try {
    training.value.status = 'ACTIVE'
    await training.value.save()
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to publish' })
  } finally {
    showPublishConfirm.value = false
    actionLoading.value = false
  }
}

async function handleUnpublish() {
  if (!training.value) return
  actionLoading.value = true
  try {
    training.value.status = 'DRAFT'
    await training.value.save()
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to unpublish' })
  } finally {
    actionLoading.value = false
  }
}

async function handleArchive() {
  if (!training.value) return
  actionLoading.value = true
  try {
    training.value.status = 'ARCHIVED'
    await training.value.save()
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to archive' })
  } finally {
    actionLoading.value = false
  }
}

async function handleDelete() {
  if (!training.value) return
  actionLoading.value = true
  try {
    await training.value.delete()
    router.push(getCompanyPath('/trainings'))
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to delete' })
    actionLoading.value = false
  }
}

// ─── Launch dialog ─────────────────────────────────────────────────────────────
const showLaunchDialog = ref(false)
const showAddCurriculumDialog = ref(false)

// ─── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref('details')
const tabs = [
  { value: 'details', label: 'Details' },
  { value: 'material', label: 'Material' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'curriculum', label: 'Curriculum' },
  { value: 'instances', label: 'Instances' },
]

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Training Library', to: getCompanyPath('/trainings') },
  { label: training.value?.title || 'Loading…' },
])
const trainingBanners = computed(() => buildTrainingBanners(training.value))
const trainingActions = computed(() =>
  buildTrainingActions(
    {
      canManage: canManage.value,
      status: training.value?.status,
      hasManager: !!training.value?.managerId,
      canUnpublish: canUnpublish.value,
      actionLoading: actionLoading.value,
    },
    {
      openPublish() {
        publishError.value = ''
        showPublishConfirm.value = true
      },
      launch() {
        showLaunchDialog.value = true
      },
      addToCurriculum() {
        showAddCurriculumDialog.value = true
      },
      unpublish: handleUnpublish,
      archive: handleArchive,
      openDelete() {
        showDeleteConfirm.value = true
      },
    },
  ),
)
const trainingDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => trainingBanners.value,
    actions: trainingActions.value,
    sections: buildTrainingSections(training.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="trainingDetailConfig"
    :record="training"
    :loading="loading"
    :notFound="!loading && !training"
    notFoundTitle="Training not found"
    notFoundDescription="This training could not be found."
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">{{ training?.title }}</span>
    </template>

    <template #status>
      <TrainingStatusBadgeById v-if="training" :statusId="training.status" />
    </template>

    <template v-if="training && training.description" #meta>
      {{ training.description }}
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span v-if="isSaving" class="tw:text-sm tw:text-secondary">Saving…</span>
        <DetailActionBar :actions="trainingActions" />
      </div>
    </template>

    <template v-if="training" #section-details>
      <!-- Tabs -->
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Training sections">
        <div class="tw:mt-6">
          <BaseTabPanel value="details">
            <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-xl">
              <TrainingDetailsTab :training="training" :editable="isEditable && canUpdate" />
              <!-- Admin-defined custom fields. Self-hides when none configured. -->
              <CustomFieldsCard
                entityType="Training"
                :entityId="training.id"
                :editable="isEditable && canUpdate"
              />
            </div>
          </BaseTabPanel>

          <BaseTabPanel value="material">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <TrainingMaterialTab :training="training" :editable="isEditable && canUpdate" />
            </div>
          </BaseTabPanel>

          <BaseTabPanel value="assessment">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <TrainingAssessmentEditor :training="training" :editable="isEditable && canUpdate" />
            </div>
          </BaseTabPanel>

          <BaseTabPanel value="curriculum">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <TrainingCurriculumTab
                :trainingId="training.id"
                :trainingTitle="training.title"
                :canUpdate="canUpdate"
              />
            </div>
          </BaseTabPanel>

          <BaseTabPanel value="instances">
            <div class="tw:flex tw:flex-col tw:gap-4">
              <TrainingInstancesTab :trainingId="training.id" />
            </div>
          </BaseTabPanel>
        </div>
      </BaseTabs>
    </template>
  </BaseDetailLayout>

  <!-- Dialogs (siblings; guarded — they all reference the loaded training) -->
  <template v-if="training">
    <!-- Launch dialog -->
    <TrainingLaunchDialog
      v-model="showLaunchDialog"
      :trainingId="training.id"
      :trainingTitle="training.title"
    />
    <TrainingAddToCurriculumDialog
      v-model="showAddCurriculumDialog"
      :trainingId="training.id"
      :trainingTitle="training.title"
    />

    <!-- Publish confirmation -->
    <BaseDialog v-model="showPublishConfirm" title="Publish Training" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-4 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⚠</div>
          <div>
            <p class="tw:text-sm tw:font-semibold tw:text-amber-800">
              This action cannot be undone (unless no instances have been launched)
            </p>
            <p class="tw:text-sm tw:text-amber-700 tw:mt-1">
              Once published, this training can no longer be edited. Make sure the content,
              assessment, and assignees are finalized before publishing.
            </p>
          </div>
        </div>
        <p
          v-if="publishError"
          class="tw:text-xs tw:text-red-600 tw:bg-red-50 tw:border tw:border-red-200 tw:rounded-md tw:p-2"
        >
          {{ publishError }}
        </p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Publish"
          :loading="actionLoading"
          @cancel="close"
          @submit="handlePublish"
        >
          <template #submitIcon><IconCircleCheck :size="16" /></template>
        </BaseDialogFooter>
      </template>
    </BaseDialog>

    <!-- Delete confirmation -->
    <BaseDialog v-model="showDeleteConfirm" title="Delete Training" maxWidth="md">
      <p class="tw:text-sm tw:text-on-sidebar">
        Are you sure you want to delete <span class="tw:font-semibold">{{ training.title }}</span
        >? This action cannot be undone.
      </p>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Delete"
          submitVariant="danger"
          :loading="actionLoading"
          @cancel="close"
          @submit="handleDelete"
        >
          <template #submitIcon><IconTrash :size="16" /></template>
        </BaseDialogFooter>
      </template>
    </BaseDialog>
  </template>
</template>
