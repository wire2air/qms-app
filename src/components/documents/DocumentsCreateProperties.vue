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

// Where the document APPLIES (visibility). The Site field above is the OWNING
// site (always applies); company-wide skips per-site rows entirely.
const APPLICABILITY_OPTIONS = [
  { label: 'This site only', value: 'SITE', description: 'Visible per site-scoped document access' },
  { label: 'Selected sites', value: 'SITES', description: 'Owning site plus the sites you add' },
  {
    label: 'All sites (company-wide)',
    value: 'ALL',
    description: 'Everyone with document access can see it',
  },
]

// Department options follow the selected site (site's own + org-wide). If the
// site changes and the chosen department belongs to a DIFFERENT site, clear it
// so a cross-site pairing can't be saved; org-wide (site-less) picks survive.
const selectedDepartment = useLiveQueryWithDeps(
  [() => form.value.departmentId],
  async (db, [id]) => (id ? db.Department.findByPk(id) : null),
  { models: ['Department'], initial: null },
)
watch([() => form.value.siteId, selectedDepartment], ([siteId, dept]) => {
  if (!siteId || !dept) return
  if (dept.siteId && dept.siteId !== siteId) form.value.departmentId = null
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

    <!-- Site (owning — governs editing reach and the department pairing) -->
    <BaseField label="Site" required :value="form.siteId" :rules="[required()]">
      <template #default="field">
        <SiteSelectMenu v-bind="field" v-model="form.siteId" :required="true" />
      </template>
    </BaseField>

    <!-- Applicability — where the document applies (visibility) -->
    <BaseField label="Applies to" :value="form.applicability">
      <template #default="field">
        <BaseSelect
          v-bind="field"
          v-model="form.applicability"
          :options="APPLICABILITY_OPTIONS"
          optionDescription="description"
          :searchable="false"
          :clearable="false"
        />
      </template>
    </BaseField>
    <BaseField
      v-if="form.applicability === 'SITES'"
      label="Applicable sites"
      :value="form.applicabilitySiteIds"
    >
      <template #default="field">
        <SiteSelectMenu
          v-bind="field"
          v-model="form.applicabilitySiteIds"
          :multiple="true"
          nullLabel="Add sites…"
        />
      </template>
    </BaseField>

    <!-- Department -->
    <BaseField label="Department" required :value="form.departmentId" :rules="[required()]">
      <template #default="field">
        <DepartmentSelectMenu
          v-bind="field"
          v-model="form.departmentId"
          :siteId="form.siteId"
          :required="true"
        />
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
