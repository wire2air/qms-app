<script setup>
/**
 * Auditor reports — the registrar's PDFs, kept with the audit.
 *
 * Interim reports while the audit runs, the final report at close, ordered by
 * date: the next audit starts by reading what the last one found. Files are
 * ordinary assets; this panel registers them against the instance.
 *
 * AI extraction is PROPOSALS, not records. The report's text is extracted in
 * the browser (pdfjs, same as every PDF import) and the model returns the
 * findings the report ACTUALLY STATES — verbatim descriptions, clause refs
 * and classifications only where the report gives them. Each proposal is
 * added by a human through the normal finding flow, one deliberate click per
 * finding. An auditor's report mixes findings with commendations and scope
 * narrative; a model that silently wrote findings would sooner or later write
 * one the auditor never raised.
 */
import { IconUpload, IconFileTypePdf, IconSparkles, IconPlus } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { uploadFile } from '@/composables/useFileUpload.js'
import { parsePdfAndExtractImages } from '@/composables/usePdfImport.js'
import { canUseAi } from '@/utils/currentSession.js'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})

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

// ── AI extraction → proposals ───────────────────────────────────────────────
const extracting = ref(null) // report id
const proposals = ref(null) // { reportId, findings, caveats }
const extractInput = ref(null)
const pendingReport = ref(null)

function startExtract(report) {
  // The server never sees the PDF; text is extracted here. The asset cannot
  // be re-downloaded as a File without extra plumbing, so the user picks the
  // same PDF they just uploaded — one extra click, zero new attack surface.
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

/**
 * The report's free-text classification seeds the type; the human can change
 * it before adding. Unclassified defaults to OBSERVATION — the least-severe
 * record is the right default for something the auditor did not grade.
 */
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
    <!-- Upload -->
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

    <!-- Report list, newest first -->
    <div v-if="!reports?.length" class="tw:text-sm tw:text-secondary">
      No auditor reports uploaded yet.
    </div>
    <div v-else class="tw:divide-y tw:divide-divider tw:rounded-xl tw:border tw:border-divider">
      <div v-for="r in reports" :key="r.id" class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2">
        <IconFileTypePdf :size="18" class="tw:shrink-0 tw:text-red-500" />
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseText class="tw:truncate tw:text-sm tw:font-medium">{{ r.title }}</BaseText>
            <BaseBadge :class="KIND_CLASS[r.kind] || ''">{{ r.kind }}</BaseBadge>
          </div>
          <BaseText color="secondary" class="tw:text-xs">
            {{ r.reportDate ? r.reportDate.formatDate('date') : '—' }} · {{ userName(r.uploadedBy) }}
            <template v-if="r.aiParsedAt"> · findings extracted</template>
          </BaseText>
        </div>
        <BaseButton
          v-if="canUseAi && !readonly"
          variant="outline"
          size="sm"
          :isLoading="extracting === r.id"
          @click="startExtract(r)"
        >
          <template #icon><IconSparkles :size="14" /></template>
          {{ r.aiParsedAt ? 'Re-extract findings' : 'Extract findings' }}
        </BaseButton>
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
  </div>
</template>
