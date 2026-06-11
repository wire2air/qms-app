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
    <div class="tw:p-4 tw:space-y-4">
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-3">
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Name <span class="tw:text-bad">*</span></label>
          <BaseTextInput v-model="form.name" placeholder="e.g. Bulk FG AQL plan" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection point</label>
          <BaseInlineSelect v-model="form.inspectionPoint" :items="POINTS" :required="true" />
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Scope</label>
          <div class="tw:flex tw:gap-2">
            <BaseInlineSelect
              v-model="form.scope"
              :items="[{ id: 'product', name: 'Product' }, { id: 'productType', name: 'Product type' }]"
              :required="true"
              class="tw:w-36"
            />
            <ProductSelectMenu v-if="form.scope === 'product'" v-model="form.productId" class="tw:flex-1" />
            <ProductTypeSelectMenu v-else v-model="form.productTypeId" class="tw:flex-1" />
          </div>
        </div>
        <div>
          <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">Inspection level</label>
          <BaseInlineSelect v-model="form.inspectionLevel" :items="LEVELS" :required="true" />
        </div>
      </div>

      <div>
        <label class="tw:block tw:text-sm tw:font-medium tw:mb-1">AQL standard <span class="tw:text-bad">*</span></label>
        <BaseInlineSelect v-model="form.standardCode" :items="standardItems" :required="true" placeholder="Select standard…" class="tw:w-full" />
      </div>

      <div>
        <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
          <label class="tw:text-sm tw:font-semibold">Severity → AQL</label>
          <BaseButton variant="secondary" size="sm" @click="addAql"><IconPlus :size="14" /> Add</BaseButton>
        </div>
        <div v-for="(row, i) in form.severityAqls" :key="i" class="tw:flex tw:items-center tw:gap-2 tw:mb-2">
          <BaseInlineSelect v-model="row.severity" :items="SEVERITIES" :required="true" class="tw:w-40" />
          <BaseTextInput v-model.number="row.aql" type="number" placeholder="AQL %" size="sm" class="tw:w-28" />
          <button type="button" class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer" @click="removeAql(i)">
            <IconTrash :size="14" />
          </button>
        </div>
      </div>

      <!-- Live preview -->
      <div class="tw:bg-main-hover tw:rounded-lg tw:p-3">
        <div class="tw:flex tw:items-end tw:gap-2">
          <div>
            <label class="tw:block tw:text-xs tw:text-secondary tw:mb-1">Preview lot size</label>
            <BaseTextInput v-model.number="form.previewLotSize" type="number" size="sm" class="tw:w-32" />
          </div>
          <BaseButton variant="outline" size="sm" :loading="previewing" :disabled="!form.standardCode" @click="runPreview">
            Preview
          </BaseButton>
        </div>
        <div v-if="preview" class="tw:mt-2 tw:text-sm">
          <div class="tw:font-medium tw:text-on-main">Code letter {{ preview.codeLetter }} · sample size {{ preview.sampleSize }}</div>
          <div v-for="s in preview.perSeverity" :key="s.severity + s.aql" class="tw:text-xs tw:text-secondary">
            {{ s.severity }} @ AQL {{ s.aql }} → accept {{ s.accept }}, reject {{ s.reject }}
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
