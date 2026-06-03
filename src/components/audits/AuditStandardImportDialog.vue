<script setup>
/**
 * BYOL (Bring-Your-Own-License) import for an audit standard. Surfaces
 * the existing /v1/services/auditStandards/import endpoint (Phase J-2)
 * so customers can paste a clause list / CSV / JSON from their
 * licensed copy of an industry standard. The BE creates AuditStandard
 * + v1.0 EFFECTIVE version + parsed clauses in one transaction.
 *
 * License attestation is mandatory when contentLicense ==
 * CUSTOMER_LICENSED (the default) — the checkbox below is the
 * customer's representation that they hold a valid licence, and the
 * BE stamps attested_at + attested_by on success.
 *
 * Three input formats:
 *   - Paste: one clause per line, first whitespace-separated token is
 *            the clause number, rest is the title.
 *   - CSV:   header: clauseNumber,title,description,guidance,expectedEvidence
 *   - JSON:  array of objects with the same field shape as CSV.
 */
import { IconUpload, IconAlertTriangle, IconFileUpload } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'created'])

const toast = useToast()

const FORMATS = [
  {
    id: 'paste',
    label: 'Paste clause list',
    description: 'One clause per line. First token = clause number, rest = title. Most forgiving for quick imports.',
    placeholder:
      '4.1 Understanding the organization and its context\n' +
      '4.2 Understanding the needs and expectations of interested parties\n' +
      '4.3 Determining the scope of the QMS\n' +
      '4.4 QMS and its processes',
  },
  {
    id: 'csv',
    label: 'CSV',
    description:
      'First row is the header: clauseNumber,title,description,guidance,expectedEvidence. Only the first two columns are required.',
    placeholder:
      'clauseNumber,title,description,guidance,expectedEvidence\n' +
      '"4.1","Understanding context","Section header","Verify…","Evidence to collect…"\n' +
      '"4.2","Interested parties",,"Verify…",',
  },
  {
    id: 'json',
    label: 'JSON',
    description: 'Array of { clauseNumber, title, description?, guidance?, expectedEvidence?, riskWeight? }.',
    placeholder:
      '[\n' +
      '  { "clauseNumber": "4.1", "title": "Understanding context" },\n' +
      '  { "clauseNumber": "4.2", "title": "Interested parties" }\n' +
      ']',
  },
]

const LICENSES = [
  {
    id: 'CUSTOMER_LICENSED',
    label: 'Licensed copy (BYOL)',
    description:
      'You hold a valid licence for this standard\'s normative text. Attestation is required.',
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
    description:
      'Government regulation, US federal register text, etc. — no licence required.',
  },
]

const code = ref('')
const name = ref('')
const description = ref('')
const contentLicense = ref('CUSTOMER_LICENSED')
const format = ref('paste')
const content = ref('')
const licenseAttested = ref(false)
const customerLicenseReference = ref('')
const customerLicenseExpiresAt = ref('')
const submitting = ref(false)

// File upload — saves users from copy-pasting long clause lists out of
// their licensed copy. Accepts .txt (paste), .csv (csv), .json (json).
// PDFs go through a separate AI-structuring pipeline added in a
// follow-up commit; not handled here.
const fileInputRef = ref(null)
const readingFile = ref(false)

function detectFormatFromName(filename) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv')) return 'csv'
  if (lower.endsWith('.json')) return 'json'
  // .txt / unknown all go through the paste parser.
  return 'paste'
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
  },
)

function close() {
  emit('update:modelValue', false)
}

