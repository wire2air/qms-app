<script setup>
/**
 * Create or edit a STANDARD sampling plan: standard (global or custom clone) +
 * inspection level + severity→AQL rows, with a live preview of the resulting
 * sample size / accept-reject. Aggregate write through the qcInspection REST
 * service. Pass `editPlan` to pre-populate and PATCH instead of POST.
 */
import { IconPlus, IconTrash, IconHelpCircle } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { required, requiredWhen } from '@shared/components/form/validators.js'
import { aqlSelectOptions, AQL_PAIRING_SUMMARY, defaultCustomPlanTable } from '@/utils/aqlGuidance.js'

const props = defineProps({
  editPlan: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)
const saveError = ref(null)
const formRef = ref(null)
const preview = ref(null)
const previewing = ref(false)
// Table 1 (lot size × inspection level → code letter) explainer dialog.
const showCodeLetterTable = ref(false)
// √N + 1 example calculator (FORMULA plan type).
const formulaExampleN = ref(25)
const formulaExampleSize = computed(() => {
  const n = Number(formulaExampleN.value)
  return Number.isInteger(n) && n >= 1 ? Math.ceil(Math.sqrt(n)) + 1 : null
})

const isEdit = computed(() => Boolean(props.editPlan))

// Registry-authored help copy (resource/js/shared/data/tooltips.js).
const { getFromTooltipData } = useTooltipData()
const aqlHelp = getFromTooltipData('qc.aql', 'tooltip')
const switchingHelp = getFromTooltipData('qc.switchingState', 'tooltip')

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]
// Value is the canonical id (underscore) used by the backend + the
// sample_size_code_letters reference table; the label shows the standard S-n
// notation. Special levels are S_1..S_4, general levels I/II/III.
const LEVELS = [
  { id: 'S_1', name: 'S-1' },
  { id: 'S_2', name: 'S-2' },
  { id: 'S_3', name: 'S-3' },
  { id: 'S_4', name: 'S-4' },
  { id: 'I', name: 'I' },
  { id: 'II', name: 'II' },
  { id: 'III', name: 'III' },
]
// Defect classes — one AQL each (Z1.4 convention: Critical tight, Minor loose).
const DEFECT_CLASSES = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]
// Z1.4 switching state — selects which accept/reject table is used.
const SWITCHING_STATES = ['NORMAL', 'TIGHTENED', 'REDUCED'].map((id) => ({ id, name: id }))
// AQL % columns that exist in the seeded Z1.4 tables — picking an unseeded
// value (e.g. 0.065) fails to resolve a plan cell, so offer only these. Each
// option carries the conventional defect-class pairing so pickers read like
// the guidance ("tight AQL ↔ serious defects").
const AQL_OPTIONS = aqlSelectOptions()

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), {
  models: ['SamplingStandard'],
  initial: [],
})
const standardItems = computed(() =>
  standards.value.map((s) => ({ id: s.id, name: s.companyId ? `${s.name} (custom)` : s.name })),
)

const form = ref(null)

function seedFromPlan(plan) {
  return {
    name: plan.name ?? '',
    planType: plan.planType ?? 'STANDARD',
    formula: plan.formula ?? 'SQRT_N_PLUS_1',
    customTable: Array.isArray(plan.customPlanTable?.rows)
      ? {
          sampleSize: plan.customPlanTable.sampleSize ?? null,
          rows: plan.customPlanTable.rows.map((r) => ({ ...r })),
        }
      : defaultCustomPlanTable(),
    scope: plan.productId ? 'product' : plan.productFamilyId ? 'family' : 'productType',
    productId: plan.productId ?? null,
    productFamilyId: plan.productFamilyId ?? null,
    productTypeId: plan.productTypeId ?? null,
    inspectionPoint: plan.inspectionPoint ?? 'INCOMING',
    standardCode: plan.standardCode ?? null,
    inspectionLevel: plan.inspectionLevel ?? 'II',
    switchingState: plan.switchingState ?? 'NORMAL',
    severityAqls:
      Array.isArray(plan.severityAqls) && plan.severityAqls.length
        ? plan.severityAqls.map((r) => ({ severity: r.severity, aql: r.aql }))
        : [
            { severity: 'CRITICAL', aql: 0.4 },
            { severity: 'MAJOR', aql: 1.0 },
            { severity: 'MINOR', aql: 2.5 },
          ],
    perCollectionSize: plan.perCollectionSize ?? null,
    collectionIntervalMinutes: plan.collectionIntervalMinutes ?? null,
    previewLotSize: 1000,
  }
}

