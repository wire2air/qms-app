<script setup>
/**
 * Log Book QR LABEL — the sticker that goes on the equipment or the wall where
 * entries get made. Scanning it opens that book's entry form on the phone.
 *
 *   ?ids=a,b,c   one label per book (bulk, from the Log Books list)
 *   ?id=…        a single book (from its detail page)
 *   ?size=a4     (default) A4 sheet, 2 up · ?size=4x2 one 4in × 2in thermal per page
 *   ?copies=N    a4 + single book only: N identical labels (default 8)
 *
 * ── THE QR CARRIES THE LINEAGE ROOT, NOT THE BOOK ID ──────────────────────
 * A sticker outlives the row. Log books supersede rather than edit — revise a
 * frozen field and CAL-LOG-QA becomes CAL-LOG-QA-V2, with the original marked
 * OBSOLETE and accepting nothing. Encoding the id would quietly kill every
 * printed label the first time a book is revised. The root code resolves at
 * scan time to whichever generation is live; see logBookLineage.js and the
 * `?book=` branch in pages/inspections-logs/fill.vue.
 *
 * ── IT MUST TELEPORT ──────────────────────────────────────────────────────
 * index.html marks `#app` as `tw:print:hidden` and provides a sibling
 * `#print-portal`. Anything rendered inside the app tree therefore (a) sits
 * under the sidebar and header on screen, and (b) is HIDDEN when the browser
 * prints — the print dialog shows a blank document. PrintLayout escapes both
 * by teleporting into that portal; a module that skips PrintLayout has to do
 * the same thing for itself.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { labelCodeFor } from '@/components/inspectionsLogs/logBookLineage.js'

const props = defineProps({
  id: { type: String, default: null },
  ids: { type: String, default: '' },
  size: { type: String, default: 'a4' },
  copies: { type: [String, Number], default: 8 },
})

const wantedIds = computed(() => {
  const list = String(props.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length) return list
  return props.id ? [props.id] : []
})

const books = useLiveQueryWithDeps(
  [() => wantedIds.value.join(',')],
  async (db, [joined]) => {
    const ids = joined ? joined.split(',') : []
    if (!ids.length) return []
    const rows = await Promise.all(ids.map((id) => db.LogBook.findByPk(id)))
    return rows.filter(Boolean)
  },
  { models: ['LogBook'], initial: [] },
)

const equipmentList = useLiveQuery((db) => db.Equipment.where().exec(), {
  models: ['Equipment'],
  initial: [],
})
const equipmentById = computed(() => new Map(equipmentList.value.map((e) => [e.id, e])))

const isThermal = computed(() => String(props.size).toLowerCase() === '4x2')

// Copies only make sense for a single book — a bulk sheet is one label each,
// and multiplying them would silently print 8× what was asked for.
const copyCount = computed(() => {
  if (isThermal.value || books.value.length > 1) return 1
  const n = Number(props.copies)
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 40) : 8
})

/** One printed cell per (book × copy). */
const labels = computed(() =>
  books.value.flatMap((book) =>
    Array.from({ length: copyCount.value }, (_, i) => ({ key: `${book.id}-${i}`, book })),
  ),
)

function qrValueFor(book) {
  const code = labelCodeFor(book)
  return `${window.location.origin}${getCompanyPath(`/inspections-logs/fill?book=${encodeURIComponent(code)}`)}`
}
function equipmentName(book) {
  return book.equipmentId ? (equipmentById.value.get(book.equipmentId)?.name ?? '') : ''
}

onMounted(() => {
  const style = document.createElement('style')
  style.dataset.logBookLabelPage = 'true'
  style.textContent = isThermal.value
    ? '@page { size: 4in 2in; margin: 0; }'
    : '@page { size: A4; margin: 8mm; }'
  document.head.appendChild(style)
  onUnmounted(() => style.remove())
})

// Auto-print once there is something to print.
function printNow() {
  window.print()
}

const fired = ref(false)
watch(books, (list) => {
  if (!list?.length || fired.value) return
  fired.value = true
  setTimeout(() => window.print(), 400)
})
</script>

