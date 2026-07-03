<script setup>
import { IconInfoCircle, IconSettings } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import {
  buildDocumentTemplateBanners,
  buildDocumentTemplateSections,
  buildDocumentTemplateActions,
} from './documentTemplateDetailConfig.js'

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
const { confirm } = useConfirm()

useAutoSave(template, { onError: (err) => toast.error(err) })

async function onPublish() {
  if (!template.value) return
  const ok = await confirm({
    title: 'Publish template',
    message: `Once you publish this template, it can be used in documents — but you won't be able to edit it after publishing. Continue?`,
    okLabel: 'Publish',
  })
  if (!ok) return
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
  const ok = await confirm({
    title: 'Archive template',
    message: `Once this template is archived, you won't be able to edit it or use it for new documents. Continue?`,
    okLabel: 'Archive',
    danger: true,
  })
  if (!ok) return
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
  const ok = await confirm({
    title: 'Unarchive template',
    message: `This template will return to Draft status — it will be editable again, but you'll need to publish it before it can be used for new documents. Continue?`,
    okLabel: 'Unarchive',
  })
  if (!ok) return
  const lastStatus = template.value.statusId
  template.value.statusId = 'DRAFT'
  try {
    await template.value.save()
  } catch (err) {
    template.value.statusId = lastStatus
    toast.error(err)
  }
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Document Templates', to: getCompanyPath('/document-templates') },
  { label: template.value?.name || 'Template' },
])
const documentTemplateBanners = computed(() => buildDocumentTemplateBanners(template.value))
const documentTemplateActions = computed(() =>
  buildDocumentTemplateActions(
    {
      canUpdate: canUpdate.value,
      canArchive: canArchive.value,
      statusId: template.value?.statusId,
    },
    { publish: onPublish, archive: onArchive, unarchive: onUnarchive },
  ),
)
const documentTemplateDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => documentTemplateBanners.value,
    actions: documentTemplateActions.value,
    sections: buildDocumentTemplateSections(template.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="documentTemplateDetailConfig"
    :record="template"
    :loading="loading"
    :notFound="!loading && !template"
    notFoundTitle="Template not found"
    notFoundDescription="This template could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingName && canEdit"
        v-model="template.name"
        placeholder="Template Name"
        size="sm"
        autofocus
        @keyup.enter="editingName = false"
        @blur="editingName = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="canEdit ? 'tw:hover:text-primary' : ''"
        :disabled="!canEdit"
        aria-label="Edit template name"
        @click="canEdit && (editingName = true)"
      >
        {{ template?.name }}
      </BaseClickableRow>
    </template>

    <template #status>
      <DocumentTemplateStatusBadgeById v-if="template" :statusId="template.statusId" />
    </template>

    <template v-if="template" #meta>
      <span class="">{{ template.prefix }}</span>
    </template>

    <template #actions>
      <DetailActionBar :actions="documentTemplateActions" />
    </template>

    <template v-if="template" #rail>
      <BaseRailCard title="Basic Information" :icon="IconInfoCircle">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseDetailField label="Document Prefix">
            <BaseTextInput v-if="canEdit" v-model="template.prefix" placeholder="Prefix" size="sm" />
            <span v-else class="tw:font-bold tw:text-on-main">{{ template.prefix }}</span>
          </BaseDetailField>
          <BaseDetailField label="Department">
            <DepartmentSelectMenu v-if="canEdit" v-model="template.departmentId" />
            <template v-else>
              <DepartmentBadgeById
                v-if="template.departmentId"
                :departmentId="template.departmentId"
              />
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </template>
          </BaseDetailField>
          <BaseDetailField label="Related Standard">
            <RelatedStandardSelectMenu v-if="canEdit" v-model="template.relatedStandardId" />
            <template v-else>
              <RelatedStandardBadgeById
                v-if="template.relatedStandardId"
                :relatedStandardId="template.relatedStandardId"
              />
              <span v-else class="tw:text-sm tw:text-secondary">—</span>
            </template>
          </BaseDetailField>
          <BaseDetailField
            label="Created"
            layout="inline"
            :value="template.createdAt?.formatDate('date')"
          />
          <BaseDetailField
            label="Last Modified"
            layout="inline"
            :value="template.updatedAt?.formatDate('date')"
          />
        </div>
      </BaseRailCard>
    </template>

    <template v-if="template" #section-details>
      <div class="tw:flex tw:flex-col tw:gap-6">
      <!-- Default Settings Card -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div
          class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
        >
          <IconSettings :size="22" class="tw:text-primary" />
          <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar">Default Settings</h2>
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
    </template>
  </BaseDetailLayout>
</template>