function reset() {
  form.value = props.editPlan
    ? seedFromPlan(props.editPlan)
    : {
        name: '',
        planType: 'STANDARD',
        customTable: defaultCustomPlanTable(),
        formula: 'SQRT_N_PLUS_1',
        scope: 'product',
        productId: null,
        productFamilyId: null,
        productTypeId: null,
        inspectionPoint: 'INCOMING',
        standardCode: null,
        inspectionLevel: 'II',
        switchingState: 'NORMAL',
        severityAqls: [
          { severity: 'CRITICAL', aql: 0.4 },
          { severity: 'MAJOR', aql: 1.0 },
          { severity: 'MINOR', aql: 2.5 },
        ],
        perCollectionSize: null,
        collectionIntervalMinutes: null,
        previewLotSize: 1000,
      }
  preview.value = null
}
reset()
watch(show, (v) => {
  if (v) reset()
  if (!v) saveError.value = null
})
watch(
  () => props.editPlan,
  (plan) => {
    if (show.value && plan) reset()
  },
)

function addAql() {
  form.value.severityAqls.push({ severity: 'MAJOR', aql: 1.0 })
}
function removeAql(i) {
  form.value.severityAqls.splice(i, 1)
}

async function runPreview() {
  if (!form.value.standardCode || previewing.value) return
  previewing.value = true
  try {
    preview.value = await post('/v1/services/qcInspection/samplingPlans/preview', {
      standardCode: form.value.standardCode,
      inspectionLevel: form.value.inspectionLevel,
      switchingState: form.value.switchingState || 'NORMAL',
      lotSize: Number(form.value.previewLotSize) || 0,
      severityAqls: form.value.severityAqls,
    })
  } catch (err) {
    toast.error(err?.message || 'Preview failed')
  } finally {
    previewing.value = false
  }
}

