<script setup>
/**
 * Create or edit a STANDARD sampling plan: standard (global or custom clone) +
 * inspection level + severity→AQL rows, with a live preview of the resulting
 * sample size / accept-reject. Aggregate write through the qcInspection REST
 * service. Pass `editPlan` to pre-populate and PATCH instead of POST.
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { post, patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  editPlan: { type: Object, default: null },
})
const emit = defineEmits(['created', 'updated'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)
const preview = ref(null)
const previewing = ref(false)

const isEdit = computed(() => Boolean(props.editPlan))

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]
const LEVELS = ['S-1', 'S-2', 'S-3', 'S-4', 'I', 'II', 'III'].map((id) => ({ id, name: id }))
// Defect classes — one AQL each (Z1.4 convention: Critical tight, Minor loose).
const DEFECT_CLASSES = [
  { id: 'CRITICAL', name: 'Critical' },
  { id: 'MAJOR', name: 'Major' },
  { id: 'MINOR', name: 'Minor' },
]
// Z1.4 switching state — selects which accept/reject table is used.
const SWITCHING_STATES = ['NORMAL', 'TIGHTENED', 'REDUCED'].map((id) => ({ id, name: id }))
// AQL % columns that exist in the seeded Z1.4 tables — picking an unseeded
// value (e.g. 0.065) fails to resolve a plan cell, so offer only these.
const AQL_OPTIONS = [0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5, 10, 15, 25].map((v) => ({
  id: v,
  name: `${v}%`,
}))

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), { initial: [] })
const standardItems = computed(() =>
  standards.value.map((s) => ({ id: s.id, name: s.companyId ? `${s.name} (custom)` : s.name })),
)

const form = ref(null)

function seedFromPlan(plan) {
  return {
    name: plan.name ?? '',
    planType: plan.planType ?? 'STANDARD',
    customRows: Array.isArray(plan.customPlanTable?.rows)
      ? plan.customPlanTable.rows.map((r) => ({ ...r }))
      : [{ severityLabel: 'NORMAL', sampleSize: 8, accept: 0, reject: 1 }],
    scope: plan.productId ? 'product' : 'productType',
    productId: plan.productId ?? null,
    productTypeId: plan.productTypeId ?? null,
    inspectionPoint: plan.inspectionPoint ?? 'INCOMING',
    standardCode: plan.standardCode ?? null,
    inspectionLevel: plan.inspectionLevel ?? 'II',
    switchingState: plan.switchingState ?? 'NORMAL',
    severityAqls: Array.isArray(plan.severityAqls) && plan.severityAqls.length
      ? plan.severityAqls.map((r) => ({ severity: r.severity, aql: r.aql }))
      : [
          { severity: 'CRITICAL', aql: 0.4 },
          { severity: 'MAJOR', aql: 1.0 },
          { severity: 'MINOR', aql: 2.5 },
        ],
    previewLotSize: 1000,
  }
}

function reset() {
  form.value = props.editPlan
    ? seedFromPlan(props.editPlan)
    : {
        name: '',
        planType: 'STANDARD',
        customRows: [{ severityLabel: 'NORMAL', sampleSize: 8, accept: 0, reject: 1 }],
        scope: 'product',
        productId: null,
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
        previewLotSize: 1000,
      }
  preview.value = null
}
reset()
watch(show, (v) => { if (v) reset() })
watch(() => props.editPlan, (plan) => { if (show.value && plan) reset() })

function addAql() {
  form.value.severityAqls.push({ severity: 'MAJOR', aql: 1.0 })
}
function addCustomRow() {
  form.value.customRows.push({ severityLabel: 'NORMAL', sampleSize: 8, accept: 0, reject: 1 })
}
function removeCustomRow(i) {
  form.value.customRows.splice(i, 1)
}
function removeAql(i) {
  form.value.severityAqls.splice(i, 1)
}

const canSubmit = computed(() => {
  const f = form.value
  if (!f.name?.trim()) return false
  if (f.scope === 'product' && !f.productId) return false
  if (f.scope === 'productType' && !f.productTypeId) return false
  if (f.planType === 'CUSTOM') {
    return (
      f.customRows.length > 0 &&
      f.customRows.every(
        (r) =>
          r.severityLabel?.trim() &&
          Number.isInteger(r.sampleSize) && r.sampleSize >= 1 &&
          Number.isInteger(r.accept) && r.accept >= 0 &&
          Number.isInteger(r.reject) && r.reject > r.accept,
      )
    )
  }
  return !!f.standardCode && !!f.inspectionLevel && f.severityAqls.length > 0
})

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

async function onSave() {
  if (!canSubmit.value || saving.value) return
  saving.value = true
  try {
    const f = form.value
    const body = {
      name: f.name.trim(),
      productId: f.scope === 'product' ? f.productId : null,
      productTypeId: f.scope === 'productType' ? f.productTypeId : null,
      inspectionPoint: f.inspectionPoint,
      planType: f.planType,
      ...(f.planType === 'CUSTOM'
        ? { customPlanTable: { rows: f.customRows } }
        : {
            standardCode: f.standardCode,
            inspectionLevel: f.inspectionLevel,
            switchingState: f.switchingState,
            severityAqls: f.severityAqls,
          }),
    }
    if (isEdit.value) {
      const { plan } = await patch(`/v1/services/qcInspection/samplingPlans/${props.editPlan.id}`, body)
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
    toast.error(err?.message || (isEdit.value ? 'Failed to update sampling plan' : 'Failed to create sampling plan'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="isEdit ? 'Edit Sampling Plan' : 'New Sampling Plan'" :persistent="true" size="3xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-5">

      <!-- ── Basic info ───────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Plan name <span class="tw:text-bad">*</span></label>
          <BaseTextInput v-model="form.name" placeholder="e.g. Finished Goods AQL 2.5" />
        </div>
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3">
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection point</label>
            <BaseInlineSelect v-model="form.inspectionPoint" :items="POINTS" :required="true" class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Scope</label>
            <BaseInlineSelect
              v-model="form.scope"
              :items="[{ id: 'product', name: 'Specific product' }, { id: 'productType', name: 'Product type' }]"
              :required="true"
              class="tw:w-full"
            />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Plan type</label>
            <BaseInlineSelect
              v-model="form.planType"
              :items="[
                { id: 'STANDARD', name: 'AQL standard' },
                { id: 'CUSTOM', name: 'Custom table' },
              ]"
              :required="true"
              class="tw:w-full"
            />
          </div>
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">
            {{ form.scope === 'product' ? 'Product' : 'Product type' }} <span class="tw:text-bad">*</span>
          </label>
          <ProductSelectMenu v-if="form.scope === 'product'" v-model="form.productId" class="tw:w-full" />
          <ProductTypeSelectMenu v-else v-model="form.productTypeId" class="tw:w-full" />
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- ── CUSTOM plan table — fixed (sampleSize, accept, reject) per
           severity, no AQL standard lookup. ─────────────────────────────── -->
      <div v-if="form.planType === 'CUSTOM'" class="tw:flex tw:flex-col tw:gap-3">
        <div class="tw:flex tw:items-center tw:justify-between">
          <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">Custom plan table</p>
          <BaseButton variant="text-link" size="sm" @click="addCustomRow">
            <IconPlus :size="14" /> Add row
          </BaseButton>
        </div>
        <p class="tw:text-xs tw:text-secondary tw:-mt-2">
          Each row sets the fixed sample size and accept/reject numbers for a severity. Reject must
          be greater than accept (e.g. accept 0 / reject 1 = any defect fails the lot).
        </p>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <div
            v-for="(row, i) in form.customRows"
            :key="i"
            class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider"
          >
            <div class="tw:flex-1">
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Severity label</label>
              <BaseTextInput v-model="row.severityLabel" size="sm" placeholder="e.g. NORMAL, CRITICAL" />
            </div>
            <div class="tw:w-28">
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Sample size</label>
              <BaseTextInput v-model.number="row.sampleSize" type="number" size="sm" />
            </div>
            <div class="tw:w-24">
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Accept ≤</label>
              <BaseTextInput v-model.number="row.accept" type="number" size="sm" />
            </div>
            <div class="tw:w-24">
              <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Reject ≥</label>
              <BaseTextInput v-model.number="row.reject" type="number" size="sm" />
            </div>
            <button
              type="button"
              class="tw:p-1.5 tw:mt-4 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
              @click="removeCustomRow(i)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </div>
      </div>

      <!-- ── Sampling configuration (STANDARD) ─────────────────────────── -->
      <div v-if="form.planType === 'STANDARD'" class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">Sampling configuration</p>
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">AQL standard <span class="tw:text-bad">*</span></label>
            <BaseInlineSelect v-model="form.standardCode" :items="standardItems" :required="true" placeholder="Select standard…" class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection level</label>
            <BaseInlineSelect v-model="form.inspectionLevel" :items="LEVELS" :required="true" class="tw:w-full" />
          </div>
          <div>
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Switching state</label>
            <BaseInlineSelect v-model="form.switchingState" :items="SWITCHING_STATES" :required="true" class="tw:w-full" />
          </div>
        </div>

        <div>
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
            <label class="tw:text-sm tw:font-medium">Defect class → AQL %</label>
            <BaseButton variant="text-link" size="sm" @click="addAql">
              <IconPlus :size="14" /> Add class
            </BaseButton>
          </div>
          <p class="tw:text-[11px] tw:text-secondary tw:mb-2">
            One AQL per defect class — the accept/reject limits attributes inspection checks the
            defect tally against. (Critical is usually tightest.)
          </p>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="(row, i) in form.severityAqls"
              :key="i"
              class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider"
            >
              <div class="tw:flex-1">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Defect class</label>
                <BaseInlineSelect v-model="row.severity" :items="DEFECT_CLASSES" :required="true" class="tw:w-full" />
              </div>
              <div class="tw:w-36">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">AQL %</label>
                <BaseInlineSelect v-model="row.aql" :items="AQL_OPTIONS" :required="true" class="tw:w-full" />
              </div>
              <button
                type="button"
                class="tw:p-1.5 tw:mt-4 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="removeAql(i)"
              >
                <IconTrash :size="16" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <hr v-if="form.planType === 'STANDARD'" class="tw:border-divider" />

      <!-- ── Live preview (STANDARD only — custom tables ARE the plan) ──── -->
      <div v-if="form.planType === 'STANDARD'">
        <p class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-3">Sample-size preview</p>
        <div class="tw:flex tw:items-end tw:gap-3">
          <div class="tw:w-40">
            <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Lot size</label>
            <BaseTextInput v-model.number="form.previewLotSize" type="number" size="sm" placeholder="e.g. 1000" />
          </div>
          <BaseButton variant="outline" size="sm" :loading="previewing" :disabled="!form.standardCode || !form.inspectionLevel" @click="runPreview">
            Preview
          </BaseButton>
        </div>
        <div v-if="preview" class="tw:mt-3 tw:p-3 tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:flex tw:flex-col tw:gap-1">
          <div class="tw:text-sm tw:font-semibold tw:text-on-main">
            Code letter <span class="tw:font-mono">{{ preview.codeLetter }}</span> · Sample size <span class="tw:font-mono">{{ preview.sampleSize }}</span>
          </div>
          <div v-for="s in preview.perSeverity" :key="s.severity + s.aql" class="tw:text-xs tw:text-secondary">
            {{ s.severity }} — AQL {{ s.aql }}% → accept ≤ {{ s.accept }}, reject ≥ {{ s.reject }}
          </div>
        </div>
      </div>

    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">
        {{ isEdit ? 'Save changes' : 'Create draft' }}
      </BaseButton>
    </div>
  </BaseDialog>
</template>
