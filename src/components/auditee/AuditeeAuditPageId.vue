<script setup>
/**
 * Certification audit detail — the AUDITEE's view of being audited.
 *
 * Tabs (user spec 2026-08-24):
 *   Information — metadata + the AGENDA the auditing body sent (uploaded PDF
 *                 and/or the company's own notes; no clause picker, no email —
 *                 the registrar is not a recipient in this system).
 *   Reports     — the registrar's interim/final PDFs; each row: Summary,
 *                 Findings, OFI. No Requirements tab: the auditing body works
 *                 from ITS copy of the standard.
 *   Findings    — NC/observation findings from the reports (existing panel;
 *                 findings→CAPA linkage tracks remediation to closure).
 *   OFI         — the same records filtered to OFI type.
 *
 * Deliberately a CLONE of the auditor page's skeleton, not a branch inside
 * it — the two flows share a table, not a UX.
 */
import {
  IconClipboardCheck,
  IconInfoCircle,
  IconFileTypePdf,
  IconBolt,
  IconBulb,
  IconBuilding,
  IconUsers,
  IconPlayerPlay,
  IconBan,
  IconCalendarEvent,
  IconCertificate,
  IconNotes,
  IconShieldCheck,
  IconUpload,
  IconTrash,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { patch, post, del } from '@/api'
import { uploadFile } from '@/composables/useFileUpload.js'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()

const auditInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.AuditInstance.findByPk(id),
  { models: ['AuditInstance'] },
)
const loading = computed(() => auditInstance.value === undefined)

const canUpdate = computed(() => isAllowed(['audit_management:update']))
const isEditable = computed(
  () =>
    canUpdate.value &&
    !['COMPLETED', 'CLOSED', 'CANCELLED'].includes(auditInstance.value?.statusId),
)

const tab = ref('info')

// Per-report jumps from the Reports tab land pre-filtered; 'ALL' shows the
// accumulated picture across every report.
const findingsReportFilter = ref('ALL')
const ofiReportFilter = ref('ALL')

function goFindings(reportId) {
  findingsReportFilter.value = reportId || 'ALL'
  tab.value = 'findings'
}
function goOfi(reportId) {
  ofiReportFilter.value = reportId || 'ALL'
  tab.value = 'ofi'
}
function goSummary() {
  tab.value = 'summary'
}

// ── Summary tab: every report's summary, editable in place ─────────────────
const summaryReports = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => {
    const rows = await db.AuditReport.where('auditInstanceId', instanceId)
      .orderBy('reportDate', 'desc')
      .exec()
    return rows.filter((r) => r.kind !== 'CERTIFICATE')
  },
  { models: ['AuditReport'], initial: [] },
)
const summaryBuffers = ref({})
const savingSummaryId = ref(null)
const debouncedSummarySave = useDebounceFn(async () => {
  const entries = Object.entries(summaryBuffers.value)
  summaryBuffers.value = {}
  for (const [reportId, notes] of entries) {
    savingSummaryId.value = reportId
    try {
      await patch(`/v1/services/auditInstances/${props.id}/reports/${reportId}`, {
        notes: notes || null,
      })
    } catch (e) {
      toast.error(e.message || 'Failed to save summary')
    } finally {
      savingSummaryId.value = null
    }
  }
}, 800)
function stageSummary(reportId, notes) {
  summaryBuffers.value[reportId] = notes
  debouncedSummarySave()
}

// ── Lifecycle (simple flips — no close-out workflow in the auditee flow) ────
const transitioning = ref(false)
async function setStatus(statusId, okMsg) {
  if (!auditInstance.value?.id || transitioning.value) return
  transitioning.value = true
  try {
    await patch(`/v1/services/auditInstances/${auditInstance.value.id}`, { statusId })
    toast.success(okMsg)
    showCancelDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to update audit')
  } finally {
    transitioning.value = false
  }
}
const showCancelDialog = ref(false)