async function onSubmit() {
  if (saving.value) return
  saving.value = true
  saveError.value = null
  try {
    const f = form.value
    const body = {
      name: f.name.trim(),
      productId: f.scope === 'product' ? f.productId : null,
      productFamilyId: f.scope === 'family' ? f.productFamilyId : null,
      productTypeId: f.scope === 'productType' ? f.productTypeId : null,
      inspectionPoint: f.inspectionPoint,
      planType: f.planType,
      // In-process advisory guidance (only meaningful for IN_PROCESS plans).
      perCollectionSize: f.inspectionPoint === 'IN_PROCESS' ? f.perCollectionSize || null : null,
      collectionIntervalMinutes:
        f.inspectionPoint === 'IN_PROCESS' ? f.collectionIntervalMinutes || null : null,
      ...(f.planType === 'CUSTOM'
        ? { customPlanTable: f.customTable }
        : f.planType === 'FORMULA'
          ? { formula: f.formula || 'SQRT_N_PLUS_1' }
          : {
              standardCode: f.standardCode,
              inspectionLevel: f.inspectionLevel,
              switchingState: f.switchingState,
              severityAqls: f.severityAqls,
            }),
    }
    if (isEdit.value) {
      const { plan } = await patch(
        `/v1/services/qcInspection/samplingPlans/${props.editPlan.id}`,
        body,
      )
      toast.success('Sampling plan updated')
      show.value = false
      emit('updated', plan.id)
    } else {
      const { plan } = await post('/v1/services/qcInspection/samplingPlans', body)
      toast.success('Sampling plan created (draft)')
      show.value = false
      emit('created', plan.id)
    }
  } catch (err) {
    saveError.value =
      err?.message ||
      (isEdit.value ? 'Failed to update sampling plan' : 'Failed to create sampling plan')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
  <BaseDialog
    v-model="show"
    :title="isEdit ? 'Edit Sampling Plan' : 'New Sampling Plan'"
    :persistent="true"
    size="3xl"
  >
    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-5">
        <!-- ── Basic info ───────────────────────────────────────────────── -->
        <div class="tw:flex tw:flex-col tw:gap-3">
          <BaseField label="Plan name" required :value="form.name" :rules="[required()]">
            <template #default="field">
              <BaseTextInput
                v-bind="field"
                v-model="form.name"
                placeholder="e.g. Finished Goods AQL 2.5"
              />
            </template>
          </BaseField>
          <BaseField label="Inspection point">
            <SegmentedControl
              v-model="form.inspectionPoint"
              :options="POINTS"
              optionLabel="name"
              optionValue="id"
            />
          </BaseField>

          <!-- In-process (IPQC) collection guidance — advisory; samples are pulled
               off the line across the shift. Pre-fills the lot's Collect action. -->
          <div
            v-if="form.inspectionPoint === 'IN_PROCESS'"
            class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:p-3"
          >
            <div class="tw:sm:col-span-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary">
              In-process collection (guidance)
            </div>
            <BaseField label="Samples per collection" hint="Suggested units per window; pre-fills the inspector's Collect action.">
              <BaseTextInput v-model.number="form.perCollectionSize" type="number" min="1" placeholder="e.g. 5" />
            </BaseField>
            <BaseField label="Collection interval (min)" hint="Suggested frequency, e.g. 120 = every 2 hours. Advisory only.">
              <BaseTextInput v-model.number="form.collectionIntervalMinutes" type="number" min="1" placeholder="e.g. 120" />
            </BaseField>
          </div>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Scope">
              <SegmentedControl
                v-model="form.scope"
                :options="[
                  { label: 'Specific item', value: 'product' },
                  { label: 'Item group', value: 'family' },
                  { label: 'Item type', value: 'productType' },
                ]"
              />
            </BaseField>
            <BaseField label="Plan type">
              <SegmentedControl
                v-model="form.planType"
                :options="[
                  { label: 'AQL standard', value: 'STANDARD' },
                  { label: 'Custom table', value: 'CUSTOM' },
                  { label: '√N + 1', value: 'FORMULA' },
                ]"
              />
            </BaseField>
          </div>
          <BaseField
            required
            :value="
              form.scope === 'product'
                ? form.productId
                : form.scope === 'family'
                  ? form.productFamilyId
                  : form.productTypeId
            "
            :rules="[
              requiredWhen(() => form.scope === 'product'),
              requiredWhen(() => form.scope === 'family'),
              requiredWhen(() => form.scope === 'productType'),
            ]"
          >
            <template #label>
              {{ form.scope === 'product' ? 'Item' : form.scope === 'family' ? 'Item group' : 'Item type' }}
            </template>
            <template #default="field">
              <ProductSelectMenu
                v-if="form.scope === 'product'"
                v-bind="field"
                v-model="form.productId"
                class="tw:w-full"
              />
              <ProductFamilySelectMenu
                v-else-if="form.scope === 'family'"
                v-bind="field"
                v-model="form.productFamilyId"
                :required="true"
                class="tw:w-full"
              />
              <ProductTypeSelectMenu
                v-else
                v-bind="field"
                v-model="form.productTypeId"
                class="tw:w-full"
              />
            </template>
          </BaseField>
        </div>

        <hr class="tw:border-divider" />

        <!-- ── FORMULA (√N + 1) — raw-material container sampling ────────── -->
        <div v-if="form.planType === 'FORMULA'" class="tw:flex tw:flex-col tw:gap-3">
          <BaseText variant="overline">Raw-material sampling — √N + 1</BaseText>
          <p class="tw:text-xs tw:text-secondary">
            The sample size comes from the <strong>container count</strong>, not the unit
            quantity: for N containers received (drums, bags, boxes), open
            <strong>⌈√N⌉ + 1</strong> of them for identity / assay testing. AQL and defect-class
            accept/reject numbers do not apply — acceptance is the specification's lab tests,
            captured per sample or as a composite depending on the spec's capture mode. The
            container count (N) is entered on each inspection.
          </p>
          <div class="tw:flex tw:items-end tw:gap-3">
            <BaseField label="Example — containers (N)" class="tw:w-44">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model.number="formulaExampleN"
                  type="number"
                  min="1"
                  size="sm"
                  placeholder="e.g. 25"
                />
              </template>
            </BaseField>
            <p v-if="formulaExampleSize" class="tw:text-sm tw:text-on-main tw:pb-2">
              → sample <span class="tw:font-semibold">{{ formulaExampleSize }}</span> containers
            </p>
          </div>
        </div>

        <!-- ── CUSTOM plan table — fixed (sampleSize, accept, reject) per
             defect class, no AQL standard lookup. Shared rows editor
             (also used by the lot-reopen custom-table override). ──────────── -->
        <div v-if="form.planType === 'CUSTOM'" class="tw:flex tw:flex-col tw:gap-3">
          <BaseText variant="overline">Custom plan table</BaseText>
          <BaseField
            :value="form.customTable.rows"
            :rules="[
              requiredWhen(() => form.planType === 'CUSTOM', 'Add at least one sampling row.'),
            ]"
          >
            <CustomPlanTableFields v-model="form.customTable" />
          </BaseField>
        </div>

        <!-- ── Sampling configuration (STANDARD) ─────────────────────────── -->
        <div v-if="form.planType === 'STANDARD'" class="tw:flex tw:flex-col tw:gap-3">
          <BaseText variant="overline">Sampling configuration</BaseText>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField
              label="AQL standard"
              required
              :value="form.standardCode"
              :rules="[requiredWhen(() => form.planType === 'STANDARD')]"
            >
              <template #default="field">
                <BaseInlineSelect
                  v-bind="field"
                  v-model="form.standardCode"
                  :items="standardItems"
                  :required="true"
                  placeholder="Select standard…"
                  class="tw:w-full"
                />
              </template>
            </BaseField>
            <BaseField label="Inspection level">
              <template #label>
                <span class="tw:inline-flex tw:items-center tw:gap-1">
                  Inspection level
                  <button
                    type="button"
                    class="tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:inline-flex"
                    title="How inspection level picks a code letter (Table 1)"
                    aria-label="How inspection level picks a code letter"
                    @click="showCodeLetterTable = true"
                  >
                    <IconHelpCircle :size="14" />
                  </button>
                </span>
              </template>
              <BaseInlineSelect
                v-model="form.inspectionLevel"
                :items="LEVELS"
                :required="true"
                class="tw:w-full"
              />
            </BaseField>
            <BaseField label="Switching state" :help="switchingHelp">
              <BaseInlineSelect
                v-model="form.switchingState"
                :items="SWITCHING_STATES"
                :required="true"
                class="tw:w-full"
              />
            </BaseField>
          </div>

          <div>
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
              <label class="tw:text-sm tw:font-medium">Defect class → AQL %</label>
              <BaseButton variant="text-link" size="sm" @click="addAql">
                <IconPlus :size="14" /> Add class
              </BaseButton>
            </div>
            <p class="tw:text-caption tw:text-secondary tw:mb-2">
              One AQL per defect class — the accept/reject limits attributes inspection checks the
              defect tally against. {{ AQL_PAIRING_SUMMARY }}
            </p>
            <BaseField
              :value="form.severityAqls"
              :rules="[
                requiredWhen(() => form.planType === 'STANDARD', 'Add at least one defect class.'),
              ]"
            >
              <div class="tw:flex tw:flex-col tw:gap-2">
                <div
                  v-for="(row, i) in form.severityAqls"
                  :key="i"
                  class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider"
                >
                  <BaseField label="Defect class" class="tw:flex-1">
                    <BaseInlineSelect
                      v-model="row.severity"
                      :items="DEFECT_CLASSES"
                      :required="true"
                      class="tw:w-full"
                    />
                  </BaseField>
                  <BaseField label="AQL %" :help="aqlHelp" class="tw:w-36">
                    <BaseInlineSelect
                      v-model="row.aql"
                      :items="AQL_OPTIONS"
                      :required="true"
                      class="tw:w-full"
                    />
                  </BaseField>
                  <button
                    type="button"
                    class="tw:p-1.5 tw:mt-4 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                    @click="removeAql(i)"
                  >
                    <IconTrash :size="16" />
                  </button>
                </div>
              </div>
            </BaseField>
          </div>
        </div>

        <hr v-if="form.planType === 'STANDARD'" class="tw:border-divider" />

        <!-- ── Live preview (STANDARD only — custom tables ARE the plan) ──── -->
        <div v-if="form.planType === 'STANDARD'">
          <BaseText variant="overline" class="tw:block tw:mb-3">Sample-size preview</BaseText>
          <div class="tw:flex tw:items-end tw:gap-3">
            <BaseField label="Lot size" class="tw:w-40">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model.number="form.previewLotSize"
                  type="number"
                  size="sm"
                  placeholder="e.g. 1000"
                />
              </template>
            </BaseField>
            <BaseButton
              variant="outline"
              size="sm"
              :loading="previewing"
              :disabled="!form.standardCode || !form.inspectionLevel"
              @click="runPreview"
            >
              Preview
            </BaseButton>
          </div>
          <div
            v-if="preview"
            class="tw:mt-3 tw:p-3 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:flex tw:flex-col tw:gap-1"
          >
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">
              Code letter <span class="">{{ preview.codeLetter }}</span> · Sample size
              <span class="">{{ preview.sampleSize }}</span>
            </div>
            <div
              v-for="s in preview.perSeverity"
              :key="s.severity + s.aql"
              class="tw:text-xs tw:text-secondary"
            >
              {{ s.severity }} — AQL {{ s.aql }}% → accept ≤ {{ s.accept }}, reject ≥ {{ s.reject }}
            </div>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isEdit ? 'Save changes' : 'Create draft'"
        :loading="saving"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>

  <!-- Table 1 explainer — reads the seeded code-letter grid for the chosen
       standard and highlights the current level + preview lot size. -->
  <BaseDialog v-model="showCodeLetterTable" title="Sample-size code letters (Table 1)" size="3xl">
    <div class="tw:p-5">
      <SampleSizeCodeLetterTable
        :standardCode="form.standardCode"
        :highlightLevel="form.inspectionLevel"
        :lotSize="Number(form.previewLotSize) || null"
      />
    </div>
  </BaseDialog>
  </div>
</template>
