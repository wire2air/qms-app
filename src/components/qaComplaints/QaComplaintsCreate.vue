<script setup>
import {
  IconPaperclip,
  IconX,
  IconInfoCircle,
  IconUser,
  IconListDetails,
  IconMapPin,
  IconPackage,
  IconCategory,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { uploadFile } from '@/composables/useFileUpload'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { required } from '@shared/components/form/validators.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'
import DynamicForm from '@/components/form/DynamicForm.js'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'

/**
 * Manual QA complaint entry. Most complaints arrive via CSV import or the
 * Zendesk integration; this covers the case where QA logs one by hand. Writes
 * to the same customer_complaints table, then drops the user into the QA
 * investigation page. QA-specific fields (lot/batch/region/symptoms) are added
 * on the detail page via custom fields.
 */
const router = useRouter()
const toast = useToast()
const saving = ref(false)
const submitError = ref('')

const form = ref({
  subject: '',
  description: '',
  priorityId: null,
  sourceId: 'OTHER',
  customerName: '',
  customerEmail: '',
  customerCompany: '',
  customerPhone: '',
  // QMS first-class fields.
  complaintSourceId: null,
  regionId: null,
  countryId: null,
  stateProvince: '',
  siteId: null,
  productId: null,
  productCodeSku: '',
  batchLotSerial: '',
  quantityAffected: null,
  orderInvoiceNumber: '',
  customerTypeId: null,
  categoryId: null,
  subCategoryId: null,
  complaintTypeId: null,
  severityId: null,
  riskLevelId: null,
  regulatoryReportable: false,
  safetyIssue: false,
})

const pendingAssets = ref([])
const uploading = ref(false)
const fileInputRef = ref(null)

const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })
const { allowLeave } = useUnsavedChangesGuard(isDirty)

// ─── Additional information (admin-defined custom fields) ─────────────────────
// Same EntityFieldSet schema the detail-page CustomFieldsCard renders. Collected
// into a local buffer here and sealed into an EntityFieldValue row right after
// the complaint is created (we need its id first). Self-hides when no custom
// fields are configured for CustomerComplaint.
const fieldSet = useLiveQuery(
  async (db) => db.EntityFieldSet.where('entityType', 'CustomerComplaint').first(),
  { models: ['EntityFieldSet'] },
)
const customFieldSchema = computed(() =>
  Array.isArray(fieldSet.value?.schema) ? fieldSet.value.schema : [],
)
const hasCustomFields = computed(() => customFieldSchema.value.length > 0)
const customFields = ref({})
watch(customFields, () => (isDirty.value = true), { deep: true })

const saveCustomFields = useLiveMutation(async (db, { entityId, payload, schema }) => {
  const frozen = await freezeOptionLabels(db, schema, payload)
  const row = db.EntityFieldValue.create({
    entityType: 'CustomerComplaint',
    entityId,
    payload: frozen,
    formSchema: schema,
  })
  await row.save()
  return row
})

const navSections = computed(() => [
  {
    id: 'qc-details',
    label: 'Details',
    icon: IconInfoCircle,
    status: form.value.subject.trim() ? 'complete' : null,
  },
  { id: 'qc-origin', label: 'Source & origin', icon: IconMapPin, status: null },
  { id: 'qc-product', label: 'Product', icon: IconPackage, status: null },
  { id: 'qc-classification', label: 'Classification', icon: IconCategory, status: null },
  { id: 'qc-customer', label: 'Customer', icon: IconUser, status: null },
  ...(hasCustomFields.value
    ? [{ id: 'qc-additional', label: 'Additional information', icon: IconListDetails, status: null }]
    : []),
  {
    id: 'qc-attachments',
    label: 'Attachments',
    icon: IconPaperclip,
    status: pendingAssets.value.length ? 'complete' : null,
  },
])

function onPickFiles() {
  fileInputRef.value?.click()
}

async function onFilesSelected(event) {
  const files = [...(event.target.files ?? [])]
  event.target.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      const result = await uploadFile(file, 'ASSET')
      if (result.success) {
        pendingAssets.value.push(result.asset)
      } else {
        toast.notify({ type: 'negative', message: result.error || `Failed to upload ${file.name}` })
      }
    }
  } finally {
    uploading.value = false
  }
}

function removePendingAsset(assetId) {
  pendingAssets.value = pendingAssets.value.filter((a) => a.id !== assetId)
}

function goBack() {
  router.push(getCompanyPath('/complaints'))
}

