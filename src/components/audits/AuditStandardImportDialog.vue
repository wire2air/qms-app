<script setup>
/**
 * BYOL (Bring-Your-Own-License) import for an audit standard.
 * Deliberately AI-FREE — paste / .txt / .csv / .json only. PDF + AI-
 * structuring belongs in the separate "AI Assist" dialog so that
 * tenants without the AI add-on still get a complete import path here.
 *
 * Surfaces /v1/services/auditStandards/import (Phase J-2): the BE
 * creates AuditStandard + v1.0 EFFECTIVE version + parsed clauses in
 * one transaction.
 *
 * License attestation is mandatory when contentLicense ==
 * CUSTOMER_LICENSED (the default) — the checkbox below is the
 * customer's representation that they hold a valid licence, and the
 * BE stamps attested_at + attested_by on success.
 *
 * Three input formats:
 *   - Paste: one clause per line, first whitespace-separated token is
 *            the clause number, rest is the title.
 *   - CSV:   exact header row required: clauseNumber,parentClauseNumber,title,
 *            questions,peopleToInterview,description,guidance,expectedEvidence.
 *            `questions` + `peopleToInterview` are pipe (" | ") separated.
 *   - JSON:  array of objects with the same field shape as CSV.
 */
import { IconUpload, IconAlertTriangle, IconFileUpload, IconDownload } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { required, requiredWhen } from '@shared/components/form/validators.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const toast = useToast()

// Each format ships a tight sample so spreadsheet users (especially
// CSV) can see the EXACT shape the BE parser expects. The `requiredFields`
// line + the "Download sample" button below the textarea were added in
// response to a real CSV import that failed with "header missing required
// column 'clauseNumber'" — the column name is case-sensitive + camelCase,
// which Excel-exported headers usually aren't.
// CSV template only — download the template, fill one row per clause, upload.
// The PDF / AI-assisted / paste / JSON paths were removed as too heavyweight;
// this keeps a single, predictable import shape.
const FORMATS = [
  {
    id: 'csv',
    label: 'CSV template',
    description:
      'Download the template, fill one row per clause, and upload it. The first row MUST be the header below (case + spelling exact). Only clauseNumber + title are required; the rest are optional per row. The checklist columns — questions, observations, expectedEvidence — and peopleToInterview hold MULTIPLE items in ONE cell separated by a pipe " | " (NOT commas — commas split CSV columns). Building it in Excel? Save As → CSV (UTF-8).',
    requiredFields:
      'Required header: clauseNumber,parentClauseNumber,title,questions,observations,expectedEvidence,peopleToInterview,description,guidance',
    sampleName: 'audit-standard-template.csv',
    sampleMime: 'text/csv',
    sample:
      'clauseNumber,parentClauseNumber,title,questions,observations,expectedEvidence,peopleToInterview,description,guidance\n' +
      '"4",,"Context of the organization",,,,,,\n' +
      '"4.1","4","Understanding the organization and its context","Has the organization determined external and internal issues? | Does it monitor and review them?","Issues log is current and reviewed","Context analysis document | Management review minutes","Quality Manager | Top Management",,\n' +
      '"7.1.5","7.1","Monitoring and measuring resources","Is measuring equipment calibrated? | Are calibration records maintained?","Calibration stickers present and in date on the floor","Calibration certificates | Calibration schedule","Calibration Technician | Quality Manager",,',
  },
]

const LICENSES = [
  {
    id: 'CUSTOMER_LICENSED',
    label: 'Licensed copy (BYOL)',
    description:
      "You hold a valid licence for this standard's normative text. Attestation is required.",
  },
  {
    id: 'CUSTOMER_AUTHORED',
    label: 'My own checklist',
    description:
      'Original content you authored (internal audit checklist, vendor assessment template). No third-party IP.',
  },
  {
    id: 'PUBLIC_DOMAIN',
    label: 'Public domain',
    description: 'Government regulation, US federal register text, etc. — no licence required.',
  },
]

const code = ref('')
const name = ref('')
const description = ref('')
const contentLicense = ref('CUSTOMER_LICENSED')
const format = ref('csv')
const content = ref('')
const licenseAttested = ref(false)
const customerLicenseReference = ref('')
const customerLicenseExpiresAt = ref('')
const submitting = ref(false)
const saveError = ref('')
const formRef = ref(null)

