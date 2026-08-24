<script setup>
/**
 * Auditee reports — the auditing body's PDFs, tracked by the company.
 *
 * The report row is the working unit of an external audit: upload the PDF the
 * auditing body sent, run AI EXTRACT once, and a popup offers everything the
 * report contained — a SUMMARY to accept (editable later, on the Summary tab)
 * and the findings/OFIs to bulk-add after choosing each one's type. Every
 * accepted finding remembers which report raised it, so the Findings/OFI tabs
 * can filter per report. Ideally there is exactly one report; the model
 * doesn't break when the registrar sends three.
 *
 * PROPOSALS, not records: nothing lands until a human accepts it.
 */
import {
  IconUpload,
  IconFileTypePdf,
  IconSparkles,
  IconPlus,
  IconNotes,
  IconBolt,
  IconBulb,
  IconCheck,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post, patch } from '@/api'
import { uploadFile } from '@/composables/useFileUpload.js'
import { parsePdfAndExtractImages } from '@/composables/usePdfImport.js'
import { canUseAi } from '@/utils/currentSession.js'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  // Certificate mode: same register, kind CERTIFICATE — upload + list only
  // (a certificate has no findings to extract or summarise).
  certificateMode: { type: Boolean, default: false },
})
const emit = defineEmits(['goFindings', 'goOfi', 'goSummary'])

const toast = useToast()

const reports = useLiveQueryWithDeps(
  [() => props.auditInstance.id, () => props.certificateMode],
  async (db, [instanceId, certMode]) => {
    const rows = await db.AuditReport.where('auditInstanceId', instanceId)
      .orderBy('reportDate', 'desc')
      .exec()
    return rows.filter((r) => (r.kind === 'CERTIFICATE') === !!certMode)
  },
  { models: ['AuditReport'], initial: [] },
)

const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
function userName(id) {
  const u = users.value.find((x) => x.id === id)
  return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : '—'
}

const assetUrlById = useLiveQueryWithDeps(
  [() => reports.value.map((r) => r.assetId).join(',')],
  async (db, [csv]) => {
    const m = {}
    for (const id of (csv || '').split(',').filter(Boolean)) {
      const a = await db.Asset.findByPk(id)
      if (a?.url) m[id] = a.url
    }
    return m
  },
  { models: ['Asset'], initial: {} },
)

// Findings per report — each report carries its own findings/OFIs.
const findingsByReport = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [instanceId]) => {
    const rows = await db.AuditFinding.where('auditInstanceId', instanceId).exec()
    const m = {}
    for (const f of rows) {
      if (!f.auditReportId || f.statusId === 'CANCELLED') continue
      const bucket = (m[f.auditReportId] ??= { findings: 0, ofi: 0 })
      if (f.findingTypeId === 'OFI') bucket.ofi += 1
      else bucket.findings += 1
    }
    return m
  },
  { models: ['AuditFinding'], initial: {} },
)

// ── Upload + register (one button; kind is edited on the row) ───────────────
const fileInput = ref(null)
const uploading = ref(false)

async function onFilePicked(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.type !== 'application/pdf') {
    toast.error(props.certificateMode ? 'Certificates are PDFs.' : 'Auditor reports are PDFs.')
    return
  }
  uploading.value = true
  try {
    const up = await uploadFile(file, 'ASSET')
    if (!up.success || !up.asset?.id) throw new Error(up.error || 'Upload failed')
    await post(
      `/v1/services/auditInstances/${props.auditInstance.id}/reports`,
      {
        assetId: up.asset.id,
        title: file.name.replace(/\.pdf$/i, ''),
        kind: props.certificateMode ? 'CERTIFICATE' : 'INTERIM',
        reportDate: new Date().toISOString().slice(0, 10),
      },
      { showError: true },
    )
    toast.success(props.certificateMode ? 'Certificate uploaded.' : 'Report uploaded.')
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}

const REPORT_KINDS = [
  { id: 'INTERIM', name: 'Interim' },
  { id: 'FINAL', name: 'Final' },
]
async function setKind(report, kind) {
  if (kind === report.kind) return
  try {
    await patch(
      `/v1/services/auditInstances/${props.auditInstance.id}/reports/${report.id}`,
      { kind },
      { showError: true },
    )
  } catch {
    /* toast shown */
  }
}

// ── AI extraction → popup: summary + bulk findings ──────────────────────────
const extracting = ref(null)
const extractInput = ref(null)
const pendingReport = ref(null)

// Popup state — everything the model proposed for ONE report.
const review = ref(null) // { report, summary, findings:[{...f, typeId, selected, added}], caveats }
const acceptingSummary = ref(false)
const bulkAdding = ref(false)

