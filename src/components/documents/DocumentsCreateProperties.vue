<script setup>
import { IconMinus, IconPlus, IconX } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'

const form = defineModel({
  type: Object,
  required: true,
})

const selectedTemplate = defineModel('selectedTemplate', {
  type: [Object, null],
  default: null,
})

// Resolve template object from ID via SyncEngine
const resolvedTemplate = useLiveQueryWithDeps(
  [() => form.value.documentTemplateId],
  async (db, [templateId]) => {
    if (!templateId) return null
    return db.DocumentTemplate.findByPk(templateId)
  },

  { models: ['DocumentTemplate'], initial: null },
)

watch(resolvedTemplate, (template) => {
  selectedTemplate.value = template
  if (!template) return
  form.value.prefix = template.prefix
  form.value.relatedStandardId = template.relatedStandardId
  form.value.periodicReviewMonths = template.periodicReviewMonths
  form.value.autoEffectiveOnApproval = template.autoEffectiveOnApproval
})

// Short prefix code per document type. The seeded ids are mostly
// usable as-is (SOP / DOC / NC / CAPA …) but a few are too long for
// a document number prefix; map those to the conventional shorthand.
const DOCUMENT_TYPE_PREFIX_CODE = {
  WORK_INSTRUCTION: 'WI',
  POLICY: 'POL',
  SPECIFICATION: 'SPEC',
  RECORD: 'REC',
  AUDIT: 'AUD',
  RISK: 'RSK',
  CHANGE: 'CHG',
  MANUAL: 'MAN',
  FORM: 'FRM',
}
function prefixCodeForType(typeId) {
  if (!typeId) return null
  return DOCUMENT_TYPE_PREFIX_CODE[typeId] ?? typeId
}

// When the user (or the AI / PDF import) picks a document type, fill
// the prefix with {CODE}-{SITE_CODE}-{DEPARTMENT_CODE} so the document
// number is generated from the type — matching the NC / CAPA hardcoded
// convention the user asked for. We only do this when no template is
// selected; templates carry their own prefix and shouldn't be
// overwritten by a type change.
watch(
  () => form.value.documentTypeId,
  (typeId) => {
    if (!typeId) return
    if (form.value.documentTemplateId) return
    const code = prefixCodeForType(typeId)
    if (!code) return
    form.value.prefix = `${code}-{SITE_CODE}-{DEPARTMENT_CODE}`
  },
  { immediate: true },
)

// Prefix auto-uppercase
const prefix = computed({
  get: () => form.value.prefix,
  set: (value) => {
    form.value.prefix = value.toUpperCase()
  },
})

// Tags management
const newTag = ref('')

function addTag() {
  const tag = newTag.value.trim().toUpperCase()
  if (tag && !form.value.tags.includes(tag)) {
    form.value.tags.push(tag)
    newTag.value = ''
  }
}

function removeTag(index) {
  form.value.tags.splice(index, 1)
}

function incrementReviewMonths() {
  form.value.periodicReviewMonths++
}

function decrementReviewMonths() {
  if (form.value.periodicReviewMonths > 1) {
    form.value.periodicReviewMonths--
  }
}

// Prefix validation rules — mirrors the original Vuelidate rules.
const prefixRules = [
  required(),
  (value) => {
    if (!value) return true
    return (
      (/^[A-Z0-9{}\-_]+$/.test(value) && /[A-Z0-9}]$/.test(value)) ||
      'Only uppercase letters, numbers, hyphens, and placeholders {SITE_CODE}, {DEPARTMENT_CODE} are allowed'
    )
  },
  (value) => {
    if (!value) return true
    const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
    return (
      placeholders.every((p) => ['SITE_CODE', 'DEPARTMENT_CODE'].includes(p)) ||
      'Only {SITE_CODE} and {DEPARTMENT_CODE} placeholders are supported'
    )
  },
  (value) => {
    if (!value) return true
    const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
    return (
      new Set(placeholders).size === placeholders.length || 'Each placeholder can only be used once'
    )
  },
  (value) => {
    if (!value) return true
    const stripped = value.replace(/\{[A-Z_]+\}/g, '')
    return (
      (!stripped.includes('{') && !stripped.includes('}')) ||
      'Invalid placeholder format - check your curly braces'
    )
  },
]