async function onSubmit() {
  saving.value = true
  submitError.value = ''
  try {
    const response = await post('/v1/services/customerComplaints', {
      subject: form.value.subject.trim(),
      description: form.value.description || null,
      priorityId: form.value.priorityId,
      sourceId: form.value.sourceId || 'OTHER',
      customerName: form.value.customerName || null,
      customerEmail: form.value.customerEmail || null,
      customerCompany: form.value.customerCompany || null,
      customerPhone: form.value.customerPhone || null,
      // QMS first-class fields.
      complaintSourceId: form.value.complaintSourceId,
      regionId: form.value.regionId,
      countryId: form.value.countryId,
      stateProvince: form.value.stateProvince || null,
      siteId: form.value.siteId,
      productId: form.value.productId,
      productCodeSku: form.value.productCodeSku || null,
      batchLotSerial: form.value.batchLotSerial || null,
      quantityAffected: form.value.quantityAffected,
      orderInvoiceNumber: form.value.orderInvoiceNumber || null,
      customerTypeId: form.value.customerTypeId,
      categoryId: form.value.categoryId,
      subCategoryId: form.value.subCategoryId,
      complaintTypeId: form.value.complaintTypeId,
      severityId: form.value.severityId,
      riskLevelId: form.value.riskLevelId,
      regulatoryReportable: form.value.regulatoryReportable,
      safetyIssue: form.value.safetyIssue,
      assetIds: pendingAssets.value.map((a) => a.id),
    })
    const newId = response.customerComplaint.id
    // Additional information: seal the custom-field answers onto the new record.
    // The complaint already exists at this point, so a failure here is
    // non-fatal — surface it but still open the record (fields can be added
    // there via the Additional information card).
    if (hasCustomFields.value && Object.keys(customFields.value).length) {
      try {
        await saveCustomFields({
          entityId: newId,
          payload: customFields.value,
          schema: customFieldSchema.value,
        })
      } catch (e) {
        toast.notify({
          type: 'warning',
          message: e.message || 'Complaint created, but the additional information could not be saved.',
        })
      }
    }
    allowLeave()
    router.push(getCompanyPath(`/complaints/${newId}`))
  } catch (e) {
    submitError.value = e.message || 'Failed to create complaint'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs
          :items="[
            { label: 'Complaints', to: getCompanyPath('/complaints') },
            { label: 'New Complaint' },
          ]"
        />
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:sticky tw:top-0 tw:z-10 tw:bg-main">
        <FormProgressNav :sections="navSections" />
      </div>
      <BaseForm
        class="tw:py-6"
        :dirty="isDirty"
        :loading="saving || uploading"
        :submitError="submitError"
        submitLabel="Create Complaint"
        @submit="onSubmit"
        @cancel="goBack"
      >
        <FormSection id="qc-details" title="Complaint details" :icon="IconInfoCircle">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              id="qc-subject"
              label="Subject"
              required
              :value="form.subject"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.subject"
                  placeholder="Short summary of the complaint…"
                />
              </template>
            </BaseField>
            <BaseField label="Description">
              <BaseTextarea
                v-model="form.description"
                placeholder="Describe the complaint in the customer's words…"
                :rows="5"
              />
            </BaseField>
            <BaseFieldRow :columns="2">
              <BaseField label="Source">
                <div class="tw:flex tw:gap-2">
                  <BaseButton
                    v-for="s in ['WEB', 'PHONE', 'OTHER']"
                    :key="s"
                    class="tw:flex-1 tw:justify-center"
                    :variant="form.sourceId === s ? 'primary' : 'outline'"
                    @click="form.sourceId = s"
                  >
                    {{ s.charAt(0) + s.slice(1).toLowerCase() }}
                  </BaseButton>
                </div>
              </BaseField>
              <BaseField label="Priority">
                <div class="tw:flex tw:gap-2">
                  <BaseButton
                    v-for="p in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']"
                    :key="p"
                    class="tw:flex-1 tw:justify-center"
                    :variant="form.priorityId === p ? 'primary' : 'outline'"
                    @click="form.priorityId = form.priorityId === p ? null : p"
                  >
                    {{ p.charAt(0) + p.slice(1).toLowerCase() }}
                  </BaseButton>
                </div>
              </BaseField>
            </BaseFieldRow>
          </div>
        </FormSection>

        <!-- Source & origin -->
        <FormSection id="qc-origin" title="Source & origin" :icon="IconMapPin" optional>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseFieldRow :columns="2">
              <BaseField label="Complaint source">
                <ComplaintLookupSelectMenu v-model="form.complaintSourceId" model="ComplaintSourceType" />
              </BaseField>
              <BaseField label="Region">
                <ComplaintLookupSelectMenu v-model="form.regionId" model="ComplaintRegion" />
              </BaseField>
              <BaseField label="Country">
                <ComplaintLookupSelectMenu
                  v-model="form.countryId"
                  model="ComplaintCountry"
                  parentField="regionId"
                  :parentId="form.regionId"
                />
              </BaseField>
              <BaseField label="State / Province">
                <BaseTextInput v-model="form.stateProvince" placeholder="e.g. California" />
              </BaseField>
              <BaseField label="Site / Branch">
                <SiteSelectMenu v-model="form.siteId" :required="false" />
              </BaseField>
            </BaseFieldRow>
          </div>
        </FormSection>

        <!-- Product specifics -->
        <FormSection id="qc-product" title="Product specifics" :icon="IconPackage" optional>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField label="Product / Service involved">
              <ProductSelectMenu v-model="form.productId" :required="false" />
            </BaseField>
            <BaseFieldRow :columns="2">
              <BaseField label="Product code / SKU">
                <BaseTextInput v-model="form.productCodeSku" placeholder="SKU" />
              </BaseField>
              <BaseField label="Batch / Lot / Serial">
                <BaseTextInput v-model="form.batchLotSerial" placeholder="e.g. LOT-2026-014" />
              </BaseField>
              <BaseField label="Quantity affected">
                <BaseTextInput v-model.number="form.quantityAffected" type="number" :min="0" />
              </BaseField>
              <BaseField label="Order / Invoice number">
                <BaseTextInput v-model="form.orderInvoiceNumber" placeholder="Optional" />
              </BaseField>
            </BaseFieldRow>
          </div>
        </FormSection>

        <!-- Classification -->
        <FormSection id="qc-classification" title="Classification" :icon="IconCategory" optional>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseFieldRow :columns="2">
              <BaseField label="Category">
                <ComplaintLookupSelectMenu v-model="form.categoryId" model="ComplaintCategory" />
              </BaseField>
              <BaseField label="Sub-category">
                <ComplaintLookupSelectMenu
                  v-model="form.subCategoryId"
                  model="ComplaintSubCategory"
                  parentField="categoryId"
                  :parentId="form.categoryId"
                />
              </BaseField>
              <BaseField label="Complaint type">
                <ComplaintLookupSelectMenu v-model="form.complaintTypeId" model="ComplaintType" />
              </BaseField>
              <BaseField label="Severity">
                <ComplaintLookupSelectMenu v-model="form.severityId" model="ComplaintSeverity" />
              </BaseField>
              <BaseField label="Risk level">
                <ComplaintLookupSelectMenu v-model="form.riskLevelId" model="ComplaintRiskLevel" />
              </BaseField>
            </BaseFieldRow>
            <div class="tw:flex tw:flex-wrap tw:gap-4">
              <BaseCheckbox v-model="form.regulatoryReportable" label="Regulatory reportable" />
              <BaseCheckbox v-model="form.safetyIssue" label="Safety issue" />
            </div>
          </div>
        </FormSection>

        <FormSection
          id="qc-customer"
          title="Customer details"
          :icon="IconUser"
          optional
          collapsible
          :defaultOpen="false"
        >
          <BaseFieldRow :columns="2">
            <BaseField label="Name">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.customerName" placeholder="Customer contact name" />
              </template>
            </BaseField>
            <BaseField label="Email">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.customerEmail" type="email" placeholder="customer@example.com" />
              </template>
            </BaseField>
            <BaseField label="Company">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.customerCompany" placeholder="Customer company" />
              </template>
            </BaseField>
            <BaseField label="Phone">
              <template #default="field">
                <BaseTextInput v-bind="field" v-model="form.customerPhone" placeholder="Phone number" />
              </template>
            </BaseField>
            <BaseField label="Customer type">
              <ComplaintLookupSelectMenu v-model="form.customerTypeId" model="ComplaintCustomerType" />
            </BaseField>
          </BaseFieldRow>
        </FormSection>

        <!-- Additional information — admin-defined custom fields (lot / batch /
             region / symptoms …). Self-hides when none are configured. -->
        <FormSection
          v-if="hasCustomFields"
          id="qc-additional"
          title="Additional information"
          :icon="IconListDetails"
        >
          <DynamicForm v-model="customFields" :fields="customFieldSchema" />
        </FormSection>

        <FormSection
          id="qc-attachments"
          title="Attachments"
          :icon="IconPaperclip"
          optional
          collapsible
          :defaultOpen="false"
        >
          <template #actions>
            <BaseButton variant="outline" size="sm" :disabled="uploading" @click="onPickFiles">
              <IconPaperclip :size="16" class="tw:mr-1" />
              {{ uploading ? 'Uploading…' : 'Add files' }}
            </BaseButton>
            <input ref="fileInputRef" type="file" multiple class="tw:hidden" @change="onFilesSelected" />
          </template>
          <div v-if="pendingAssets.length" class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="asset in pendingAssets"
              :key="asset.id"
              class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
            >
              <span class="tw:text-sm tw:font-medium tw:truncate">
                {{ asset.originalFilename || asset.filename }}
              </span>
              <button class="tw:text-secondary tw:hover:text-red-600" @click="removePendingAsset(asset.id)">
                <IconX :size="16" />
              </button>
            </div>
          </div>
          <div v-else class="tw:text-sm tw:text-secondary tw:italic">No files attached yet.</div>
        </FormSection>
      </BaseForm>
    </div>
  </BasePage>
</template>