async function startExtract(report) {
  // The server never sees the PDF; text is extracted in the browser. The
  // uploaded asset is same-origin, so fetch it back and parse it directly —
  // the user already picked this file once. The file picker survives only as
  // a fallback (asset missing / fetch blocked).
  const url = assetUrlById.value[report.assetId]
  if (url) {
    extracting.value = report.id
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`Could not load the uploaded PDF (${res.status})`)
      const blob = await res.blob()
      const file = new File([blob], `${report.title || 'report'}.pdf`, {
        type: 'application/pdf',
      })
      await runExtraction(report, file)
      return
    } catch {
      extracting.value = null
      toast.warning('Could not reload the uploaded PDF — pick the file to extract.')
    }
  }
  pendingReport.value = report
  extractInput.value?.click()
}

async function onExtractFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  const report = pendingReport.value
  pendingReport.value = null
  if (!file || !report) return
  extracting.value = report.id
  await runExtraction(report, file)
}

// Queued extraction: a dense report takes the model past any HTTP timeout,
// so the server enqueues a worker job and the result lands on the report row
// (aiExtraction) via the sync engine. The watcher below opens the popup when
// it arrives; `extracting` keeps the row's spinner going until then.
const waitingSince = ref({}) // reportId -> ms epoch of the request

async function runExtraction(report, file) {
  try {
    const { text } = await parsePdfAndExtractImages(file)
    await post(
      '/v1/services/ai/audit-report/extract-findings',
      {
        auditInstanceId: props.auditInstance.id,
        reportId: report.id,
        extractedText: text,
        standardName: props.auditInstance.displayMeta?.standardName || undefined,
      },
      { showError: true },
    )
    waitingSince.value[report.id] = Date.now()
    toast.success('Extraction started — the review will open here when it finishes.')
  } catch (err) {
    toast.error(err?.message || 'Extraction failed')
    extracting.value = null
  }
}

// Open the popup the moment a waited-on extraction lands (or report failure).
watch(reports, (rows) => {
  for (const r of rows || []) {
    const since = waitingSince.value[r.id]
    if (!since) continue
    const done = r.aiExtraction?.completedAt ? Date.parse(r.aiExtraction.completedAt) : 0
    if (done && done >= since - 60_000) {
      delete waitingSince.value[r.id]
      if (extracting.value === r.id) extracting.value = null
      if (r.aiExtraction.failed) {
        toast.error(`Extraction failed: ${r.aiExtraction.error || 'unknown error'}`)
      } else {
        openReview(r)
      }
    }
  }
})

// Build the review popup from the STORED extraction — also how a user
// returns to it after a reload or after closing the popup.
function openReview(report) {
  const x = report.aiExtraction
  if (!x || x.failed) return
  review.value = {
    report,
    summary: x.summary || '',
    caveats: x.caveats || [],
    findings: (x.findings || []).map((f) => ({
      ...f,
      typeId: defaultTypeFor(f.classification),
      selected: true,
      added: null,
    })),
  }
}

const FINDING_TYPES = [
  { id: 'MAJOR_NC', name: 'Major NC' },
  { id: 'MINOR_NC', name: 'Minor NC' },
  { id: 'OBSERVATION', name: 'Observation' },
  { id: 'OFI', name: 'OFI' },
]

function defaultTypeFor(classification) {
  const c = (classification || '').toLowerCase()
  if (c.includes('major')) return 'MAJOR_NC'
  if (c.includes('minor')) return 'MINOR_NC'
  if (c.includes('ofi') || c.includes('opportunit')) return 'OFI'
  if (c.includes('nc') || c.includes('nonconform') || c.includes('non-conform')) return 'MINOR_NC'
  return 'OBSERVATION'
}

async function acceptSummary() {
  if (!review.value || acceptingSummary.value) return
  acceptingSummary.value = true
  try {
    await patch(
      `/v1/services/auditInstances/${props.auditInstance.id}/reports/${review.value.report.id}`,
      { notes: review.value.summary || null },
      { showError: true },
    )
    toast.success('Summary saved — edit it any time on the Summary tab.')
  } catch {
    /* toast shown */
  } finally {
    acceptingSummary.value = false
  }
}

const selectedCount = computed(
  () => review.value?.findings.filter((f) => f.selected && !f.added).length ?? 0,
)
function setAllSelected(v) {
  for (const f of review.value?.findings || []) if (!f.added) f.selected = v
}

