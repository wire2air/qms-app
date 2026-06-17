<script setup>
import {
  IconBook,
  IconChevronRight,
  IconRocket,
  IconArchive,
  IconCircleCheck,
  IconTrash,
  IconArrowBackUp,
  IconLayoutGrid,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

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

const canUpdate = computed(() => isAllowed(['trainings:update']))
const canManage = computed(() => isAllowed(['trainings:manage']))

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

async function handlePublish() {
  if (!training.value) return
  if (!training.value.managerId) {
    toast.notify({
      type: 'negative',
      message: 'A Training Manager is required before publishing. Set one on the Details tab.',
    })
    return
  }
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
const showAddMatrixDialog = ref(false)

// ─── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref('details')
const tabs = [
  { value: 'details', label: 'Details' },
  { value: 'material', label: 'Material' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'assignees', label: 'Assignees' },
  { value: 'instances', label: 'Instances' },
]
</script>

<template>
  <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-64">
    <BaseSpinner />
  </div>
  <div
    v-else-if="!training"
    class="tw:flex tw:items-center tw:justify-center tw:h-64 tw:text-secondary"
  >
    Training not found.
  </div>
  <div v-else class="tw:flex tw:flex-col tw:gap-4 tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary">
        <RouterLink :to="getCompanyPath('/trainings')" class="tw:hover:text-primary"
          >Training Library</RouterLink
        >
        <IconChevronRight :size="14" />
        <span class="tw:text-on-sidebar tw:font-medium">{{ training.title }}</span>
      </div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <span v-if="isSaving" class="tw:text-xs tw:text-secondary">Saving…</span>
        <TrainingStatusBadgeById :statusId="training.status" />

        <!-- DRAFT actions -->
        <template v-if="canManage && training.status === 'DRAFT'">
          <BaseButton
            variant="primary"
            :disabled="!training.managerId"
            :title="training.managerId ? '' : 'A Training Manager is required before publishing'"
            @click="showPublishConfirm = true"
          >
            <IconCircleCheck :size="16" class="tw:mr-1" /> Publish
          </BaseButton>
          <BaseButton
            variant="secondary"
            :loading="actionLoading"
            @click="showDeleteConfirm = true"
          >
            <IconTrash :size="16" class="tw:mr-1" /> Delete
          </BaseButton>
        </template>

        <!-- ACTIVE (Published) actions -->
        <template v-if="canManage && training.status === 'ACTIVE'">
          <BaseButton variant="primary" @click="showLaunchDialog = true">
            <IconRocket :size="16" class="tw:mr-1" /> Launch
          </BaseButton>
          <BaseButton variant="secondary" @click="showAddMatrixDialog = true">
            <IconLayoutGrid :size="16" class="tw:mr-1" /> Add to Training Matrix
          </BaseButton>
          <BaseButton
            v-if="canUnpublish"
            variant="secondary"
            :loading="actionLoading"
            @click="handleUnpublish"
          >
            <IconArrowBackUp :size="16" class="tw:mr-1" /> Unpublish
          </BaseButton>
          <BaseButton variant="secondary" :loading="actionLoading" @click="handleArchive">
            <IconArchive :size="16" class="tw:mr-1" /> Archive
          </BaseButton>
        </template>
      </div>
    </SafeTeleport>

    <!-- Title -->
    <div class="tw:flex tw:items-center tw:gap-3">
      <div
        class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-blue-50 tw:text-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0"
      >
        <IconBook :size="20" />
      </div>
      <div>
        <div class="tw:text-2xl tw:font-bold tw:text-on-sidebar">{{ training.title }}</div>
        <div v-if="training.description" class="tw:text-sm tw:text-secondary">
          {{ training.description }}
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Training sections">
      <div class="tw:mt-6">
        <BaseTabPanel value="details">
          <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-xl">
            <TrainingDetailsTab :training="training" :editable="isEditable && canUpdate" />
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

        <BaseTabPanel value="assignees">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <TrainingAssigneesTab :trainingId="training.id" :canUpdate="isEditable && canUpdate" />
          </div>
        </BaseTabPanel>

        <BaseTabPanel value="instances">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <TrainingInstancesTab :trainingId="training.id" />
          </div>
        </BaseTabPanel>
      </div>
    </BaseTabs>

    <!-- Launch dialog -->
    <TrainingLaunchDialog
      v-model="showLaunchDialog"
      :trainingId="training.id"
      :trainingTitle="training.title"
    />
    <TrainingMatrixAddDialog v-model="showAddMatrixDialog" :trainingId="training.id" />

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
  </div>
</template>
