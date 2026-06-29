<script setup>
import { IconEye, IconForms, IconPlus, IconCopy, IconPencil } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post, put } from '@/api'
import WorkflowStepFormBuilderPanel from '@/components/workflow/WorkflowStepFormBuilderPanel.vue'
import { selectAndUploadFile } from '@/composables/useFileUpload'
import { required } from '@shared/components/form/validators.js'

/**
 * Create / edit a public complaint form: name + description, the
 * attached dynamic form template (custom attributes), per-form system
 * field visibility/requiredness, and branding for the public page.
 */
const props = defineProps({
  // null → create mode; serialized form object → edit mode
  form: { type: Object, default: null },
})

const emit = defineEmits(['saved'])
const model = defineModel({ type: Boolean, default: false })

const toast = useToast()
const saving = ref(false)
const saveError = ref('')
const formRef = ref(null)

// Toggleable system fields (subject/description are locked-on server-side).
const TOGGLEABLE_FIELDS = [
  { key: 'name', label: 'Customer name' },
  { key: 'email', label: 'Customer email' },
  { key: 'phone', label: 'Phone' },
  { key: 'company', label: 'Company' },
]

const draft = ref(makeDraft(null))

function makeDraft(form) {
  return {
    name: form?.name ?? '',
    description: form?.description ?? '',
    // The form OWNS its field schema (workflow-step pattern). Templates
    // are only a copy source via "Use Template".
    schema: Array.isArray(form?.schema) ? [...form.schema] : [],
    systemFields: {
      name: { visible: true, required: true, ...(form?.systemFields?.name ?? {}) },
      email: { visible: true, required: true, ...(form?.systemFields?.email ?? {}) },
      phone: { visible: false, required: false, ...(form?.systemFields?.phone ?? {}) },
      company: { visible: false, required: false, ...(form?.systemFields?.company ?? {}) },
    },
    branding: {
      headerTitle: form?.branding?.headerTitle ?? '',
      introText: form?.branding?.introText ?? '',
      footerText: form?.branding?.footerText ?? '',
      logoUrl: form?.branding?.logoUrl ?? '',
      primaryColor: form?.branding?.primaryColor ?? '',
      backgroundColor: form?.branding?.backgroundColor ?? '',
      font: form?.branding?.font ?? '',
    },
  }
}

watch(model, (open) => {
  if (open) {
    draft.value = makeDraft(props.form)
    saveError.value = ''
  }
})

// ─── Embedded field schema (Start Blank / Use Template / Edit) ───────────────
const builderOpen = ref(false)
const startAtSelect = ref(false)

function openBlank() {
  startAtSelect.value = false
  builderOpen.value = true
}

function openFromTemplate() {
  startAtSelect.value = true
  builderOpen.value = true
}

function openEdit() {
  startAtSelect.value = false
  builderOpen.value = true
}

function handleSchemaSave(schema) {
  draft.value.schema = schema ?? []
}

const hasSchema = computed(() => (draft.value.schema?.length ?? 0) > 0)
const fieldCountLabel = computed(() => {
  const count = draft.value.schema?.length ?? 0
  return count === 1 ? '1 field' : `${count} fields`
})
const previewFieldNames = computed(() =>
  (draft.value.schema ?? [])
    .slice(0, 3)
    .map((f) => f.label ?? f.name ?? 'Untitled')
    .filter(Boolean),
)

// ─── Preview ──────────────────────────────────────────────────────────────────
// Renders the CURRENT DRAFT through the exact renderer the customer
// sees (ComplaintFormRenderer) — Form Builder → JSON definition →
// renderer, no server round trip. Option sets are resolved from IDB so
// dropdowns show their real options.
const showPreview = ref(false)
const previewDefinition = ref(null)

function resolveOptionSetsClientSide(schema, optionSetsById) {
  if (Array.isArray(schema)) {
    return schema.map((item) => resolveOptionSetsClientSide(item, optionSetsById))
  }
  if (typeof schema !== 'object' || schema === null) return schema
  const out = { ...schema }
  if (out.optionSetId && optionSetsById[out.optionSetId]) {
    out.options = optionSetsById[out.optionSetId]
    delete out.optionSetId
  }
  for (const key of Object.keys(out)) {
    if (Array.isArray(out[key])) out[key] = resolveOptionSetsClientSide(out[key], optionSetsById)
  }
  return out
}