// ── Inline autosave: scope / objectives / scheduled date / auditing body ────
const patchBuffers = ref({})
const savingPatch = ref(false)
const debouncedPatch = useDebounceFn(async () => {
  const body = { ...patchBuffers.value }
  patchBuffers.value = {}
  if (!Object.keys(body).length || !auditInstance.value?.id) return
  savingPatch.value = true
  try {
    await patch(`/v1/services/auditInstances/${auditInstance.value.id}`, body)
  } catch (e) {
    toast.error(e.message || 'Failed to save')
  } finally {
    savingPatch.value = false
  }
}, 600)
function stage(field, value) {
  if (!isEditable.value) return
  patchBuffers.value[field] = value
  debouncedPatch()
}

// ── Agenda (auditee flavor): uploaded PDF + own notes, saved on the record ──
const agendaNotes = ref('')
const agendaLoadedFor = ref(null)
watch(
  () => auditInstance.value?.id,
  () => {
    if (auditInstance.value && agendaLoadedFor.value !== auditInstance.value.id) {
      agendaNotes.value = auditInstance.value.agenda?.notes || ''
      agendaLoadedFor.value = auditInstance.value.id
    }
  },
  { immediate: true },
)
const savingAgenda = ref(false)
const debouncedAgenda = useDebounceFn(async () => {
  if (!auditInstance.value?.id) return
  savingAgenda.value = true
  try {
    await patch(`/v1/services/auditInstances/${auditInstance.value.id}`, {
      agenda: { ...(auditInstance.value.agenda || {}), notes: agendaNotes.value || null },
    })
  } catch (e) {
    toast.error(e.message || 'Failed to save agenda notes')
  } finally {
    savingAgenda.value = false
  }
}, 800)

const agendaFileInput = ref(null)
const uploadingAgenda = ref(false)
async function onAgendaFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploadingAgenda.value = true
  try {
    const up = await uploadFile(file, 'ASSET')
    if (!up.success || !up.asset?.id) throw new Error(up.error || 'Upload failed')
    await patch(`/v1/services/auditInstances/${auditInstance.value.id}`, {
      agenda: {
        ...(auditInstance.value.agenda || {}),
        assetId: up.asset.id,
        assetName: file.name,
      },
    })
    toast.success('Agenda uploaded')
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploadingAgenda.value = false
  }
}
const agendaAsset = useLiveQueryWithDeps(
  [() => auditInstance.value?.agenda?.assetId],
  async (db, [assetId]) => (assetId ? db.Asset.findByPk(assetId) : null),
  { models: ['Asset'] },
)

// ── Team (Lead POC + involved people) ───────────────────────────────────────
const teamMembers = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const rows = await db.AuditTeamMember.where('auditInstanceId', instanceId).exec()
    return rows.sort((a, b) => {
      if (a.roleOnAudit !== b.roleOnAudit) return a.roleOnAudit === 'LEAD' ? -1 : 1
      return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
    })
  },
  { models: ['AuditTeamMember'], initial: [] },
)
const addMemberUserId = ref(null)
async function addMember() {
  if (!addMemberUserId.value) return
  try {
    await post(`/v1/services/auditInstances/${props.id}/team`, {
      userId: addMemberUserId.value,
      roleOnAudit: 'TEAM',
    })
    addMemberUserId.value = null
  } catch (e) {
    toast.error(e.message || 'Failed to add person')
  }
}
async function removeMember(member) {
  if (!isEditable.value) return
  try {
    await del(`/v1/services/auditInstances/${props.id}/team/${member.id}`)
  } catch (e) {
    toast.error(e.message || 'Failed to remove person')
  }
}

// ── Standard label ──────────────────────────────────────────────────────────
const standard = useLiveQueryWithDeps(
  [() => auditInstance.value?.auditStandardId],
  async (db, [sid]) => (sid ? db.AuditStandard.findByPk(sid) : null),
  { models: ['AuditStandard'] },
)

