<script setup>
/**
 * Create or edit an inspection lot. The Specification + Sampling Plan are
 * RESOLVED from the selected Product + Inspection point, narrow -> broad
 * (Item -> Item Group -> Item Type): EFFECTIVE specs, ACTIVE sampling plans.
 *   0 matches -> hard error, the lot can't proceed.
 *   1 match   -> shown read-only.
 *   >1 match  -> the inspector picks one from the matched candidates.
 * Disposition notifications live on the inspection plan only; the instrument is
 * chosen per test in the spec — neither is set here.
 */
import { DateTime } from 'luxon'
import { IconPaperclip, IconTrash, IconFile } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { uploadFile } from '@/utils/uploadService.js'
import { required } from '@shared/components/form/validators.js'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  editLot: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const formRef = ref(null)
const saving = ref(false)
const saveError = ref(null)

const isEdit = computed(() => Boolean(props.editLot))
// IN_PROGRESS edits can only touch logistics — the spec snapshot is frozen.
const identityLocked = computed(
  () => isEdit.value && props.editLot.statusId !== 'PENDING' && props.editLot.statusId !== 'DRAFT',
)

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]

const form = ref(null)
function reset() {
  const lot = props.editLot
  form.value = lot
    ? {
        inspectionPoint: lot.inspectionPoint ?? 'INCOMING',
        productId: lot.productId ?? null,
        supplierId: lot.supplierId ?? null,
        specificationId: lot.specificationId ?? null,
        samplingPlanId: lot.samplingPlanId ?? null,
        quantity: lot.quantity ?? null,
        poNumber: lot.poNumber ?? '',
        receiptNumber: lot.receiptNumber ?? '',
        workOrder: lot.workOrder ?? '',
        batchNumber: lot.batchNumber ?? '',
        manufacturingDate: lot.manufacturingDate ?? null,
        expiryDate: lot.expiryDate ?? null,
        coaReceived: lot.coaReceived ?? null,
        coaAttachments: Array.isArray(lot.coaAttachments) ? [...lot.coaAttachments] : [],
        receivedDate: lot.receivedDate ?? null,
        lineId: lot.lineId ?? null,
        shiftId: lot.shiftId ?? null,
        operatorUserId: lot.operatorUserId ?? null,
        samplingTime: lot.samplingTime ?? null,
        notes: lot.notes ?? '',
      }
    : {
        inspectionPoint: 'INCOMING',
        productId: null,
        supplierId: null,
        specificationId: null,
        samplingPlanId: null,
        quantity: null,
        poNumber: '',
        receiptNumber: '',
        workOrder: '',
        batchNumber: '',
        manufacturingDate: null,
        expiryDate: null,
        // Incoming: default goods-receipt date to today.
        coaReceived: null,
        coaAttachments: [],
        receivedDate: DateTime.now(),
        // In-process: default operator to the logged-in user + sampling time to now.
        lineId: null,
        shiftId: null,
        operatorUserId: currentSession.value?.userId ?? null,
        samplingTime: null,
        notes: '',
      }
}
reset()
watch(show, (v) => {
  if (v) reset()
  else saveError.value = null
})