async function handleImport() {
  if (submitting.value) return
  if (!code.value.trim() || !name.value.trim() || !content.value.trim()) {
    toast.warning('Code, name, and content are required.')
    return
  }
  if (requiresAttestation.value && !licenseAttested.value) {
    toast.warning('Confirm the license attestation to import a CUSTOMER_LICENSED standard.')
    return
  }
  submitting.value = true
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
    toast.error(err?.message || 'Import failed')
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
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Header / context -->
      <div
        class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-800 tw:leading-relaxed"
      >
        Bring-Your-Own-Licence import. Customers paste / upload their
        own clause list from a licensed standard (or original
        content). The BE creates the standard + a v1.0 EFFECTIVE
        version + parsed clauses in one transaction.
      </div>

      <!-- Identity -->
      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Code</p>
          <BaseTextInput
            v-model="code"
            placeholder="e.g. ISO-9001-INTERNAL"
            :required="true"
          />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Name</p>
          <BaseTextInput
            v-model="name"
            placeholder="e.g. ISO 9001:2015 — internal interpretation"
            :required="true"
          />
        </div>
      </div>

      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Description</p>
        <BaseTextarea
          v-model="description"
          :rows="2"
          placeholder="Short note about the source / scope of this import"
        />
      </div>

      <!-- License classification -->
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Content licence
        </p>
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
      </div>

      <!-- License attestation, gated on CUSTOMER_LICENSED -->
      <div
        v-if="requiresAttestation"
        class="tw:rounded-lg tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-3 tw:flex tw:flex-col tw:gap-2"
      >
        <div class="tw:flex tw:items-start tw:gap-2 tw:text-xs tw:text-amber-900">
          <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
          <span>
            <strong>License attestation required.</strong> By checking the
            box below you represent that your organisation holds a valid
            licence for this standard. The system records the attesting
            user + timestamp.
          </span>
        </div>
        <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer">
          <input v-model="licenseAttested" type="checkbox" />
          I confirm we hold a valid licence for the content being
          imported.
        </label>
        <div class="tw:grid tw:grid-cols-2 tw:gap-2">
          <div>
            <p class="tw:text-[10px] tw:uppercase tw:text-secondary tw:mb-1">
              Licence reference (optional)
            </p>
            <BaseTextInput
              v-model="customerLicenseReference"
              placeholder="e.g. ISO Online Browsing Platform subscription #…"
            />
          </div>
          <div>
            <p class="tw:text-[10px] tw:uppercase tw:text-secondary tw:mb-1">
              Licence expiry (optional)
            </p>
            <BaseTextInput v-model="customerLicenseExpiresAt" type="date" />
          </div>
        </div>
      </div>

      <!-- Input format picker. Stacked vertically (was a 3-up grid that
           crowded the labels). Each row reads as "type + description". -->
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Format</p>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <button
            v-for="fmt in FORMATS"
            :key="fmt.id"
            type="button"
            class="tw:flex tw:items-start tw:gap-3 tw:text-left tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:cursor-pointer tw:hover:border-primary tw:hover:bg-primary/5"
            :class="format === fmt.id ? 'tw:bg-primary/5 tw:border-primary' : 'tw:bg-white'"
            @click="format = fmt.id"
          >
            <input
              type="radio"
              name="import-format"
              :value="fmt.id"
              :checked="format === fmt.id"
              class="tw:mt-1 tw:shrink-0"
              tabindex="-1"
            />
            <div class="tw:flex tw:flex-col tw:gap-0.5 tw:flex-1 tw:min-w-0">
              <span class="tw:text-sm tw:font-semibold">{{ fmt.label }}</span>
              <span class="tw:text-[11px] tw:text-secondary">{{ fmt.description }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Content textarea + file-upload affordance. Upload button reads
           a local .txt / .csv / .json into the textarea and auto-picks
           the matching format. Saves users from copy-pasting long clause
           lists from their licensed copy. -->
      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
            Clauses ({{ activeFormat?.label ?? '' }})
          </p>
          <BaseButton
            variant="outline"
            size="xs"
            :disabled="readingFile"
            @click="fileInputRef?.click()"
          >
            <template #icon><IconFileUpload :size="14" /></template>
            {{ readingFile ? 'Reading…' : 'Upload file' }}
          </BaseButton>
          <input
            ref="fileInputRef"
            type="file"
            accept=".txt,.csv,.json,text/plain,text/csv,application/json"
            class="tw:hidden"
            @change="onFilePicked"
          />
        </div>
        <BaseTextarea
          v-model="content"
          :rows="12"
          :placeholder="activeFormat?.placeholder ?? ''"
          class="tw:font-mono tw:text-[12px]"
        />
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="submitting" @click="close">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :loading="submitting"
        :disabled="submitting || !code.trim() || !name.trim() || !content.trim() || (requiresAttestation && !licenseAttested)"
        @click="handleImport"
      >
        <template #icon><IconUpload :size="16" /></template>
        Import
      </BaseButton>
    </template>
  </BaseDialog>
</template>