// ── Detail config ───────────────────────────────────────────────────────────
const detailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    // 'wide' (96rem cap): fluid below the cap, so a laptop still fills edge
    // to edge while a big monitor gets a wider column than 'standard' (80rem)
    // without going full-bleed — the readiness dashboard and report rows use
    // the room.
    width: 'wide',
    breadcrumbs: [
      { label: 'Auditee', to: getCompanyPath('/auditee') },
      { label: auditInstance.value?.auditNumber || 'Audit' },
    ],
    actions: [
      {
        id: 'start',
        label: 'Start Audit',
        icon: IconPlayerPlay,
        variant: 'primary',
        priority: 50,
        visible:
          isEditable.value && ['DRAFT', 'SCHEDULED'].includes(auditInstance.value?.statusId),
        loading: transitioning.value,
        onSelect: () => setStatus('IN_PROGRESS', 'Audit started'),
      },
      {
        id: 'complete',
        label: 'Mark Completed',
        icon: IconClipboardCheck,
        variant: 'secondary',
        priority: 40,
        visible: isEditable.value && auditInstance.value?.statusId === 'IN_PROGRESS',
        loading: transitioning.value,
        // Server-gated: refuses while any finding is still open.
        onSelect: () => setStatus('COMPLETED', 'Audit completed'),
      },
      {
        id: 'cancel',
        label: 'Cancel',
        icon: IconBan,
        variant: 'danger',
        priority: 10,
        visible: isEditable.value,
        onSelect: () => (showCancelDialog.value = true),
      },
    ],
    tabs: [
      { value: 'info', label: 'Information', icon: IconInfoCircle, mode: 'panel', lazy: false },
      {
        value: 'readiness',
        label: 'Readiness',
        icon: IconShieldCheck,
        mode: 'panel',
        lazy: false,
      },
      { value: 'reports', label: 'Reports', icon: IconFileTypePdf, mode: 'panel', lazy: false },
      { value: 'summary', label: 'Summary', icon: IconNotes, mode: 'panel', lazy: false },
      { value: 'findings', label: 'Findings', icon: IconBolt, mode: 'panel', lazy: false },
      { value: 'ofi', label: 'OFI', icon: IconBulb, mode: 'panel', lazy: false },
      {
        value: 'certificate',
        label: 'Certificate',
        icon: IconCertificate,
        mode: 'panel',
        lazy: false,
      },
    ],
  }),
)
</script>