const openPreview = useLiveMutation(async (db) => {
  let schema = null
  if (draft.value.schema?.length) {
    const optionSets = await db.OptionSet.where().exec()
    const optionSetsById = Object.fromEntries(optionSets.map((os) => [os.id, os.options]))
    schema = resolveOptionSetsClientSide(draft.value.schema, optionSetsById)
  }
  previewDefinition.value = {
    formName: draft.value.name || 'Untitled form',
    systemFields: {
      ...draft.value.systemFields,
      subject: { visible: true, required: true },
      description: { visible: true, required: true },
    },
    branding: draft.value.branding,
    schema,
  }
  showPreview.value = true
})

const uploadingLogo = ref(false)

async function handleLogoUpload() {
  uploadingLogo.value = true
  try {
    const result = await selectAndUploadFile('COMPANYLOGO', 'image/*')
    if (result.success) draft.value.branding.logoUrl = result.asset.url
    else if (result.error !== 'Upload cancelled' && result.error !== 'No file selected') {
      toast.notify({ type: 'negative', message: result.error || 'Upload failed' })
    }
  } finally {
    uploadingLogo.value = false
  }
}

async function onValidSubmit() {
  saving.value = true
  saveError.value = ''
  try {
    const payload = {
      name: draft.value.name.trim(),
      description: draft.value.description.trim() || null,
      schema: draft.value.schema,
      systemFields: draft.value.systemFields,
      branding: draft.value.branding,
    }
    const response = props.form
      ? await put(`/v1/services/customerComplaints/forms/${props.form.id}`, payload)
      : await post('/v1/services/customerComplaints/forms', payload)
    model.value = false
    emit('saved', response)
  } catch (e) {
    saveError.value = e.message || 'Failed to save form'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="model" :title="form ? 'Edit Form' : 'New Complaint Form'" maxWidth="lg">
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Form name" required :value="draft.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="draft.name"
                placeholder="Product Complaint Form"
              />
            </template>
          </BaseField>
          <BaseField label="Description" class="tw:col-span-2">
            <template #default="field">
              <BaseTextarea
                v-bind="field"
                v-model="draft.description"
                :rows="2"
                placeholder="Internal note about what this form is for…"
              />
            </template>
          </BaseField>
        </div>

        <!-- System fields -->
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText variant="overline">System fields</BaseText>
          <div class="tw:rounded-lg tw:border tw:border-divider tw:divide-y tw:divide-divider">
            <div
              class="tw:flex tw:items-center tw:px-3 tw:py-2 tw:text-xs tw:font-semibold tw:text-secondary"
            >
              <span class="tw:flex-1">Field</span>
              <span class="tw:w-20 tw:text-center">Visible</span>
              <span class="tw:w-20 tw:text-center">Required</span>
            </div>
            <!-- Locked fields -->
            <div
              v-for="locked in ['Subject', 'Description']"
              :key="locked"
              class="tw:flex tw:items-center tw:px-3 tw:py-2"
            >
              <span class="tw:flex-1 tw:text-sm">{{ locked }}</span>
              <span class="tw:w-20 tw:text-center tw:text-xs tw:text-secondary">Always</span>
              <span class="tw:w-20 tw:text-center tw:text-xs tw:text-secondary">Always</span>
            </div>
            <div
              v-for="field in TOGGLEABLE_FIELDS"
              :key="field.key"
              class="tw:flex tw:items-center tw:px-3 tw:py-2"
            >
              <span class="tw:flex-1 tw:text-sm">{{ field.label }}</span>
              <span class="tw:w-20 tw:flex tw:justify-center">
                <BaseCheckbox v-model="draft.systemFields[field.key].visible" />
              </span>
              <span class="tw:w-20 tw:flex tw:justify-center">
                <BaseCheckbox
                  v-model="draft.systemFields[field.key].required"
                  :disabled="!draft.systemFields[field.key].visible"
                />
              </span>
            </div>
          </div>
        </div>

        <!-- Custom fields — the form's own embedded schema -->
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText variant="overline">Custom fields</BaseText>

          <!-- Empty state: Start Blank / Use Template (copies fields) -->
          <div
            v-if="!hasSchema"
            class="tw:border tw:border-dashed tw:border-divider tw:rounded-xl tw:p-5 tw:flex tw:flex-col tw:items-center tw:gap-3 tw:text-center"
          >
            <IconForms :size="32" class="tw:text-secondary tw:opacity-40" />
            <div>
              <BaseText as="h3" weight="semibold">No custom fields yet</BaseText>
              <p class="tw:text-xs tw:text-secondary tw:mt-1">
                Start from scratch or copy fields from an existing form template. The form owns its
                fields — later template edits won't affect it.
              </p>
            </div>
            <div class="tw:flex tw:gap-2">
              <BaseButton variant="secondary" size="sm" @click="openBlank">
                <IconPlus :size="14" class="tw:mr-1" />
                Start Blank
              </BaseButton>
              <BaseButton variant="outline" size="sm" @click="openFromTemplate">
                <IconCopy :size="14" class="tw:mr-1" />
                Use Template
              </BaseButton>
            </div>
          </div>

          <!-- Has schema: summary + edit -->
          <div
            v-else
            class="tw:flex tw:items-center tw:gap-3 tw:border tw:border-divider tw:rounded-xl tw:p-3"
          >
            <span
              class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary tw:shrink-0"
            >
              {{ fieldCountLabel }}
            </span>
            <p class="tw:flex-1 tw:text-xs tw:text-secondary tw:truncate">
              {{ previewFieldNames.join(', ') }}{{ (draft.schema?.length ?? 0) > 3 ? ', …' : '' }}
            </p>
            <BaseButton variant="secondary" size="sm" @click="openEdit">
              <IconPencil :size="14" class="tw:mr-1" />
              Edit Fields
            </BaseButton>
          </div>
        </div>

        <!-- Branding -->
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText variant="overline">Public page branding</BaseText>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Header title">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="draft.branding.headerTitle"
                  placeholder="Defaults to the form name"
                />
              </template>
            </BaseField>
            <BaseField label="Footer text">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="draft.branding.footerText"
                  placeholder="e.g. We respond within 1 business day"
                />
              </template>
            </BaseField>
            <BaseField label="Intro text" class="tw:col-span-2">
              <template #default="field">
                <BaseTextarea
                  v-bind="field"
                  v-model="draft.branding.introText"
                  :rows="2"
                  placeholder="Shown above the form — tell customers what to include…"
                />
              </template>
            </BaseField>
            <BaseField label="Logo" class="tw:col-span-2">
              <div class="tw:flex tw:items-center tw:gap-2">
                <img
                  v-if="draft.branding.logoUrl"
                  :src="draft.branding.logoUrl"
                  alt=""
                  class="tw:h-8 tw:object-contain"
                />
                <BaseTextInput
                  v-model="draft.branding.logoUrl"
                  placeholder="https://… or upload"
                  class="tw:flex-1"
                />
                <BaseButton
                  variant="outline"
                  size="sm"
                  :disabled="uploadingLogo"
                  @click="handleLogoUpload"
                >
                  {{ uploadingLogo ? 'Uploading…' : 'Upload' }}
                </BaseButton>
              </div>
            </BaseField>
            <BaseField label="Header color">
              <BaseColorPicker v-model="draft.branding.primaryColor" />
            </BaseField>
            <BaseField label="Page background">
              <BaseColorPicker v-model="draft.branding.backgroundColor" />
            </BaseField>
            <BaseField label="Font" class="tw:col-span-2">
              <BaseSelectMenu
                v-model="draft.branding.font"
                :items="[
                  { id: 'system-ui, sans-serif', name: 'System (default)' },
                  { id: 'Georgia, serif', name: 'Serif' },
                  { id: '\'Courier New\', monospace', name: 'Monospace' },
                  { id: 'Verdana, sans-serif', name: 'Verdana' },
                  { id: '\'Trebuchet MS\', sans-serif', name: 'Trebuchet' },
                ]"
              />
            </BaseField>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseButton variant="outline" :disabled="saving" @click="openPreview">
        <IconEye :size="16" class="tw:mr-1" />
        Preview
      </BaseButton>
      <BaseErrorText v-if="saveError" :error="saveError" />
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="primary" :disabled="saving" @click="formRef.submit()">
        {{ saving ? 'Saving…' : form ? 'Save Changes' : 'Create Form' }}
      </BaseButton>
    </template>
  </BaseDialog>

  <!-- Full-screen field builder — the same panel workflow steps use. -->
  <WorkflowStepFormBuilderPanel
    v-model="builderOpen"
    :initialSchema="draft.schema"
    :startAtSelect="startAtSelect"
    builderTitle="Complaint Form Fields"
    @save="handleSchemaSave"
  />

  <!-- Customer-eye preview — same renderer as the public page. -->
  <BaseDialog v-model="showPreview" title="Form Preview" maxWidth="lg">
    <div class="tw:bg-gray-50 tw:p-4 tw:rounded-lg">
      <ComplaintFormRenderer v-if="previewDefinition" :definition="previewDefinition" preview />
    </div>
    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Close</BaseButton>
    </template>
  </BaseDialog>
</template>
