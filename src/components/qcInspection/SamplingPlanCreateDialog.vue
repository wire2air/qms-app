<script setup>
/**
 * Create a STANDARD sampling plan: standard (global or custom clone) + inspection
 * level + severity→AQL rows, with a live preview of the resulting sample size /
 * accept-reject. Aggregate write through the qcInspection REST service.
 */
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)
const preview = ref(null)
const previewing = ref(false)

const POINTS = [
  { id: 'INCOMING', name: 'Incoming (IQC)' },
  { id: 'IN_PROCESS', name: 'In-process (IPQC)' },
  { id: 'FINAL', name: 'Final (FQC)' },
  { id: 'OUTGOING', name: 'Outgoing (OQC)' },
]
const LEVELS = ['S-1', 'S-2', 'S-3', 'S-4', 'I', 'II', 'III'].map((id) => ({ id, name: id }))
const SEVERITIES = ['NORMAL', 'TIGHTENED', 'REDUCED'].map((id) => ({ id, name: id }))

const standards = useLiveQuery(async (db) => db.SamplingStandard.where().exec(), { initial: [] })
const standardItems = computed(() =>
  standards.value.map((s) => ({ id: s.id, name: s.companyId ? `${s.name} (custom)` : s.name })),
)

const form = ref(null)
function reset() {
  form.value = {
    name: '',
    scope: 'product',
    productId: null,
    productTypeId: null,
    inspectionPoint: 'INCOMING',
    standardCode: null,
    inspectionLevel: 'II',
    severityAqls: [{ severity: 'NORMAL', aql: 2.5 }],
    previewLotSize: 1000,
  }
  preview.value = null
}
reset()
watch(show, (v) => {
  if (v) reset()
})

function addAql() {
  form.value.severityAqls.push({ severity: 'NORMAL', aql: 1.0 })
}
function removeAql(i) {
  form.value.severityAqls.splice(i, 1)
}

const canSubmit = computed(() => {
  const f = form.value
  if (!f.name?.trim() || !f.standardCode || !f.inspectionLevel) return false
  if (f.scope === 'product' && !f.productId) return false
  if (f.scope === 'productType' && !f.productTypeId) return false
  return f.severityAqls.length > 0
})

async function runPreview() {
  if (!form.value.standardCode || previewing.value) return
  previewing.value = true
  try {
    preview.value = await post('/v1/services/qcInspection/samplingPlans/preview', {
      standardCode: form.value.standardCode,
      inspectionLevel: form.value.inspectionLevel,
      switchingState: 'NORMAL',
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
    const { plan } = await post('/v1/services/qcInspection/samplingPlans', {
      name: f.name.trim(),
      productId: f.scope === 'product' ? f.productId : null,
      productTypeId: f.scope === 'productType' ? f.productTypeId : null,
      inspectionPoint: f.inspectionPoint,
      planType: 'STANDARD',
      standardCode: f.standardCode,
      inspectionLevel: f.inspectionLevel,
      severityAqls: f.severityAqls,
    })
    toast.success('Sampling plan created (draft)')
    show.value = false
    emit('created', plan.id)
  } catch (err) {
    toast.error(err?.message || 'Failed to create sampling plan')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="New Sampling Plan" :persistent="true" size="3xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-5">

      <!-- ── Basic info ───────────────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Plan name <span class="tw:text-bad">*</span></label>
          <BaseTextInput v-model="form.name" placeholder="e.g. Finished Goods AQL 2.5" />
        </div>
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
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
        </div>
        <!-- Product / Product-type on its own row so SKU + name has space -->
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">
            {{ form.scope === 'product' ? 'Product' : 'Product type' }} <span class="tw:text-bad">*</span>
          </label>
          <ProductSelectMenu v-if="form.scope === 'product'" v-model="form.productId" class="tw:w-full" />
          <ProductTypeSelectMenu v-else v-model="form.productTypeId" class="tw:w-full" />
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- ── Sampling configuration ────────────────────────────────────── -->
      <div class="tw:flex tw:flex-col tw:gap-3">
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
        </div>

        <!-- Severity → AQL rows -->
        <div>
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
            <label class="tw:text-sm tw:font-medium">Severity → AQL %</label>
            <BaseButton variant="text-link" size="sm" @click="addAql">
              <IconPlus :size="14" /> Add severity
            </BaseButton>
          </div>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div v-for="(row, i) in form.severityAqls" :key="i"
              class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider"
            >
              <div class="tw:flex-1">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">Severity</label>
                <BaseInlineSelect v-model="row.severity" :items="SEVERITIES" :required="true" class="tw:w-full" />
              </div>
              <div class="tw:w-36">
                <label class="tw:block tw:text-[11px] tw:text-secondary tw:mb-1">AQL %</label>
                <BaseTextInput v-model.number="row.aql" type="number" placeholder="e.g. 2.5" size="sm" />
              </div>
              <button type="button"
                class="tw:p-1.5 tw:mt-4 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="removeAql(i)"
              >
                <IconTrash :size="16" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- ── Live preview ──────────────────────────────────────────────── -->
      <div>
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
      <BaseButton :disabled="!canSubmit || saving" :loading="saving" @click="onSave">Create draft</BaseButton>
    </div>
  </BaseDialog>
</template>