<template>
  <BaseDetailLayout
    v-model:tab="tab"
    :config="detailConfig"
    :record="auditInstance"
    :loading="loading"
    :notFound="!loading && !auditInstance"
    notFoundTitle="Audit not found"
    notFoundDescription="This external audit could not be found."
  >
    <template #title>
      <span class="tw:inline-flex tw:items-center tw:gap-1.5">
        {{ auditInstance?.auditNumber || 'External Audit' }}
        <HelpButton slug="KB/quality/audits-auditee" :size="15" />
      </span>
    </template>

    <template #status>
      <AuditInstanceStatusBadgeById v-if="auditInstance" :statusId="auditInstance.statusId" />
    </template>

    <template v-if="auditInstance" #meta>
      <span>{{ auditInstance.externalAuditFirm || 'External audit' }}</span>
      <template v-if="auditInstance.scheduledDate">
        · Scheduled {{ auditInstance.scheduledDate.formatDate('date') }}
      </template>
    </template>

    <!-- Information -->
    <template v-if="auditInstance" #tab-info>
      <FormSection title="Details" :icon="IconInfoCircle">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div>
            <BaseLabel>Scope</BaseLabel>
            <BaseRichTextEditor
              v-if="isEditable"
              :modelValue="auditInstance.scope || ''"
              placeholder="What's in scope?"
              @update:modelValue="(v) => stage('scope', v)"
            />
            <div v-else class="tw:text-sm tw:text-on-main" v-html="auditInstance.scope || '—'" />
          </div>
          <div>
            <BaseLabel>Objectives</BaseLabel>
            <BaseRichTextEditor
              v-if="isEditable"
              :modelValue="auditInstance.objectives || ''"
              placeholder="What should this audit achieve?"
              @update:modelValue="(v) => stage('objectives', v)"
            />
            <div
              v-else
              class="tw:text-sm tw:text-on-main"
              v-html="auditInstance.objectives || '—'"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Agenda" :icon="IconCalendarEvent">
        <p class="tw:text-xs tw:text-secondary tw:mb-3">
          The auditing body sends the agenda — upload it here, and keep your own preparation notes
          beside it.
        </p>
        <div class="tw:flex tw:items-center tw:gap-2 tw:mb-3">
          <BaseButton
            v-if="isEditable"
            variant="outline"
            size="sm"
            :isLoading="uploadingAgenda"
            @click="agendaFileInput?.click()"
          >
            <template #icon><IconUpload :size="14" /></template>
            {{ auditInstance.agenda?.assetId ? 'Replace agenda file' : 'Upload agenda' }}
          </BaseButton>
          <input ref="agendaFileInput" type="file" hidden @change="onAgendaFile" />
          <a
            v-if="agendaAsset?.url"
            :href="agendaAsset.url"
            target="_blank"
            rel="noopener"
            class="tw:text-sm tw:text-primary tw:hover:underline"
          >
            {{ auditInstance.agenda?.assetName || 'Agenda file' }}
          </a>
        </div>
        <BaseTextarea
          v-if="isEditable"
          v-model="agendaNotes"
          :rows="4"
          placeholder="Preparation notes — who meets the auditor, room bookings, opening meeting time…"
          @update:modelValue="debouncedAgenda"
        />
        <p v-else-if="agendaNotes" class="tw:text-sm tw:whitespace-pre-line">{{ agendaNotes }}</p>
        <BaseText v-if="savingAgenda" color="secondary" class="tw:text-xs tw:mt-1">Saving…</BaseText>
      </FormSection>
    </template>

    <!-- Readiness: the company-wide gap dashboard, in context — what an
         auditor would find TODAY, before this one arrives. Same dashboard as
         the sidebar entry; here it sits next to the audit being prepared. -->
    <template v-if="auditInstance" #tab-readiness>
      <FormSection title="Audit Readiness" :icon="IconShieldCheck">
        <AuditReadinessDashboard />
      </FormSection>
    </template>

    <!-- Reports -->
    <template v-if="auditInstance" #tab-reports>
      <FormSection title="Auditor Reports" :icon="IconFileTypePdf">
        <AuditeeReportsPanel
          :auditInstance="auditInstance"
          :readonly="!isEditable"
          @goFindings="goFindings"
          @goOfi="goOfi"
          @goSummary="goSummary"
        />
      </FormSection>
    </template>

    <!-- Summary: what each report concluded — AI-drafted, human-owned -->
    <template v-if="auditInstance" #tab-summary>
      <FormSection title="Report Summaries" :icon="IconNotes">
        <p class="tw:text-xs tw:text-secondary tw:mb-3">
          One summary per auditor report — accept the AI draft from the Reports tab, then edit it
          here any time.
        </p>
        <div v-if="!summaryReports.length" class="tw:text-sm tw:text-secondary">
          No reports yet — upload the auditing body's report on the Reports tab first.
        </div>
        <div v-else class="tw:flex tw:flex-col tw:gap-4">
          <div
            v-for="r in summaryReports"
            :key="r.id"
            class="tw:rounded-xl tw:border tw:border-divider tw:p-3"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-2">
              <BaseText class="tw:text-sm tw:font-medium">{{ r.title }}</BaseText>
              <BaseBadge
                :class="
                  r.kind === 'FINAL'
                    ? 'tw:bg-emerald-100 tw:text-emerald-700'
                    : 'tw:bg-sky-100 tw:text-sky-700'
                "
              >
                {{ r.kind }}
              </BaseBadge>
              <BaseText color="secondary" class="tw:text-xs">
                {{ r.reportDate ? r.reportDate.formatDate('date') : '' }}
              </BaseText>
              <BaseText
                v-if="savingSummaryId === r.id"
                color="secondary"
                class="tw:text-xs tw:ml-auto"
              >
                Saving…
              </BaseText>
            </div>
            <BaseTextarea
              v-if="isEditable"
              :modelValue="r.notes || ''"
              :rows="4"
              placeholder="What this report concluded — accept the AI draft on the Reports tab, or write your own."
              @update:modelValue="(v) => stageSummary(r.id, v)"
            />
            <p v-else-if="r.notes" class="tw:text-sm tw:whitespace-pre-line">{{ r.notes }}</p>
            <p v-else class="tw:text-sm tw:text-secondary">No summary yet.</p>
          </div>
        </div>
      </FormSection>
    </template>

    <!-- Findings (existing panel; OFIs live on their own tab) -->
    <template v-if="auditInstance" #tab-findings>
      <FormSection title="Findings" :icon="IconBolt">
        <AuditFindingsPanel
          v-model:reportFilter="findingsReportFilter"
          :auditInstance="auditInstance"
          :readonly="!isEditable"
          :typeFilter="['MAJOR_NC', 'MINOR_NC', 'OBSERVATION']"
        />
      </FormSection>
    </template>

    <template v-if="auditInstance" #tab-certificate>
      <FormSection title="Audit Certificate" :icon="IconCertificate">
        <p class="tw:text-xs tw:text-secondary tw:mb-3">
          Once findings are addressed and the auditing body issues the certificate, keep it here —
          the next audit starts by showing the last one passed.
        </p>
        <AuditeeReportsPanel
          :auditInstance="auditInstance"
          :readonly="!isEditable"
          :certificateMode="true"
        />
      </FormSection>
    </template>

    <template v-if="auditInstance" #tab-ofi>
      <FormSection title="Opportunities for Improvement" :icon="IconBulb">
        <AuditFindingsPanel
          v-model:reportFilter="ofiReportFilter"
          :auditInstance="auditInstance"
          :readonly="!isEditable"
          :typeFilter="['OFI']"
          defaultTypeId="OFI"
        />
      </FormSection>
    </template>

    <!-- Rail -->
    <template v-if="auditInstance" #rail>
      <BaseRailCard title="Overview" grid>
        <BaseDetailField label="Audit Number">
          <span class="tw:text-xs tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded">
            {{ auditInstance.auditNumber || '—' }}
          </span>
        </BaseDetailField>
        <BaseDetailField label="Standard" :value="standard?.name || '—'" />
        <BaseDetailField label="Scheduled">
          <BaseTextInput
            v-if="isEditable"
            :modelValue="
              auditInstance.scheduledDate ? auditInstance.scheduledDate.toFormat('yyyy-MM-dd') : ''
            "
            type="date"
            size="sm"
            @update:modelValue="(v) => stage('scheduledDate', v)"
          />
          <span v-else>{{
            auditInstance.scheduledDate ? auditInstance.scheduledDate.formatDate('date') : '—'
          }}</span>
        </BaseDetailField>
        <BaseDetailField label="Site">
          <SiteBadgeById v-if="auditInstance.siteId" :siteId="auditInstance.siteId" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </BaseDetailField>
      </BaseRailCard>

      <BaseRailCard title="Auditing Body" :icon="IconBuilding">
        <div class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
          <BaseDetailField label="Firm / registrar">
            <BaseTextInput
              v-if="isEditable"
              :modelValue="auditInstance.externalAuditFirm || ''"
              size="sm"
              placeholder="e.g. BSI, TÜV SÜD"
              @update:modelValue="(v) => stage('externalAuditFirm', v)"
            />
            <BaseText v-else>{{ auditInstance.externalAuditFirm || '—' }}</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Auditor">
            <BaseTextInput
              v-if="isEditable"
              :modelValue="auditInstance.externalAuditorName || ''"
              size="sm"
              placeholder="Lead auditor's name"
              @update:modelValue="(v) => stage('externalAuditorName', v)"
            />
            <BaseText v-else>{{ auditInstance.externalAuditorName || '—' }}</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Email">
            <BaseTextInput
              v-if="isEditable"
              :modelValue="auditInstance.externalAuditorEmail || ''"
              size="sm"
              type="email"
              placeholder="name@registrar.com"
              @update:modelValue="(v) => stage('externalAuditorEmail', v)"
            />
            <a
              v-else-if="auditInstance.externalAuditorEmail"
              :href="`mailto:${auditInstance.externalAuditorEmail}`"
              class="tw:text-primary hover:tw:underline"
              >{{ auditInstance.externalAuditorEmail }}</a
            >
            <BaseText v-else>—</BaseText>
          </BaseDetailField>
          <BaseDetailField label="Phone">
            <BaseTextInput
              v-if="isEditable"
              :modelValue="auditInstance.externalAuditorPhone || ''"
              size="sm"
              placeholder="+1 …"
              @update:modelValue="(v) => stage('externalAuditorPhone', v)"
            />
            <BaseText v-else>{{ auditInstance.externalAuditorPhone || '—' }}</BaseText>
          </BaseDetailField>
        </div>
        <BaseText v-if="savingPatch" color="secondary" class="tw:text-xs tw:mt-2">Saving…</BaseText>
      </BaseRailCard>

      <BaseRailCard title="Our People" :icon="IconUsers">
        <div class="tw:flex tw:flex-col tw:gap-1.5">
          <div
            v-for="member in teamMembers"
            :key="member.id"
            class="tw:flex tw:items-center tw:gap-2"
          >
            <UserBadgeById :userId="member.userId" class="tw:flex-1 tw:min-w-0" />
            <BaseBadge
              v-if="member.roleOnAudit === 'LEAD'"
              class="tw:bg-primary/10 tw:text-primary"
            >
              Lead POC
            </BaseBadge>
            <button
              v-if="isEditable && member.roleOnAudit !== 'LEAD'"
              type="button"
              class="tw:text-secondary tw:hover:text-red-600 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:flex tw:items-center"
              :aria-label="`Remove person`"
              @click="removeMember(member)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
          <p v-if="!teamMembers.length" class="tw:text-xs tw:text-secondary">
            No one assigned yet.
          </p>
          <div v-if="isEditable" class="tw:flex tw:items-center tw:gap-1.5 tw:mt-1">
            <UserSelectMenu v-model="addMemberUserId" class="tw:flex-1" />
            <BaseButton size="sm" variant="outline" :disabled="!addMemberUserId" @click="addMember">
              Add
            </BaseButton>
          </div>
        </div>
      </BaseRailCard>
    </template>
  </BaseDetailLayout>

  <BaseDialog v-model="showCancelDialog" title="Cancel Audit" maxWidth="md">
    <p class="tw:text-sm tw:text-on-main tw:mb-3">
      Cancel <strong>{{ auditInstance?.auditNumber }}</strong
      >? Findings and reports already recorded stay on file.
    </p>
    <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
      <BaseButton variant="outline" :disabled="transitioning" @click="showCancelDialog = false">
        Keep audit
      </BaseButton>
      <BaseButton
        variant="danger"
        :isLoading="transitioning"
        @click="setStatus('CANCELLED', 'Audit cancelled')"
      >
        Cancel audit
      </BaseButton>
    </div>
  </BaseDialog>
</template>
