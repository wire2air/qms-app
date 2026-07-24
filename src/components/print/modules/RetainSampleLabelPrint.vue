<script setup>
/**
 * Retain Sample LABEL — printable box label with QR deep link. Two stocks:
 *   ?size=a4  (default) — an A4 sheet of identical labels (?copies=N, default 8)
 *   ?size=4x2           — one 4in × 2in thermal label per page
 * Skips PrintLayout on purpose: labels want no A4 report chrome; the module
 * owns its own @page. Auto-fires window.print() once the data is loaded.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  id: { type: String, default: null },
  size: { type: String, default: 'a4' }, // 'a4' sheet | '4x2' thermal
  copies: { type: [String, Number], default: 8 },
})

const sample = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.RetainSample.findByPk(id) : null),
  { models: ['RetainSample'] },
)
const product = useLiveQueryWithDeps(
  [() => sample.value?.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)
const location = useLiveQueryWithDeps(
  [() => sample.value?.storageLocationId],
  async (db, [id]) => (id ? db.StorageLocation.findByPk(id) : null),
  { models: ['StorageLocation'] },
)
const uom = useLiveQueryWithDeps(
  [() => sample.value?.uomId],
  async (db, [id]) => (id ? db.Uom.findByPk(id) : null),
  { models: ['Uom'] },
)
const retainedBy = useLiveQueryWithDeps(
  [() => sample.value?.retainedById],
  async (db, [id]) => (id ? db.User.findByPk(id) : null),
  { models: ['User'] },
)
const retainedByName = computed(() =>
  retainedBy.value ? [retainedBy.value.firstName, retainedBy.value.lastName].filter(Boolean).join(' ') : '—',
)

const isThermal = computed(() => String(props.size).toLowerCase() === '4x2')
const copyCount = computed(() => {
  if (isThermal.value) return 1
  const n = Number(props.copies)
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 40) : 8
})

const qrValue = computed(() =>
  sample.value
    ? `${window.location.origin}${getCompanyPath(`/qc-inspection/retain-samples/${sample.value.id}`)}`
    : '',
)
const dateStr = (d) => (d?.isValid ? d.toFormat('yyyy-MM-dd') : '—')

// @page can't be scoped or reactive — inject the right page setup for the
// chosen stock (A4 sheet vs 4×2in thermal) once, before printing.
onMounted(() => {
  const style = document.createElement('style')
  style.dataset.retainLabelPage = 'true'
  style.textContent = isThermal.value
    ? '@page { size: 4in 2in; margin: 0; }'
    : '@page { size: A4; margin: 8mm; }'
  document.head.appendChild(style)
  onUnmounted(() => style.remove())
})

// Auto-print once the sample (the only required record) is loaded.
const fired = ref(false)
watch(sample, (s) => {
  if (!s || fired.value) return
  fired.value = true
  setTimeout(() => window.print(), 400)
})
</script>

<template>
  <div v-if="!sample" class="tw:p-8 tw:text-sm tw:text-secondary">Loading label…</div>
  <div v-else :class="isThermal ? 'label-thermal-page' : 'label-sheet'">
    <div
      v-for="n in copyCount"
      :key="n"
      class="label"
      :class="isThermal ? 'label--thermal' : 'label--sheet'"
    >
      <div class="label__banner">DO NOT USE — RETAIN SAMPLE</div>
      <div class="label__body">
        <div class="label__text">
          <div class="label__rs">{{ sample.rsNumber }}</div>
          <div class="label__item">{{ product?.name || '—' }}</div>
          <table class="label__meta">
            <tbody>
              <tr><td>Lot #</td><td>{{ sample.lotNumber || '—' }}</td></tr>
              <tr v-if="sample.batchNumber"><td>Batch</td><td>{{ sample.batchNumber }}</td></tr>
              <tr><td>Mfg</td><td>{{ dateStr(sample.manufacturingDate) }}</td></tr>
              <tr><td>Expiry</td><td>{{ dateStr(sample.expiryDate) }}</td></tr>
              <tr class="label__strong"><td>Retain until</td><td>{{ dateStr(sample.retainUntil) }}</td></tr>
              <tr><td>Qty</td><td>{{ sample.quantity != null ? `${sample.quantity} ${uom?.code || ''}` : '—' }}</td></tr>
              <tr v-if="sample.storageConditions"><td>Store</td><td>{{ sample.storageConditions }}</td></tr>
              <tr v-if="location"><td>Location</td><td>{{ [location.name, sample.position].filter(Boolean).join(' / ') }}</td></tr>
              <tr><td>Type</td><td>{{ sample.sampleType }}</td></tr>
              <tr><td>Retained</td><td>{{ dateStr(sample.retainedAt) }}</td></tr>
              <tr><td>Created by</td><td>{{ retainedByName }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="label__qr">
          <BaseQrCode :value="qrValue" :size="isThermal ? 110 : 88" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Shared label chrome */
.label {
  border: 1.5px solid #000;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #000;
  break-inside: avoid;
}
.label__banner {
  background: #000;
  color: #fff;
  text-align: center;
  font-weight: 800;
  letter-spacing: 0.08em;
  font-size: 10px;
  padding: 3px 4px;
}
.label__body {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  align-items: flex-start;
  flex: 1;
}
.label__text { flex: 1; min-width: 0; }
.label__rs { font-size: 16px; font-weight: 800; font-family: monospace; }
.label__item {
  font-size: 11px;
  font-weight: 600;
  margin: 1px 0 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.label__meta { font-size: 9px; border-collapse: collapse; width: 100%; }
.label__meta td { padding: 0.5px 0; vertical-align: top; }
.label__meta td:first-child { color: #333; padding-right: 6px; white-space: nowrap; width: 1%; }
.label__strong td { font-weight: 700; }
.label__qr { flex-shrink: 0; }

/* A4 sheet — grid of identical labels */
.label-sheet {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6mm;
  padding: 10mm;
  max-width: 210mm;
  margin: 0 auto;
}
.label--sheet { min-height: 52mm; }

/* Thermal 4×2in — one label per page, edge to edge */
.label-thermal-page { display: flex; flex-direction: column; }
.label--thermal { width: 4in; height: 2in; }

@media print {
  .label-sheet { padding: 0; gap: 5mm; }
}
</style>
