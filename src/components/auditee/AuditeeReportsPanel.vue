<script setup>
/**
 * Auditee reports — the auditing body's PDFs, tracked by the company.
 *
 * Each report row is the working unit of a certification audit: the company
 * uploads the interim/final PDF the registrar sent, writes a SUMMARY after
 * reading it, and turns what the report states into FINDINGS and OFIs — the
 * existing finding records, so the findings→CAPA linkage and CAPA closure
 * tracking work unchanged.
 *
 * Cloned from the auditor module's AuditReportsPanel (2026-08-24): same
 * upload/register/AI-extraction plumbing, plus the per-row Summary dialog and
 * Findings / OFI jump buttons the auditee flow is built around.
 */
import {
  IconUpload,
  IconFileTypePdf,
  IconSparkles,
  IconPlus,
  IconNotes,
  IconBolt,
  IconBulb,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post, patch } from '@/api'
import { uploadFile } from '@/composables/useFileUpload.js'
import { parsePdfAndExtractImages } from '@/composables/usePdfImport.js'
import { canUseAi } from '@/utils/currentSession.js'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})
const emit = defineEmits(['goFindings', 'goOfi'])

const toast = useToast()

const reports = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [instanceId]) =>
    db.AuditReport.where('auditInstanceId', instanceId).orderBy('reportDate', 'desc').exec(),
  { models: ['AuditReport'], initial: [] },
)

const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
function userName(id) {
  const u = users.value.find((x) => x.id === id)
  return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : '—'
}

// ── Upload + register ───────────────────────────────────────────────────────
const fileInput = ref(null)
const uploading = ref(false)
const kind = ref('INTERIM')

async function onFilePicked(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (file.type !== 'application/pdf') {
    toast.error('Auditor reports are PDFs.')
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
        kind: kind.value,
        reportDate: new Date().toISOString().slice(0, 10),
      },
      { showError: true },
    )
    toast.success(`${kind.value === 'FINAL' ? 'Final report' : 'Report'} uploaded.`)
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}

// ── Per-report summary (report.notes) ───────────────────────────────────────
const summaryFor = ref(null) // report being summarised
const summaryText = ref('')
const savingSummary = ref(false)

function openSummary(report) {
  summaryFor.value = report
  summaryText.value = report.notes || ''
}

async function saveSummary() {
  if (!summaryFor.value || savingSummary.value) return
  savingSummary.value = true
  try {
    await patch(
      `/v1/services/auditInstances/${props.auditInstance.id}/reports/${summaryFor.value.id}`,
      { notes: summaryText.value || null },
      { showError: true },
    )
    toast.success('Summary saved')
    summaryFor.value = null
  } catch {
    /* toast shown */
  } finally {
    savingSummary.value = false
  }
}

// ── AI extraction → proposals (same contract as the auditor module) ─────────
const extracting = ref(null)
const proposals = ref(null)
const extractInput = ref(null)
const pendingReport = ref(null)