// ── Spec + Sampling resolution (client-side mirror of the backend resolvers) ──
const allSpecs = useLiveQuery((db) => db.Specification.where().exec(), {
  models: ['Specification'],
  initial: [],
})
const allSampling = useLiveQuery((db) => db.SamplingPlan.where().exec(), {
  models: ['SamplingPlan'],
  initial: [],
})
const selectedProduct = useLiveQueryWithDeps(
  [() => form.value?.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)

// Narrowest non-empty tier: Item -> Item Group -> Item Type.
function narrowestTier(rows, product) {
  if (!product) return { tier: null, candidates: [] }
  const byProduct = rows.filter((r) => r.productId && r.productId === product.id)
  if (byProduct.length) return { tier: 'Item', candidates: byProduct }
  const byFamily = rows.filter(
    (r) => !r.productId && r.productFamilyId && r.productFamilyId === product.productFamilyId,
  )
  if (byFamily.length) return { tier: 'Item Group', candidates: byFamily }
  const byType = rows.filter(
    (r) =>
      !r.productId && !r.productFamilyId && r.productTypeId && r.productTypeId === product.productTypeId,
  )
  if (byType.length) return { tier: 'Item Type', candidates: byType }
  return { tier: null, candidates: [] }
}

const specMatch = computed(() => {
  if (!form.value?.productId) return { tier: null, candidates: [] }
  const usable = (allSpecs.value || []).filter((s) => s.statusId === 'EFFECTIVE')
  return narrowestTier(usable, selectedProduct.value)
})
const samplingMatch = computed(() => {
  if (!form.value?.productId || !form.value?.inspectionPoint) return { tier: null, candidates: [] }
  const usable = (allSampling.value || []).filter(
    (s) => s.statusId === 'ACTIVE' && s.inspectionPoint === form.value.inspectionPoint,
  )
  return narrowestTier(usable, selectedProduct.value)
})

// Auto-select the single match; drop a stale selection when the candidate set changes.
watch(
  specMatch,
  (m) => {
    if (!form.value) return
    if (m.candidates.length === 1) form.value.specificationId = m.candidates[0].id
    else if (!m.candidates.some((c) => c.id === form.value.specificationId))
      form.value.specificationId = null
  },
  { immediate: true },
)
watch(
  samplingMatch,
  (m) => {
    if (!form.value) return
    if (m.candidates.length === 1) form.value.samplingPlanId = m.candidates[0].id
    else if (!m.candidates.some((c) => c.id === form.value.samplingPlanId))
      form.value.samplingPlanId = null
  },
  { immediate: true },
)

const specResolved = computed(() => Boolean(form.value?.specificationId))
const samplingResolved = computed(() => Boolean(form.value?.samplingPlanId))
// Can't proceed unless both a spec and a sampling plan are resolved (or frozen on edit).
const canProceed = computed(
  () => identityLocked.value || (specResolved.value && samplingResolved.value),
)

// COA upload — files go to the generic asset store immediately (works at create
// time too, before the lot exists); their refs ride in the create/patch payload.
const uploadingCoa = ref(false)
const coaInputRef = ref(null)
function pickCoa() {
  coaInputRef.value?.click()
}
async function onCoaSelected(e) {
  const files = [...(e.target.files ?? [])]
  e.target.value = ''
  if (!files.length || !form.value) return
  uploadingCoa.value = true
  try {
    for (const file of files) {
      const asset = await uploadFile(file, 'ASSET')
      form.value.coaAttachments.push({
        assetId: asset.id,
        name: asset.originalFilename || asset.filename,
        mimeType: asset.mimeType,
      })
    }
    form.value.coaReceived = true
  } catch (err) {
    toast.error(err?.message || 'Failed to upload COA')
  } finally {
    uploadingCoa.value = false
  }
}
function removeCoa(assetId) {
  if (!form.value) return
  form.value.coaAttachments = form.value.coaAttachments.filter((a) => a.assetId !== assetId)
}

async function onSave() {
  if (saving.value) return
  if (!canProceed.value) {
    toast.error('A matching specification and sampling plan are required before the lot can proceed.')
    return
  }
  saving.value = true
  saveError.value = null
  try {
    const f = form.value
    const refFields = {
      poNumber: f.poNumber?.trim() || null,
      receiptNumber: f.receiptNumber?.trim() || null,
      workOrder: f.workOrder?.trim() || null,
      batchNumber: f.batchNumber?.trim() || null,
      manufacturingDate: f.manufacturingDate || null,
      expiryDate: f.expiryDate || null,
      // Point-specific — sent for all points (nullable, benign); the form only
      // surfaces the relevant ones per inspection point.
      coaReceived: f.coaReceived ?? null,
      coaAttachments: Array.isArray(f.coaAttachments) ? f.coaAttachments : [],
      receivedDate: f.receivedDate || null,
      lineId: f.lineId || null,
      shiftId: f.shiftId || null,
      operatorUserId: f.operatorUserId || null,
      samplingTime: f.samplingTime || null,
      notes: f.notes?.trim() || null,
    }
    if (isEdit.value) {
      const body = identityLocked.value
        ? refFields
        : {
            ...refFields,
            inspectionPoint: f.inspectionPoint,
            productId: f.productId,
            supplierId: f.supplierId || null,
            specificationId: f.specificationId || null,
            samplingPlanId: f.samplingPlanId || null,
            quantity: f.quantity ?? null,
          }
      const { lot } = await patch(`/v1/services/qcInspection/lots/${props.editLot.id}`, body)
      toast.success(`Lot ${lot.lotNumber} updated`)
      show.value = false
      emit('updated', lot.id)
    } else {
      const { lot } = await post('/v1/services/qcInspection/lots', {
        ...refFields,
        inspectionPoint: f.inspectionPoint,
        productId: f.productId,
        supplierId: f.supplierId || null,
        specificationId: f.specificationId || null,
        samplingPlanId: f.samplingPlanId || null,
        quantity: f.quantity ?? null,
      })
      toast.success(`Lot ${lot.lotNumber} created`)
      show.value = false
      emit('created', lot.id)
    }
  } catch (err) {
    saveError.value =
      err?.message || (isEdit.value ? 'Failed to update lot' : 'Failed to create lot')
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="show"
    :title="isEdit ? `Edit Inspection ${props.editLot?.lotNumber ?? ''}` : 'New Inspection'"
    :persistent="true"
    size="3xl"
  >
    <BaseForm ref="formRef" hideFooter @submit="onSave">
      <div class="tw:p-4 tw:space-y-4">
        <div
          v-if="identityLocked"
          class="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-lg tw:px-3 tw:py-2 tw:text-xs tw:text-blue-800"
        >
          Inspection has started — product, point, quantity and spec/sampling are frozen. Logistics
          fields remain editable.
        </div>

        <BaseField
          label="Inspection point"
          required
          :value="form.inspectionPoint"
          :rules="[required()]"
        >
          <SegmentedControl
            v-model="form.inspectionPoint"
            :options="POINTS"
            optionLabel="name"
            optionValue="id"
            :disabled="identityLocked"
          />
        </BaseField>

        <!-- Product on its own row — the select shows SKU + name and needs the width. -->
        <BaseField label="Product" required :value="form.productId" :rules="[required()]">
          <ProductSelectMenu
            v-model="form.productId"
            class="tw:w-full"
            :disabled="identityLocked"
            nullLabel="— Select Product —"
          />
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
          <BaseField label="Supplier">
            <SupplierSelectMenu v-model="form.supplierId" :disabled="identityLocked" />
          </BaseField>
          <BaseField
            label="Lot quantity"
            :required="form.inspectionPoint !== 'IN_PROCESS'"
            :value="form.quantity"
            :rules="form.inspectionPoint !== 'IN_PROCESS' ? [required()] : []"
          >
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model.number="form.quantity"
                type="number"
                :placeholder="form.inspectionPoint === 'IN_PROCESS' ? 'optional' : 'for sample-size calc'"
                :disabled="identityLocked"
              />
            </template>
          </BaseField>
          <BaseField
            :label="form.inspectionPoint === 'IN_PROCESS' ? 'Production lot (Lot#)' : 'Batch / Lot ref'"
            :required="form.inspectionPoint !== 'IN_PROCESS'"
            :value="form.batchNumber"
            :rules="form.inspectionPoint !== 'IN_PROCESS' ? [required()] : []"
            :hint="
              form.inspectionPoint === 'IN_PROCESS'
                ? 'Becomes the first production lot. Leave blank to add lots on check-in.'
                : ''
            "
          >
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.batchNumber"
                :placeholder="form.inspectionPoint === 'IN_PROCESS' ? 'optional' : 'required'"
              />
            </template>
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="PO #">
            <BaseTextInput :id="fieldId" v-model="form.poNumber" placeholder="optional" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Receipt #">
            <BaseTextInput :id="fieldId" v-model="form.receiptNumber" placeholder="optional" />
          </BaseField>
          <BaseField label="Work order" required :value="form.workOrder" :rules="[required()]">
            <template #default="field">
              <BaseTextInput v-bind="field" v-model="form.workOrder" placeholder="required" />
            </template>
          </BaseField>
          <BaseField label="Manufacturing date">
            <BaseDateField v-model="form.manufacturingDate" mode="date" />
          </BaseField>
          <BaseField label="Expiry date">
            <BaseDateField v-model="form.expiryDate" mode="date" />
          </BaseField>
        </div>

        <!-- Incoming (IQC): supplier COA + goods-receipt date. -->
        <div
          v-if="form.inspectionPoint === 'INCOMING'"
          class="tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:p-3"
        >
          <div class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
            Incoming (IQC)
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseField label="Goods-receipt date" hint="Date the goods were actually received.">
              <BaseDateField v-model="form.receivedDate" mode="date" />
            </BaseField>
            <BaseField label="Certificate of Analysis">
              <BaseCheckbox v-model="form.coaReceived">COA received</BaseCheckbox>
            </BaseField>
          </div>

          <!-- COA document(s) — uploaded to the asset store immediately; refs ride in the payload. -->
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div class="tw:flex tw:items-center tw:justify-between">
              <span class="tw:text-xs tw:font-medium tw:text-secondary">COA document(s)</span>
              <BaseButton variant="outline" size="sm" :disabled="uploadingCoa" @click="pickCoa">
                <IconPaperclip :size="14" class="tw:mr-1" />
                {{ uploadingCoa ? 'Uploading…' : 'Attach COA' }}
              </BaseButton>
              <input
                ref="coaInputRef"
                type="file"
                multiple
                accept=".pdf,image/*"
                class="tw:hidden"
                @change="onCoaSelected"
              />
            </div>
            <div
              v-for="att in form.coaAttachments"
              :key="att.assetId"
              class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5"
            >
              <span class="tw:flex tw:items-center tw:gap-2 tw:min-w-0 tw:text-sm tw:text-on-main">
                <IconFile :size="16" class="tw:shrink-0 tw:text-secondary" />
                <span class="tw:truncate">{{ att.name || 'COA document' }}</span>
              </span>
              <button
                class="tw:text-secondary tw:hover:text-red-600 tw:shrink-0 tw:ml-2"
                @click="removeCoa(att.assetId)"
              >
                <IconTrash :size="16" />
              </button>
            </div>
          </div>
        </div>

        <!-- In-process (IPQC): line/stage, shift, operator, sampling clock time. -->
        <div
          v-if="form.inspectionPoint === 'IN_PROCESS'"
          class="tw:flex tw:flex-col tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:p-3"
        >
          <div class="tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
            In-process (IPQC)
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseField label="Production line" required :value="form.lineId" :rules="[required()]">
              <ProductionLineSelectMenu v-model="form.lineId" :required="true" />
            </BaseField>
            <BaseField label="Shift">
              <ShiftSelectMenu v-model="form.shiftId" />
            </BaseField>
            <BaseField label="Operator">
              <UserSelectMenu v-model="form.operatorUserId" />
            </BaseField>
          </div>
        </div>

        <BaseField v-slot="{ id: fieldId }" label="Notes">
          <BaseTextarea :id="fieldId" v-model="form.notes" :rows="2" placeholder="optional" />
        </BaseField>

        <!-- Specification + Sampling Plan: RESOLVED from product + point (narrow ->
             broad). Read-only when one matches; a picker when several; a hard
             error (and blocked submit) when none. -->
        <div
          class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden"
          :class="identityLocked ? 'tw:opacity-60 tw:pointer-events-none' : ''"
        >
          <div class="tw:px-4 tw:py-2.5 tw:bg-main-hover tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-sm tw:font-medium tw:text-on-main"
              >Specification &amp; Sampling Plan</span
            >
            <span class="tw:text-xs tw:text-secondary"
              >— matched from the selected item &amp; inspection point</span
            >
          </div>
          <div class="tw:p-3 tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <!-- Specification -->
            <div>
              <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Specification</p>
              <template v-if="!form.productId">
                <p class="tw:text-sm tw:text-secondary">Select a product to match a specification.</p>
              </template>
              <template v-else-if="specMatch.candidates.length === 1">
                <p class="tw:text-sm tw:text-on-main">
                  {{ specMatch.candidates[0].name }}
                  <span class="tw:text-xs tw:text-secondary">· matched by {{ specMatch.tier }}</span>
                </p>
              </template>
              <template v-else-if="specMatch.candidates.length > 1">
                <BaseSelect
                  v-model="form.specificationId"
                  :options="specMatch.candidates"
                  optionLabel="name"
                  optionValue="id"
                  :required="true"
                  placeholder="Several match — pick one"
                />
                <p class="tw:text-xs tw:text-secondary tw:mt-1">
                  {{ specMatch.candidates.length }} match by {{ specMatch.tier }} — select one.
                </p>
              </template>
              <template v-else>
                <p class="tw:text-sm tw:text-bad tw:font-medium">
                  No effective specification matches this item — create &amp; approve one first.
                </p>
              </template>
            </div>

            <!-- Sampling Plan -->
            <div>
              <p class="tw:text-caption tw:uppercase tw:tracking-wider tw:font-semibold tw:text-secondary tw:mb-1">Sampling Plan</p>
              <template v-if="!form.productId">
                <p class="tw:text-sm tw:text-secondary">Select a product &amp; point to match a sampling plan.</p>
              </template>
              <template v-else-if="samplingMatch.candidates.length === 1">
                <p class="tw:text-sm tw:text-on-main">
                  {{ samplingMatch.candidates[0].name }}
                  <span class="tw:text-xs tw:text-secondary">· matched by {{ samplingMatch.tier }}</span>
                </p>
              </template>
              <template v-else-if="samplingMatch.candidates.length > 1">
                <BaseSelect
                  v-model="form.samplingPlanId"
                  :options="samplingMatch.candidates"
                  optionLabel="name"
                  optionValue="id"
                  :required="true"
                  placeholder="Several match — pick one"
                />
                <p class="tw:text-xs tw:text-secondary tw:mt-1">
                  {{ samplingMatch.candidates.length }} match by {{ samplingMatch.tier }} — select one.
                </p>
              </template>
              <template v-else>
                <p class="tw:text-sm tw:text-bad tw:font-medium">
                  No active sampling plan matches this item + inspection point — create &amp; approve one first.
                </p>
              </template>
            </div>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save changes' : 'Create'"
        :loading="saving"
        :disabled="!canProceed"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