// File upload — fill the downloaded CSV template and upload it. CSV only;
// PDF / AI / paste / JSON paths were removed as too heavyweight.
const fileInputRef = ref(null)
const readingFile = ref(false)

function detectFormatFromName() {
  // CSV is the only supported format now.
  return 'csv'
}

async function onFilePicked(event) {
  const file = event.target.files?.[0]
  // Reset so re-selecting the same file still fires @change.
  if (event.target) event.target.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.warning('File too large (5 MB max). Paste the content instead.')
    return
  }
  readingFile.value = true
  try {
    const text = await file.text()
    content.value = text
    format.value = detectFormatFromName(file.name)
    toast.success(`Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
  } catch (err) {
    toast.error(err?.message || 'Failed to read file')
  } finally {
    readingFile.value = false
  }
}

function downloadActiveSample() {
  const fmt = activeFormat.value
  if (!fmt?.sample) return
  const blob = new Blob([fmt.sample], { type: fmt.sampleMime || 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fmt.sampleName || `clauses-sample.${fmt.id}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const activeFormat = computed(() => FORMATS.find((f) => f.id === format.value))
const requiresAttestation = computed(() => contentLicense.value === 'CUSTOMER_LICENSED')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    code.value = ''
    name.value = ''
    description.value = ''
    contentLicense.value = 'CUSTOMER_LICENSED'
    format.value = 'paste'
    content.value = ''
    licenseAttested.value = false
    customerLicenseReference.value = ''
    customerLicenseExpiresAt.value = ''
    saveError.value = ''
  },
)

function close() {
  emit('update:modelValue', false)
}

async function onValidSubmit() {
  if (submitting.value) return
  submitting.value = true
  saveError.value = ''
  try {
    const payload = {
      code: code.value.trim(),
      name: name.value.trim(),
      description: description.value.trim() || null,
      contentLicense: contentLicense.value,
      format: format.value,
      content: format.value === 'json' ? null : content.value,
      clauses: format.value === 'json' ? safeParseJson(content.value) : null,
      licenseAttested: licenseAttested.value,
      customerLicenseReference: customerLicenseReference.value.trim() || null,
      customerLicenseExpiresAt: customerLicenseExpiresAt.value || null,
    }
    const res = await post('/v1/services/auditStandards/import', payload)
    toast.success(`Imported ${res?.auditStandard?.name ?? name.value}`)
    emit('created', res?.auditStandard ?? null)
    close()
  } catch (err) {
    saveError.value = err?.message || 'Import failed'
  } finally {
    submitting.value = false
  }
}