function startExtract(report) {
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
  proposals.value = null
  try {
    const { text } = await parsePdfAndExtractImages(file)
    const data = await post(
      '/v1/services/ai/audit-report/extract-findings',
      {
        extractedText: text,
        standardName: props.auditInstance.displayMeta?.standardName || undefined,
      },
      { showError: true },
    )
    const found = (data.result?.findings || []).map((f) => ({
      ...f,
      typeId: defaultTypeFor(f.classification),
    }))
    proposals.value = { reportId: report.id, added: {}, ...data.result, findings: found }
    await post(
      `/v1/services/auditInstances/${props.auditInstance.id}/reports/${report.id}/parsed`,
      {},
    )
  } catch (err) {
    toast.error(err?.message || 'Extraction failed')
  } finally {
    extracting.value = null
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

async function addFinding(f, idx) {
  try {
    const prefix = f.clauseRef ? `[${f.clauseRef}] ` : ''
    const body =
      f.title && f.description && !f.description.startsWith(f.title)
        ? `${f.title} — ${f.description}`
        : f.description || f.title
    const result = await post(
      '/v1/services/auditFindings',
      {
        auditInstanceId: props.auditInstance.id,
        findingTypeId: f.typeId,
        description: `${prefix}${body}`.slice(0, 10000),
      },
      { showError: true },
    )
    proposals.value.added[idx] = result?.finding?.findingNumber || true
    toast.success(`Finding ${result?.finding?.findingNumber || ''} created`)
  } catch {
    /* toast already shown */
  }
}

const KIND_CLASS = {
  FINAL: 'tw:bg-emerald-100 tw:text-emerald-700',
  INTERIM: 'tw:bg-sky-100 tw:text-sky-700',
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div v-if="!readonly" class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseInlineSelect
        v-model="kind"
        :items="[
          { id: 'INTERIM', name: 'Interim report' },
          { id: 'FINAL', name: 'Final report' },
        ]"
      />
      <BaseButton variant="outline" size="sm" :isLoading="uploading" @click="fileInput?.click()">
        <template #icon><IconUpload :size="16" /></template>
        Upload report PDF
      </BaseButton>
      <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFilePicked" />
      <input ref="extractInput" type="file" accept="application/pdf" hidden @change="onExtractFile" />
    </div>

    <div v-if="!reports?.length" class="tw:text-sm tw:text-secondary">
      No auditor reports uploaded yet. Upload the registrar's interim or final report to start
      tracking findings.
    </div>
    <div v-else class="tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider">
      <div v-for="r in reports" :key="r.id" class="tw:flex tw:flex-col tw:gap-2 tw:px-3 tw:py-2">
        <div class="tw:flex tw:items-center tw:gap-3">
          <IconFileTypePdf :size="18" class="tw:shrink-0 tw:text-red-500" />
          <div class="tw:min-w-0 tw:flex-1">
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseText class="tw:truncate tw:text-sm tw:font-medium">{{ r.title }}</BaseText>
              <BaseBadge :class="KIND_CLASS[r.kind] || ''">{{ r.kind }}</BaseBadge>
            </div>
            <BaseText color="secondary" class="tw:text-xs">
              {{ r.reportDate ? r.reportDate.formatDate('date') : '—' }} ·
              {{ userName(r.uploadedBy) }}
              <template v-if="r.aiParsedAt"> · findings extracted</template>
            </BaseText>
          </div>
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:shrink-0">
            <BaseButton variant="outline" size="sm" @click="openSummary(r)">
              <template #icon><IconNotes :size="14" /></template>
              Summary
            </BaseButton>
            <BaseButton variant="outline" size="sm" @click="emit('goFindings')">
              <template #icon><IconBolt :size="14" /></template>
              Findings
            </BaseButton>
            <BaseButton variant="outline" size="sm" @click="emit('goOfi')">
              <template #icon><IconBulb :size="14" /></template>
              OFI
            </BaseButton>
            <BaseButton
              v-if="canUseAi && !readonly"
              variant="outline"
              size="sm"
              :isLoading="extracting === r.id"
              @click="startExtract(r)"
            >
              <template #icon><IconSparkles :size="14" /></template>
              {{ r.aiParsedAt ? 'Re-extract' : 'Extract findings' }}
            </BaseButton>
          </div>
        </div>
        <!-- Saved summary, shown inline under the row -->
        <div
          v-if="r.notes"
          class="tw:ml-7 tw:rounded tw:bg-main-hover/40 tw:px-2 tw:py-1.5 tw:text-xs tw:text-on-main tw:whitespace-pre-line"
        >
          {{ r.notes }}
        </div>
      </div>
    </div>

    <!-- Extraction proposals -->
    <div
      v-if="proposals"
      class="tw:rounded-xl tw:border tw:border-primary/30 tw:bg-primary/5 tw:p-4 tw:flex tw:flex-col tw:gap-3"
    >
      <div class="tw:flex tw:items-center tw:justify-between">
        <BaseText weight="semibold" class="tw:text-sm">
          Proposed findings ({{ proposals.findings.length }})
        </BaseText>
        <button
          class="tw:text-xs tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
          @click="proposals = null"
        >
          ✕
        </button>
      </div>

      <BaseText v-if="!proposals.findings.length" color="secondary" class="tw:text-sm">
        The report states no findings the model could extract.
      </BaseText>

      <div
        v-for="(f, idx) in proposals.findings"
        :key="idx"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-main tw:p-3"
      >
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <BaseText class="tw:text-sm tw:font-medium">{{ f.title }}</BaseText>
            <BaseBadge v-if="f.clauseRef" class="tw:bg-gray-100 tw:text-gray-700">{{
              f.clauseRef
            }}</BaseBadge>
            <BaseBadge v-if="f.classification" class="tw:bg-amber-100 tw:text-amber-700">{{
              f.classification
            }}</BaseBadge>
          </div>
          <BaseText color="secondary" class="tw:mt-1 tw:text-xs tw:whitespace-pre-line">{{
            f.description
          }}</BaseText>
        </div>
        <div class="tw:flex tw:shrink-0 tw:flex-col tw:items-end tw:gap-1.5">
          <BaseInlineSelect
            v-if="!proposals.added[idx]"
            v-model="f.typeId"
            :items="FINDING_TYPES"
            :required="true"
          />
          <BaseButton
            size="sm"
            :variant="proposals.added[idx] ? 'outline' : 'primary'"
            :disabled="!!proposals.added[idx]"
            @click="addFinding(f, idx)"
          >
            <template #icon><IconPlus :size="14" /></template>
            {{ proposals.added[idx] ? `Added ${proposals.added[idx]}` : 'Add as finding' }}
          </BaseButton>
        </div>
      </div>

      <ul v-if="proposals.caveats?.length" class="tw:m-0 tw:pl-4 tw:text-xs tw:text-amber-700">
        <li v-for="(c, i) in proposals.caveats" :key="i">{{ c }}</li>
      </ul>
    </div>

    <!-- Summary dialog -->
    <BaseDialog
      :modelValue="!!summaryFor"
      :title="`Report Summary — ${summaryFor?.title || ''}`"
      maxWidth="lg"
      @update:modelValue="summaryFor = null"
    >
      <p class="tw:text-xs tw:text-secondary tw:mb-2">
        What the report concluded, in your words — shown under the report row and kept for the next
        audit.
      </p>
      <BaseTextarea v-model="summaryText" :rows="8" placeholder="Key conclusions, scope covered, overall result…" />
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:mt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="savingSummary" @click="summaryFor = null">
          Cancel
        </BaseButton>
        <BaseButton :isLoading="savingSummary" @click="saveSummary">Save summary</BaseButton>
      </div>
    </BaseDialog>
  </div>
</template>
