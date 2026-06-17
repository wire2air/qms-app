<script setup>
import {
  IconInfoCircle,
  IconSettings,
  IconArchive,
  IconArchiveOff,
  IconArrowLeft,
  IconSend,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const router = useRouter()
const toast = useToast()

const template = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.DocumentTemplate.findByPk(id)
  },
  { models: 'DocumentTemplate' },
)

const loading = computed(() => template.value === undefined)
const canUpdate = computed(() => isAllowed(['document-templates:update']))
const canArchive = computed(() => isAllowed(['document-templates:delete']))

// canEdit gates inline-edit behavior: only DRAFT templates can be edited.
// PUBLISHED templates are immutable (they may be referenced by documents);
// ARCHIVED templates are immutable too. The user must Unarchive (→ DRAFT)
// to make changes again.
const canEdit = computed(() => canUpdate.value && template.value?.statusId === 'DRAFT')

const editingName = ref(false)
const showPublishConfirm = ref(false)
const showArchiveConfirm = ref(false)
const showUnarchiveConfirm = ref(false)

useAutoSave(template, { onError: (err) => toast.error(err) })

const breadcrumbs = computed(() => [
  { label: 'Document Templates', to: getCompanyPath('/document-templates') },
  { label: template.value?.name || 'Template' },
])