function safeParseJson(raw) {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="Import Audit Standard"
    maxWidth="xl"
    @update:modelValue="close"
  >
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <!-- Header / context -->
        <div
          class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800 tw:leading-relaxed"
        >
          Bring-Your-Own-Licence import. Customers paste / upload their own clause list from a
          licensed standard (or original content). The BE creates the standard + a v1.0 EFFECTIVE
          version + parsed clauses in one transaction.
        </div>

        <!-- Identity -->
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField label="Code" required :value="code" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="code" placeholder="e.g. ISO-9001-INTERNAL" />
            </template>
          </BaseField>
          <BaseField label="Name" required :value="name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="name"
                placeholder="e.g. ISO 9001:2015 — internal interpretation"
              />
            </template>
          </BaseField>
        </div>

        <BaseField label="Description">
          <template #default="field">
            <BaseTextarea
              v-bind="field"
              v-model="description"
              :rows="2"
              placeholder="Short note about the source / scope of this import"
            />
          </template>
        </BaseField>

        <!-- License classification -->
        <BaseField label="Content licence">
          <div class="tw:flex tw:flex-col tw:gap-2">
            <label
              v-for="lic in LICENSES"
              :key="lic.id"
              class="tw:flex tw:items-start tw:gap-2 tw:p-2 tw:rounded tw:border tw:border-divider tw:cursor-pointer tw:hover:bg-main-hover/40"
              :class="contentLicense === lic.id ? 'tw:bg-primary/5 tw:border-primary' : ''"
            >
              <input
                v-model="contentLicense"
                type="radio"
                name="content-license"
                :value="lic.id"
                class="tw:mt-0.5"
              />
              <div class="tw:flex tw:flex-col">
                <span class="tw:text-sm tw:font-semibold">{{ lic.label }}</span>
                <span class="tw:text-xs tw:text-secondary">{{ lic.description }}</span>
              </div>
            </label>
          </div>
        </BaseField>

        <!-- License attestation, gated on CUSTOMER_LICENSED -->
        <div
          v-if="requiresAttestation"
          class="tw:rounded-lg tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-3 tw:flex tw:flex-col tw:gap-2"
        >
          <div class="tw:flex tw:items-start tw:gap-2 tw:text-xs tw:text-amber-900">
            <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
            <span>
              <strong>License attestation required.</strong> By checking the box below you represent
              that your organisation holds a valid licence for this standard. The system records the
              attesting user + timestamp.
            </span>
          </div>
          <BaseField
            label="License attestation"
            :value="licenseAttested"
            :rules="[
              requiredWhen(() => requiresAttestation, 'You must confirm you hold a valid licence.'),
            ]"
          >
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer">
              <input v-model="licenseAttested" type="checkbox" />
              I confirm we hold a valid licence for the content being imported.
            </label>
          </BaseField>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-2">
            <BaseField label="Licence reference" optional>
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="customerLicenseReference"
                  placeholder="e.g. ISO Online Browsing Platform subscription #…"
                />
              </template>
            </BaseField>
            <BaseField label="Licence expiry" optional>
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="customerLicenseExpiresAt" type="date" />
              </template>
            </BaseField>
          </div>
        </div>

        <!-- Input format picker. Stacked vertically (was a 3-up grid that
             crowded the labels). Each row reads as "type + description". -->
        <div>
          <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Format</p>
          <!-- Single format (CSV template). Render the guidance without the
               selector chrome since there's nothing to choose. -->
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="fmt in FORMATS"
              :key="fmt.id"
              class="tw:flex tw:flex-col tw:gap-0.5 tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-primary/5"
            >
              <span class="tw:text-sm tw:font-semibold">{{ fmt.label }}</span>
              <span class="tw:text-caption tw:text-secondary">{{ fmt.description }}</span>
            </div>
          </div>
        </div>

        <!-- Content textarea + file-upload affordance. Download the CSV
             template, fill it, and upload it (or paste the CSV inline). -->
        <BaseField
          label="Clauses"
          required
          :value="content"
          :rules="[required('Clause content is required.')]"
        >
          <template #label> Clauses ({{ activeFormat?.label ?? '' }}) </template>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:items-center tw:justify-end tw:gap-2">
              <BaseButton
                variant="outline"
                size="xs"
                :disabled="readingFile"
                @click="downloadActiveSample"
              >
                <template #icon><IconDownload :size="14" /></template>
                Download template
              </BaseButton>
              <BaseButton
                variant="outline"
                size="xs"
                :disabled="readingFile"
                @click="fileInputRef?.click()"
              >
                <template #icon><IconFileUpload :size="14" /></template>
                {{ readingFile ? 'Reading…' : 'Upload file' }}
              </BaseButton>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept=".csv,text/csv"
              class="tw:hidden"
              @change="onFilePicked"
            />
            <!-- Per-format requirements strip. Surfaces the EXACT header /
                 shape the BE parser expects so a wrong-cased CSV header
                 ("Clause Number" vs "clauseNumber") is impossible to miss
                 before submit. -->
            <div
              v-if="activeFormat?.requiredFields"
              class="tw:rounded tw:bg-gray-50 tw:border tw:border-gray-200 tw:px-2 tw:py-1.5 tw:text-caption tw:text-gray-700 tw:break-all"
            >
              {{ activeFormat.requiredFields }}
            </div>
            <BaseTextarea
              v-model="content"
              :rows="12"
              :placeholder="activeFormat?.sample ?? ''"
              class="tw:text-label"
            />
          </div>
        </BaseField>
      </div>
    </BaseForm>

    <template #footer="{ close: closeDialog }">
      <BaseDialogFooter
        submitLabel="Import"
        :loading="submitting"
        :error="saveError"
        @cancel="closeDialog"
        @submit="formRef?.submit()"
      >
        <template #submitIcon><IconUpload :size="16" /></template>
      </BaseDialogFooter>
    </template>
  </BaseDialog>
</template>
