<script setup>
import { IconMinus, IconPlus, IconX } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { required } from '@shared/components/form/validators.js'
import { futureDateRule } from './documentEffectiveDate.js'
import { pickPublishedVersionId } from '@/components/documentTemplates/documentTemplateApprovalFlow.js'

const form = defineModel({
  type: Object,
  required: true,
})

const selectedTemplate = defineModel('selectedTemplate', {
  type: [Object, null],
  default: null,
})

// Department options follow the selected sites (their own + company-wide). If
// the site selection changes and the chosen department belongs to a site no
// longer selected, clear it; company-wide (site-less) picks always survive.
const selectedDepartment = useLiveQueryWithDeps(
  [() => form.value.departmentId],
  async (db, [id]) => (id ? db.Department.findByPk(id) : null),
  { models: ['Department'], initial: null },
)
watch(
  [() => [...(form.value.siteIds || [])], () => form.value.appliesAllSites, selectedDepartment],
  ([siteIds, allSites, dept]) => {
    if (!dept || !dept.siteId || allSites) return
    if (siteIds.length && !siteIds.includes(dept.siteId)) form.value.departmentId = null
  },
)

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
  // The approval flow comes from the template too (2026-08-15) — there is no
  // workflow picker on this form any more. See documentTemplateApprovalFlow.js.
  form.value.workflowVersionId = inheritedVersionId.value
})

// The template's companion approval workflow, resolved to the published
// version a new document runs. Watched separately from the template itself
// because it resolves a beat later (two live queries deep).
const inheritedVersionId = useLiveQueryWithDeps(
  [() => resolvedTemplate.value?.workflowId],
  async (db, [workflowId]) => {
    if (!workflowId) return null
    const versions = await db.WorkflowVersion.where('workflowId', workflowId).exec()
    // PUBLISHED only — the template's flow is edited in the workflow builder,
    // so it routinely has a draft sitting beside the live version and a new
    // document must never start running someone's work in progress.
    return pickPublishedVersionId(versions)
  },
  { models: ['WorkflowVersion'], initial: null },
)

watch(inheritedVersionId, (id) => {
  form.value.workflowVersionId = id
})

// Steps of the inherited flow, shown read-only so the author can see who will
// be asked to sign before they create the document.
const inheritedSteps = useLiveQueryWithDeps(
  [() => inheritedVersionId.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder').exec()
  },
  { models: ['WorkflowStep'], initial: [] },
)

// Auto-release means the effective date is decided by the final approval, so
// a value carried over from the manual path would be dead data on the record.
watch(
  () => form.value.autoEffectiveOnApproval,
  (auto) => {
    if (auto) form.value.effectiveDate = null
    else if (!form.value.effectiveDate) form.value.effectiveDate = DateTime.now().plus({ days: 1 })
  },
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

    <!-- Sites — where the document applies. One control: pick sites or go
         company-wide. The managing anchor (documents.siteId) is derived
         silently at save; ownership governs who can revise. -->
    <BaseField
      label="Sites"
      required
      :value="form.appliesAllSites || form.siteIds?.length"
      :rules="[
        () =>
          form.appliesAllSites ||
          (form.siteIds?.length ?? 0) > 0 ||
          'Select at least one site, or choose All sites',
      ]"
    >
      <template #default="field">
        <div class="tw:space-y-2">
          <BaseCheckbox v-model="form.appliesAllSites" label="All sites (company-wide)" />
          <SiteSelectMenu
            v-if="!form.appliesAllSites"
            v-bind="field"
            v-model="form.siteIds"
            :multiple="true"
            nullLabel="Select sites…"
          />
        </div>
      </template>
    </BaseField>

    <!-- Department -->
    <BaseField label="Department" required :value="form.departmentId" :rules="[required()]">
      <template #default="field">
        <DepartmentSelectMenu
          v-bind="field"
          v-model="form.departmentId"
          :siteIds="form.appliesAllSites ? null : form.siteIds"
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

    <!-- Effective date belongs to the manual path only (user request
         2026-08-15): with auto-release on, the date is whenever the last
         approval lands, so offering a field there invites a value the system
         will ignore. Sits directly under the toggle it depends on. -->
    <BaseField
      v-if="!form.autoEffectiveOnApproval"
      label="Effective Date"
      required
      hint="When the approved document takes effect. Must be in the future — you're scheduling a release."
      :value="form.effectiveDate"
      :rules="[required('Effective date is required when auto-release is off'), futureDateRule()]"
    >
      <BaseDateField v-model="form.effectiveDate" mode="date" />
    </BaseField>

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

    <!-- Approval flow — inherited from the template, not picked here
         (2026-08-15). Read-only on purpose: the template is the single source
         of truth for how its documents get approved. -->
    <BaseField
      label="Approval Flow"
      class="tw:md:col-span-2"
      :value="form.workflowVersionId"
      :rules="[
        required(
          'The selected template has no approval flow — add reviewer and approver roles to it first',
        ),
      ]"
    >
      <div
        v-if="inheritedSteps.length"
        class="tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:p-3"
      >
        <div
          v-for="(step, i) in inheritedSteps"
          :key="step.id"
          class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
        >
          <span
            class="tw:flex tw:h-5 tw:w-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary/10 tw:text-micro tw:font-semibold tw:text-primary"
          >
            {{ i + 1 }}
          </span>
          <span class="tw:font-medium tw:text-on-main">{{ step.name }}</span>
          <WorkflowStepRoleBadges :stepId="step.id" />
          <span v-if="step.slaDays" class="tw:text-xs tw:text-secondary">
            · due in {{ step.slaDays }} days
          </span>
        </div>
        <p class="tw:text-xs tw:text-secondary">
          Defined by the “{{ selectedTemplate?.name }}” template.
        </p>
      </div>
      <p v-else-if="form.documentTemplateId" class="tw:text-sm tw:text-red-600">
        This template has no approval flow yet — add reviewer and approver roles to it before
        creating documents from it.
      </p>
      <p v-else class="tw:text-sm tw:text-secondary">Pick a template to see its approval flow.</p>
    </BaseField>
  </div>
</template>
