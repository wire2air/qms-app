<script setup>
/**
 * Bulk-create inspection lots from a CSV. Parsing + product-SKU resolution
 * happen client-side (products are already in IDB) so the user gets a
 * row-by-row preview with errors BEFORE anything is written; valid rows go
 * to POST /lots/import which reuses createLot per row (plan resolution,
 * spec/sampling snapshot, sample-size computation all apply).
 *
 * Expected header (case/space-insensitive):
 *   inspection_point, product_sku, quantity, batch_number, po_number,
 *   receipt_number, work_order, notes
 * Only inspection_point + product_sku are required.
 */
import { IconUpload, IconDownload } from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const emit = defineEmits(['imported'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const importing = ref(false)
const rows = ref([])
const fileName = ref('')

const VALID_POINTS = new Set(['INCOMING', 'IN_PROCESS', 'FINAL', 'OUTGOING'])

const products = useLiveQuery(async (db) => db.Product.where().exec(), { initial: [] })
const productBySku = computed(
  () => new Map(products.value.map((p) => [String(p.sku).trim().toLowerCase(), p])),
)

watch(show, (v) => {
  if (v) {
    rows.value = []
    fileName.value = ''
  }
})

// Minimal CSV parser — handles quoted fields with commas; enough for the
// spreadsheet-exported files this feeds on.
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length)
  return lines.map((line) => {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out.map((c) => c.trim())
  })
}

function normalizeHeader(h) {
  return h.toLowerCase().replace(/[\s-]+/g, '_')
}

async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  fileName.value = file.name
  const text = await file.text()
  const parsed = parseCsv(text)
  if (parsed.length < 2) {
    toast.error('CSV needs a header row and at least one data row')
    return
  }
  const headers = parsed[0].map(normalizeHeader)
  const col = (name) => headers.indexOf(name)
  const idx = {
    point: col('inspection_point'),
    sku: col('product_sku'),
    qty: col('quantity'),
    batch: col('batch_number'),
    po: col('po_number'),
    receipt: col('receipt_number'),
    wo: col('work_order'),
    notes: col('notes'),
  }
  if (idx.point === -1 || idx.sku === -1) {
    toast.error('CSV must include inspection_point and product_sku columns')
    return
  }
  rows.value = parsed.slice(1).map((cells, i) => {
    const point = (cells[idx.point] ?? '').toUpperCase().replace(/[\s-]+/g, '_')
    const sku = cells[idx.sku] ?? ''
    const product = productBySku.value.get(sku.trim().toLowerCase()) ?? null
    const qtyRaw = idx.qty !== -1 ? cells[idx.qty] : ''
    const quantity = qtyRaw ? Number(qtyRaw) : null
    let error = null
    if (!VALID_POINTS.has(point)) error = `Invalid inspection_point "${cells[idx.point]}"`
    else if (!product) error = `Unknown product SKU "${sku}"`
    else if (qtyRaw && !Number.isFinite(quantity)) error = `Invalid quantity "${qtyRaw}"`
    return {
      line: i + 2,
      error,
      sku,
      productName: product?.name ?? null,
      body: {
        inspectionPoint: point,
        productId: product?.id,
        quantity,
        batchNumber: idx.batch !== -1 ? cells[idx.batch] || null : null,
        poNumber: idx.po !== -1 ? cells[idx.po] || null : null,
        receiptNumber: idx.receipt !== -1 ? cells[idx.receipt] || null : null,
        workOrder: idx.wo !== -1 ? cells[idx.wo] || null : null,
        notes: idx.notes !== -1 ? cells[idx.notes] || null : null,
      },
    }
  })
}

const validRows = computed(() => rows.value.filter((r) => !r.error))
const errorRows = computed(() => rows.value.filter((r) => r.error))

async function doImport() {
  if (!validRows.value.length || importing.value) return
  importing.value = true
  try {
    const { count } = await post('/v1/services/qcInspection/lots/import', {
      rows: validRows.value.map((r) => r.body),
    })
    toast.success(`${count} lot(s) created`)
    show.value = false
    emit('imported')
  } catch (err) {
    toast.error(err?.message || 'Import failed')
  } finally {
    importing.value = false
  }
}

function downloadTemplate() {
  const csv =
    'inspection_point,product_sku,quantity,batch_number,po_number,receipt_number,work_order,notes\n' +
    'INCOMING,SKU-001,1000,BATCH-42,PO-1001,,,Received from supplier\n'
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'inspection-lots-template.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <BaseDialog v-model="show" title="Import Inspection Lots (CSV)" size="3xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
        <label
          class="tw:inline-flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:rounded-lg tw:border tw:border-divider tw:cursor-pointer tw:hover:bg-main-hover"
        >
          <IconUpload :size="16" />
          {{ fileName || 'Choose CSV file…' }}
          <input type="file" accept=".csv,text/csv" class="tw:hidden" @change="onFile" />
        </label>
        <button
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-primary tw:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
          @click="downloadTemplate"
        >
          <IconDownload :size="14" /> Download template
        </button>
      </div>

      <p class="tw:text-xs tw:text-secondary">
        Required columns: <span class="tw:font-mono">inspection_point</span> (INCOMING / IN_PROCESS /
        FINAL / OUTGOING) and <span class="tw:font-mono">product_sku</span>. Optional:
        quantity, batch_number, po_number, receipt_number, work_order, notes. Each row resolves its
        inspection plan, specification and sample size exactly like a manually created lot.
      </p>

      <!-- Preview -->
      <div v-if="rows.length" class="tw:border tw:border-divider tw:rounded-lg tw:overflow-hidden">
        <div class="tw:px-3 tw:py-2 tw:bg-main-hover tw:text-xs tw:font-semibold">
          {{ validRows.length }} valid · {{ errorRows.length }} with errors
        </div>
        <div class="tw:max-h-64 tw:overflow-auto">
          <table class="tw:w-full tw:min-w-[520px] tw:text-xs">
            <thead class="tw:text-secondary tw:uppercase">
              <tr>
                <th class="tw:text-left tw:px-3 tw:py-1.5">Line</th>
                <th class="tw:text-left tw:px-3 tw:py-1.5">Point</th>
                <th class="tw:text-left tw:px-3 tw:py-1.5">Product</th>
                <th class="tw:text-left tw:px-3 tw:py-1.5">Qty</th>
                <th class="tw:text-left tw:px-3 tw:py-1.5">Batch</th>
                <th class="tw:text-left tw:px-3 tw:py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.line" class="tw:border-t tw:border-divider">
                <td class="tw:px-3 tw:py-1.5 tw:text-secondary">{{ r.line }}</td>
                <td class="tw:px-3 tw:py-1.5">{{ r.body.inspectionPoint }}</td>
                <td class="tw:px-3 tw:py-1.5">{{ r.productName ?? r.sku }}</td>
                <td class="tw:px-3 tw:py-1.5">{{ r.body.quantity ?? '—' }}</td>
                <td class="tw:px-3 tw:py-1.5">{{ r.body.batchNumber ?? '—' }}</td>
                <td class="tw:px-3 tw:py-1.5">
                  <span v-if="r.error" class="tw:text-bad">{{ r.error }}</span>
                  <span v-else class="tw:text-good">Ready</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="`Import ${validRows.length || ''} lot(s)`"
        :loading="importing"
        :disabled="!validRows.length"
        @cancel="show = false"
        @submit="doImport"
      />
    </template>
  </BaseDialog>
</template>