// periodicReviewMonths must be >= 1
const reviewMonthsRules = [required(), (value) => value >= 1 || 'Must be at least 1 month']
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-2xl tw:shadow-sm tw:border tw:border-divider tw:p-8 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6"
  >
    <!-- Document Template -->
    <BaseField
      label="Document Template"
      required
      :value="form.documentTemplateId"
      :rules="[required()]"
    >
      <template #default="field">
        <DocumentTemplateSelectMenu
          v-bind="field"
          v-model="form.documentTemplateId"
          :required="true"
        />
      </template>
    </BaseField>

    <!-- Document Type -->
    <BaseField label="Document Type" required :value="form.documentTypeId" :rules="[required()]">
      <template #default="field">
        <DocumentTypeSelectMenu v-bind="field" v-model="form.documentTypeId" :required="true" />
      </template>
    </BaseField>

    <!-- Document Title -->
    <BaseField label="Document Title" required :value="form.title" :rules="[required()]">
      <template #default="field">
        <BaseTextInput
          v-bind="field"
          v-model="form.title"
          placeholder="e.g. Clean Room Sterilization Protocol"
        />
      </template>
    </BaseField>

    <!-- Related Standard -->
    <BaseField label="Related Standard">
      <RelatedStandardSelectMenu v-model="form.relatedStandardId" />
    </BaseField>

    <!-- Document Prefix -->
    <BaseField label="Document Prefix" required :value="prefix" :rules="prefixRules">
      <template #default="field">
        <div class="tw:space-y-2">
          <BaseTextInput v-bind="field" v-model="prefix" placeholder="e.g. SOP, DOC-{SITE_CODE}" />
          <p class="tw:text-xs tw:text-secondary tw:italic">
            Supports placeholders: {SITE_CODE}, {DEPARTMENT_CODE} (e.g. "DOC", "SOP-{SITE_CODE}",
            "DOC-{SITE_CODE}-{DEPARTMENT_CODE}").
          </p>
        </div>
      </template>
    </BaseField>

    <!-- Effective Date -->
    <BaseField label="Effective Date">
      <BaseDateField v-model="form.effectiveDate" mode="date" />
    </BaseField>

    <!-- Site -->
    <BaseField label="Site" required :value="form.siteId" :rules="[required()]">
      <template #default="field">
        <SiteSelectMenu v-bind="field" v-model="form.siteId" :required="true" />
      </template>
    </BaseField>

    <!-- Department -->
    <BaseField label="Department" required :value="form.departmentId" :rules="[required()]">
      <template #default="field">
        <DepartmentSelectMenu v-bind="field" v-model="form.departmentId" :required="true" />
      </template>
    </BaseField>

    <!-- Owner — accountable for the document lifecycle (periodic review,
         effectiveness). Defaults to you (the author); reassign to hand off. -->
    <BaseField
      label="Owner"
      required
      hint="Accountable for review & effectiveness. You remain the author."
      :value="form.ownerId"
      :rules="[required()]"
    >
      <template #default="field">
        <UserSelectMenu v-bind="field" v-model="form.ownerId" :required="true" />
      </template>
    </BaseField>

    <!-- Periodic Review Frequency -->
    <BaseField
      label="Periodic Review Frequency"
      required
      :value="form.periodicReviewMonths"
      :rules="reviewMonthsRules"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:flex tw:items-center tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden tw:bg-sidebar-hover"
        >
          <button
            class="tw:px-3 tw:py-2 tw:hover:bg-sidebar tw:text-secondary"
            @click="decrementReviewMonths"
          >
            <IconMinus :size="18" />
          </button>
          <input
            v-model.number="form.periodicReviewMonths"
            name="periodicReviewMonths"
            class="tw:w-16 tw:text-center tw:bg-transparent tw:border-none tw:focus:ring-0 tw:text-sm tw:font-bold tw:outline-none"
            type="number"
            min="1"
          />
          <button
            class="tw:px-3 tw:py-2 tw:hover:bg-sidebar tw:text-secondary"
            @click="incrementReviewMonths"
          >
            <IconPlus :size="18" />
          </button>
        </div>
        <span class="tw:text-sm tw:font-medium tw:text-secondary">months</span>
      </div>
    </BaseField>

    <!-- Auto Effective on Approval -->
    <div
      class="tw:flex tw:items-center tw:gap-4 tw:py-4 tw:px-6 tw:bg-sidebar-hover tw:rounded-2xl tw:border tw:border-divider/50"
    >
      <div class="tw:space-y-0.5 tw:flex-1">
        <p class="tw:text-sm tw:font-bold tw:text-on-sidebar">Automatically make effective</p>
        <p class="tw:text-xs tw:text-secondary">Skip manual release after final approval</p>
      </div>
      <BaseSwitch v-model="form.autoEffectiveOnApproval" />
    </div>

    <!-- Enable training (moved here from the Training tab so it's visible up
         front; the audience + assessment are still configured on that tab). -->
    <div
      class="tw:flex tw:items-center tw:gap-4 tw:py-4 tw:px-6 tw:bg-sidebar-hover tw:rounded-2xl tw:border tw:border-divider/50"
    >
      <div class="tw:space-y-0.5 tw:flex-1">
        <p class="tw:text-sm tw:font-bold tw:text-on-sidebar">Enable training for this document</p>
        <p class="tw:text-xs tw:text-secondary">
          Launch training when this document becomes effective. Set the audience &amp; assessment on
          the Training tab.
        </p>
      </div>
      <BaseSwitch v-model="form.trainingConfig.enabled" />
    </div>

    <!-- Tags (full width) -->
    <BaseField label="Tags" class="tw:md:col-span-2">
      <div
        class="tw:flex tw:flex-wrap tw:gap-2 tw:p-3 tw:bg-sidebar-hover tw:border tw:border-divider tw:rounded-xl"
      >
        <span
          v-for="(tag, index) in form.tags"
          :key="index"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:bg-primary/10 tw:text-primary tw:text-xs tw:font-bold tw:px-3 tw:py-1.5 tw:rounded-full tw:border tw:border-primary/20"
        >
          {{ tag }}
          <button class="tw:hover:text-primary-dark" @click="removeTag(index)">
            <IconX :size="14" />
          </button>
        </span>
        <input
          v-model="newTag"
          class="tw:bg-transparent tw:border-none tw:focus:ring-0 tw:text-sm tw:py-0 tw:h-auto tw:w-32 tw:placeholder:text-secondary tw:outline-none"
          placeholder="Add tag..."
          type="text"
          @keyup.enter="addTag"
        />
      </div>
    </BaseField>

    <!-- Workflow (full width) -->
    <BaseField label="Workflow" class="tw:md:col-span-2">
      <WorkflowVersionSelect v-model="form.workflowVersionId" moduleId="APPROVAL" />
    </BaseField>
  </div>
</template>