<template>
  <Teleport to="#print-portal">
    <div class="qr-label-root">
      <!-- Screen only. Auto-print fires once; without this, dismissing the
           browser dialog leaves no way back except reloading the URL. -->
      <div v-if="books.length" class="qr-label-toolbar">
        <span>{{ labels.length }} label{{ labels.length === 1 ? '' : 's' }}</span>
        <button type="button" @click="printNow">Print</button>
      </div>
      <div v-if="!books.length" class="tw:p-8 tw:text-sm tw:text-secondary">Loading labels…</div>
      <div v-else :class="isThermal ? 'label-thermal-page' : 'label-sheet'">
        <div
          v-for="entry in labels"
          :key="entry.key"
          class="label"
          :class="isThermal ? 'label--thermal' : 'label--sheet'"
        >
          <div class="label__banner">SCAN TO LOG AN ENTRY</div>
          <div class="label__body">
            <div class="label__text">
              <div class="label__title">{{ entry.book.title }}</div>
              <!-- The ROOT code, matching what the QR encodes: someone typing it in
                     by hand (camera broken, phone flat) must reach the same book. -->
              <div class="label__code">{{ labelCodeFor(entry.book) }}</div>
              <table class="label__meta">
                <tbody>
                  <tr v-if="equipmentName(entry.book)">
                    <td>Equipment</td>
                    <td>{{ equipmentName(entry.book) }}</td>
                  </tr>
                  <tr v-if="entry.book.location">
                    <td>Location</td>
                    <td>{{ entry.book.location }}</td>
                  </tr>
                  <tr v-if="entry.book.signatureRequired">
                    <td>Signature</td>
                    <td>Required on submit</td>
                  </tr>
                </tbody>
              </table>
              <div class="label__hint">
                Scan with your phone camera. Sign in if asked — you will be brought straight back
                here.
              </div>
            </div>
            <div class="label__qr">
              <BaseQrCode :value="qrValueFor(entry.book)" :size="isThermal ? 120 : 96" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Covers the app shell on screen; becomes ordinary flow when printing. */
.qr-label-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  max-width: 210mm;
  margin: 0 auto 12px;
  font-size: 13px;
  color: #374151;
}
.qr-label-toolbar button {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  padding: 6px 14px;
  font: inherit;
  cursor: pointer;
}
@media print {
  .qr-label-toolbar {
    display: none !important;
  }
}
.qr-label-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #f3f4f6;
  overflow: auto;
  padding: 16px;
}
@media print {
  .qr-label-root {
    position: static;
    padding: 0;
    background: white;
    overflow: visible;
  }
}

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
  padding: 8px;
  align-items: flex-start;
  flex: 1;
}
.label__text {
  flex: 1;
  min-width: 0;
}
.label__title {
  font-size: 13px;
  font-weight: 800;
  line-height: 1.2;
}
.label__code {
  font-size: 15px;
  font-weight: 800;
  font-family: monospace;
  margin-top: 2px;
}
.label__meta {
  font-size: 9px;
  border-collapse: collapse;
  width: 100%;
  margin-top: 4px;
}
.label__meta td {
  padding: 0.5px 0;
  vertical-align: top;
}
.label__meta td:first-child {
  color: #333;
  padding-right: 6px;
  white-space: nowrap;
  width: 1%;
}
.label__hint {
  font-size: 8px;
  color: #333;
  margin-top: 5px;
  line-height: 1.3;
}
.label__qr {
  flex-shrink: 0;
}

.label-sheet {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6mm;
  padding: 10mm;
  max-width: 210mm;
  margin: 0 auto;
}
.label--sheet {
  min-height: 48mm;
}

.label-thermal-page {
  display: flex;
  flex-direction: column;
}
.label--thermal {
  width: 4in;
  height: 2in;
}

@media print {
  .label-sheet {
    padding: 0;
    gap: 5mm;
  }
}
</style>

<style>
/* Unscoped on purpose: `body` has `tw:overflow-hidden` from index.html, so
   without this the printout is clipped to one viewport. Mirrors PrintLayout. */
@media print {
  html,
  body {
    background: white !important;
    margin: 0;
    padding: 0;
    height: auto !important;
    overflow: visible !important;
  }
}
</style>