async function onPublish() {
  if (!template.value) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'PUBLISHED'
  try {
    await template.value.save()
    toast.success('Template published')
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

async function onArchive() {
  if (!template.value) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'ARCHIVED'
  try {
    await template.value.save()
    router.push(getCompanyPath('/document-templates'))
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

async function onUnarchive() {
  if (!template.value) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'DRAFT'
  try {
    await template.value.save()
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

function goBack() {
  router.push(getCompanyPath('/document-templates'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-3">
        <button
          v-if="canUpdate && template?.statusId === 'DRAFT'"
          class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:rounded-lg tw:bg-primary tw:text-white tw:text-sm tw:font-medium tw:hover:bg-primary/90 tw:transition-colors"
          @click="showPublishConfirm = true"
        >
          <IconSend :size="16" />
          Publish
        </button>
        <button
          v-if="canArchive && template?.statusId !== 'ARCHIVED'"
          class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:rounded-lg tw:border tw:border-red-300 tw:text-red-600 tw:text-sm tw:font-medium tw:hover:bg-red-50 tw:transition-colors"
          @click="showArchiveConfirm = true"
        >
          <IconArchive :size="16" />
          Archive
        </button>
        <button
          v-if="canArchive && template?.statusId === 'ARCHIVED'"
          class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:rounded-lg tw:border tw:border-primary tw:text-primary tw:text-sm tw:font-medium tw:hover:bg-primary/10 tw:transition-colors"
          @click="showUnarchiveConfirm = true"
        >
          <IconArchiveOff :size="16" />
          Unarchive
        </button>
      </div>
    </SafeTeleport>

    <!-- Loading State -->
    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="lg" />
    </div>

    <!-- Template Details -->
    <div v-else-if="template" class="tw:flex-1 tw:overflow-y-auto tw:p-6">
      <div class="tw:max-w-5xl tw:mx-auto tw:space-y-6">
        <!-- Header -->
        <div class="tw:flex tw:items-start tw:justify-between">
          <div>
            <div class="tw:flex tw:items-center tw:gap-3 tw:mb-2">
              <!-- Editable name -->
              <template v-if="editingName && canEdit">
                <BaseTextInput
                  v-model="template.name"
                  placeholder="Template Name"
                  size="sm"
                  @keyup.enter="editingName = false"
                  @blur="editingName = false"
                />
              </template>
              <h1
                v-else
                class="tw:text-3xl tw:font-black tw:text-on-sidebar"
                :class="{ 'tw:cursor-pointer tw:hover:text-primary': canEdit }"
                @click="canEdit && (editingName = true)"
              >
                {{ template.name }}
              </h1>

              <DocumentTemplateStatusBadgeById :statusId="template.statusId" />
            </div>
            <p class="tw:text-secondary">
              Document prefix:
              <span class="tw:font-mono tw:font-bold">{{ template.prefix }}</span>
            </p>
          </div>
        </div>

        <!-- Basic Information Card -->
        <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
          <div
            class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
          >
            <IconInfoCircle :size="22" class="tw:text-primary" />
            <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Basic Information</h2>
          </div>
          <div class="tw:p-6 tw:grid tw:grid-cols-2 tw:gap-6">
            <div>
              <p class="tw:text-secondary tw:mb-1">Document Prefix</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.prefix"
                placeholder="Prefix"
                size="sm"
              />
              <p v-else class="tw:font-mono tw:font-bold tw:text-on-sidebar">
                {{ template.prefix }}
              </p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Department</p>
              <DepartmentSelectMenu v-if="canEdit" v-model="template.departmentId" />
              <template v-else>
                <DepartmentBadgeById
                  v-if="template.departmentId"
                  :departmentId="template.departmentId"
                />
                <span v-else class="tw:text-sm tw:text-secondary">—</span>
              </template>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Related Standard</p>
              <RelatedStandardSelectMenu v-if="canEdit" v-model="template.relatedStandardId" />
              <template v-else>
                <RelatedStandardBadgeById
                  v-if="template.relatedStandardId"
                  :relatedStandardId="template.relatedStandardId"
                />
                <span v-else class="tw:text-sm tw:text-secondary">—</span>
              </template>
            </div>
            <BaseDetailField label="Created Date" :value="template.createdAt?.formatDate('date')" />
            <BaseDetailField label="Last Modified" :value="template.updatedAt?.formatDate('date')" />

          </div>
        </div>

        <!-- Default Settings Card -->
        <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
          <div
            class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
          >
            <IconSettings :size="22" class="tw:text-primary" />
            <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Default Settings</h2>
          </div>
          <div class="tw:p-6 tw:grid tw:grid-cols-2 tw:md:grid-cols-3 tw:gap-6">
            <div>
              <p class="tw:text-secondary tw:mb-1">Training Available</p>
              <BaseSwitch v-model="template.trainingAvailable" :disabled="!canEdit" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Retraining on Version</p>
              <BaseSwitch v-model="template.retrainingOnVersion" :disabled="!canEdit" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Periodic Review</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.periodicReviewMonths"
                type="number"
                placeholder="Months"
              />
              <p v-else class="tw:text-on-sidebar">{{ template.periodicReviewMonths }} months</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Review Limit</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.reviewLimitDays"
                type="number"
                placeholder="Days"
              />
              <p v-else class="tw:text-on-sidebar">{{ template.reviewLimitDays }} days</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Approval Limit</p>
              <BaseTextInput
                v-if="canEdit"
                v-model="template.approvalLimitDays"
                type="number"
                placeholder="Days"
              />
              <p v-else class="tw:text-on-sidebar">{{ template.approvalLimitDays }} days</p>
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Auto Effective</p>
              <BaseSwitch v-model="template.autoEffectiveOnApproval" :disabled="!canEdit" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1">Show Section Titles</p>
              <BaseSwitch v-model="template.showSectionTitles" :disabled="!canEdit" />
            </div>
          </div>
        </div>

        <!-- Sections Card -->
        <DocumentSectionsEditor v-model="template.sections" :readonly="!canEdit" />
      </div>
    </div>

    <!-- Error State -->
    <div v-else class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:h-full tw:gap-4">
      <div class="tw:text-xl tw:text-secondary">Template not found</div>
      <button
        class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:rounded-lg tw:border tw:border-divider tw:text-sm tw:font-medium tw:hover:bg-main-hover tw:transition-colors"
        @click="goBack"
      >
        <IconArrowLeft :size="16" />
        Go Back
      </button>
    </div>

    <ConfirmDialog
      v-model="showPublishConfirm"
      title="Publish template"
      message="Once you publish this template, it can be used in documents — but you won't be able to edit it after publishing. Continue?"
      okLabel="Publish"
      @ok="onPublish"
    />

    <ConfirmDialog
      v-model="showArchiveConfirm"
      title="Archive template"
      message="Once this template is archived, you won't be able to edit it or use it for new documents. Continue?"
      okLabel="Archive"
      @ok="onArchive"
    />

    <ConfirmDialog
      v-model="showUnarchiveConfirm"
      title="Unarchive template"
      message="This template will return to Draft status — it will be editable again, but you'll need to publish it before it can be used for new documents. Continue?"
      okLabel="Unarchive"
      @ok="onUnarchive"
    />
  </div>
</template>