async function addOne(f) {
  const prefix = f.clauseRef ? `[${f.clauseRef}] ` : ''
  const body =
    f.title && f.description && !f.description.startsWith(f.title)
      ? `${f.title} — ${f.description}`
      : f.description || f.title
  const result = await post(
    '/v1/services/auditFindings',
    {
      auditInstanceId: props.auditInstance.id,
      auditReportId: review.value.report.id,
      findingTypeId: f.typeId,
      description: `${prefix}${body}`.slice(0, 10000),
    },
    { showError: true },
  )
  f.added = result?.finding?.findingNumber || true
  f.selected = false
}

async function addSelected() {
  if (!review.value || bulkAdding.value) return
  bulkAdding.value = true
  let added = 0
  try {
    for (const f of review.value.findings) {
      if (!f.selected || f.added) continue
      await addOne(f)
      added += 1
    }
    if (added) toast.success(`${added} finding${added === 1 ? '' : 's'} added to this audit.`)
  } catch {
    /* per-call toast shown */
  } finally {
    bulkAdding.value = false
  }
}

const KIND_CLASS = {
  FINAL: 'tw:bg-emerald-100 tw:text-emerald-700',
  INTERIM: 'tw:bg-sky-100 tw:text-sky-700',
  CERTIFICATE: 'tw:bg-violet-100 tw:text-violet-700',
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div v-if="!readonly" class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseButton variant="outline" size="sm" :isLoading="uploading" @click="fileInput?.click()">
        <template #icon><IconUpload :size="16" /></template>
        {{ certificateMode ? 'Upload certificate' : 'Upload report PDF' }}
      </BaseButton>
      <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFilePicked" />
      <input ref="extractInput" type="file" accept="application/pdf" hidden @change="onExtractFile" />
    </div>

    <div v-if="!reports?.length" class="tw:text-sm tw:text-secondary">
      {{
        certificateMode
          ? 'No certificate uploaded yet. Once the auditing body issues one, keep it here for future reference.'
          : "No auditor reports uploaded yet. Upload the auditing body's report, then Extract to pull its summary and findings."
      }}
    </div>
    <div v-else class="tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider">
      <div v-for="r in reports" :key="r.id" class="tw:flex tw:flex-col tw:gap-2 tw:px-3 tw:py-2">
        <div class="tw:flex tw:items-center tw:gap-3">
          <IconFileTypePdf :size="18" class="tw:shrink-0 tw:text-red-500" />
          <div class="tw:min-w-0 tw:flex-1">
            <div class="tw:flex tw:items-center tw:gap-2">
              <a
                v-if="assetUrlById[r.assetId]"
                :href="assetUrlById[r.assetId]"
                target="_blank"
                rel="noopener"
                class="tw:truncate tw:text-sm tw:font-medium tw:text-on-main tw:hover:text-primary tw:hover:underline"
              >
                {{ r.title }}
              </a>
              <BaseText v-else class="tw:truncate tw:text-sm tw:font-medium">{{ r.title }}</BaseText>
              <BaseInlineSelect
                v-if="!certificateMode && !readonly"
                :modelValue="r.kind"
                :items="REPORT_KINDS"
                :required="true"
                @update:modelValue="(v) => setKind(r, v)"
              />
              <BaseBadge v-else :class="KIND_CLASS[r.kind] || ''">{{ r.kind }}</BaseBadge>
            </div>
            <BaseText color="secondary" class="tw:text-xs">
              {{ r.reportDate ? r.reportDate.formatDate('date') : '—' }} ·
              {{ userName(r.uploadedBy) }}
              <template v-if="findingsByReport[r.id]">
                · {{ findingsByReport[r.id].findings }} finding{{
                  findingsByReport[r.id].findings === 1 ? '' : 's'
                }}
                <template v-if="findingsByReport[r.id].ofi">
                  · {{ findingsByReport[r.id].ofi }} OFI</template
                >
              </template>
            </BaseText>
          </div>
          <div
            v-if="!certificateMode"
            class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:shrink-0"
          >
            <BaseButton
              v-if="canUseAi && !readonly"
              size="sm"
              :isLoading="extracting === r.id || !!waitingSince[r.id]"
              @click="startExtract(r)"
            >
              <template #icon><IconSparkles :size="14" /></template>
              {{ r.aiParsedAt ? 'Re-extract' : 'AI Extract' }}
            </BaseButton>
            <BaseButton
              v-if="r.aiExtraction && !r.aiExtraction.failed"
              variant="outline"
              size="sm"
              @click="openReview(r)"
            >
              Review ({{ r.aiExtraction.findings?.length ?? 0 }})
            </BaseButton>
            <BaseButton variant="outline" size="sm" @click="emit('goSummary', r.id)">
              <template #icon><IconNotes :size="14" /></template>
              Summary
            </BaseButton>
            <BaseButton variant="outline" size="sm" @click="emit('goFindings', r.id)">
              <template #icon><IconBolt :size="14" /></template>
              Findings
            </BaseButton>
            <BaseButton variant="outline" size="sm" @click="emit('goOfi', r.id)">
              <template #icon><IconBulb :size="14" /></template>
              OFI
            </BaseButton>
          </div>
        </div>
        <div
          v-if="r.notes"
          class="tw:ml-7 tw:rounded tw:bg-main-hover/40 tw:px-2 tw:py-1.5 tw:text-xs tw:text-on-main tw:whitespace-pre-line"
        >
          {{ r.notes }}
        </div>
      </div>
    </div>

    <!-- Extraction review popup: accept the summary, bulk-add the findings. -->
    <BaseDialog
      :modelValue="!!review"
      :title="`AI Extract — ${review?.report?.title || ''}`"
      maxWidth="xl"
      @update:modelValue="review = null"
    >
      <div v-if="review" class="tw:flex tw:flex-col tw:gap-4">
        <!-- Summary -->
        <div>
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
            <BaseText variant="overline">Summary</BaseText>
            <BaseButton
              size="sm"
              variant="outline"
              :isLoading="acceptingSummary"
              :disabled="!review.summary?.trim()"
              @click="acceptSummary"
            >
              <template #icon><IconCheck :size="14" /></template>
              Accept summary
            </BaseButton>
          </div>
          <BaseTextarea
            v-model="review.summary"
            :rows="4"
            placeholder="What the report concluded…"
          />
          <p class="tw:text-xs tw:text-secondary tw:mt-1">
            Edit before accepting, or later on the Summary tab.
          </p>
        </div>

        <!-- Findings -->
        <div>
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:mb-2">
            <BaseText variant="overline">
              Proposed findings ({{ review.findings.length }})
            </BaseText>
            <span class="tw:flex-1" />
            <template v-if="review.findings.length">
              <button
                class="tw:text-xs tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="setAllSelected(true)"
              >
                Select all
              </button>
              <button
                class="tw:text-xs tw:text-secondary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="setAllSelected(false)"
              >
                Clear
              </button>
              <BaseButton
                size="sm"
                :disabled="!selectedCount"
                :isLoading="bulkAdding"
                @click="addSelected"
              >
                <template #icon><IconPlus :size="14" /></template>
                Add selected ({{ selectedCount }})
              </BaseButton>
            </template>
          </div>

          <BaseText v-if="!review.findings.length" color="secondary" class="tw:text-sm">
            The report states no findings the model could extract.
          </BaseText>

          <div v-else class="tw:flex tw:flex-col tw:gap-2 tw:max-h-80 tw:overflow-y-auto">
            <div
              v-for="(f, idx) in review.findings"
              :key="idx"
              class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-3"
              :class="f.added ? 'tw:opacity-60' : ''"
            >
              <input
                v-model="f.selected"
                type="checkbox"
                class="tw:mt-1"
                :disabled="!!f.added"
                :aria-label="`Select ${f.title}`"
              />
              <div class="tw:min-w-0 tw:flex-1">
                <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                  <BaseText class="tw:text-sm tw:font-medium">{{ f.title }}</BaseText>
                  <BaseBadge v-if="f.clauseRef" class="tw:bg-gray-100 tw:text-gray-700">{{
                    f.clauseRef
                  }}</BaseBadge>
                  <BaseBadge v-if="f.classification" class="tw:bg-amber-100 tw:text-amber-700">{{
                    f.classification
                  }}</BaseBadge>
                  <BaseBadge v-if="f.added" class="tw:bg-emerald-100 tw:text-emerald-700">
                    Added {{ f.added }}
                  </BaseBadge>
                </div>
                <BaseText color="secondary" class="tw:mt-1 tw:text-xs tw:whitespace-pre-line">{{
                  f.description
                }}</BaseText>
              </div>
              <BaseInlineSelect
                v-if="!f.added"
                v-model="f.typeId"
                :items="FINDING_TYPES"
                :required="true"
              />
            </div>
          </div>

          <ul
            v-if="review.caveats?.length"
            class="tw:m-0 tw:mt-2 tw:pl-4 tw:text-xs tw:text-amber-700"
          >
            <li v-for="(c, i) in review.caveats" :key="i">{{ c }}</li>
          </ul>
        </div>
      </div>

      <template #footer>
        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="outline" @click="review = null">Done</BaseButton>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>
