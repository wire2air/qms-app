<script setup>
import {
  buildComplaintBanners,
  buildComplaintSections,
  buildComplaintActions,
} from './customerComplaintDetailConfig.js'
import { isAllowed, isVerbAllowed, currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { useRecordTrail } from '@/composables/useRecordTrail.js'
import { TICKETS_PATH } from '@/utils/supportDeskPaths.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const { visit: visitTrail } = useRecordTrail()

const complaint = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.CustomerComplaint.findByPk(id),
  { models: ['CustomerComplaint'] },
)
watch(
  complaint,
  (c) => {
    if (c?.id)
      visitTrail({ type: 'Complaint', id: c.id, label: c.complaintNumber, path: route.path })
  },
  { immediate: true },
)

const loading = computed(() => complaint.value === undefined)

const breadcrumbs = computed(() => [
  { label: 'Tickets', to: getCompanyPath(TICKETS_PATH) },
  {
    label:
      complaint.value?.complaintNumber ||
      complaint.value?.subject ||
      (complaint.value === null ? 'Not found' : 'Loading…'),
  },
])

const canUpdate = computed(() => isAllowed(['complaint_management:update']))
const canConvert = computed(
  () => isAllowed(['complaint_management:update']) && isAllowed(['ncr:create']),
)

const isTerminal = computed(() => ['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.value?.statusId))
// Closed/converted complaints are immutable — a customer reply (or an
// explicit Reopen) is the only way back.
const isEditable = computed(() => complaint.value && !isTerminal.value && canUpdate.value)

// ─── Inline edit auto-save (subject / description / priority / customer) ─────
const { saveError } = useAutoSave(complaint)

const editingSubject = ref(false)
const editingDescription = ref(false)
const editingCustomer = ref(false)

// ─── Lifecycle action RPCs ────────────────────────────────────────────────────
const acting = ref(false)

async function runAction(path, body = {}) {
  acting.value = true
  saveError.value = null
  try {
    await post(`/v1/services/customerComplaints/${props.id}/${path}`, body)
  } catch (e) {
    saveError.value = e.message || 'Action failed'
    toast.notify({ type: 'negative', message: saveError.value })
  } finally {
    acting.value = false
  }
}

const showAssignDialog = ref(false)
const assignUserId = ref(null)

// ── Support Desk inbox actions (spec §3): take over, snooze, spam-learn ──────
// These hit /v1/services/supportDesk/tickets/:id/* (action RPCs, CLAUDE.md
// rule #4 exception); the sync push refreshes the ticket afterwards.
const currentUserId = computed(() => currentSession.value?.userId ?? null)
const heldByOther = computed(
  () => !!complaint.value?.assignedTo && complaint.value.assignedTo !== currentUserId.value,
)
const canTakeOver = computed(() => isVerbAllowed('complaint_management', 'takeover'))
const isSnoozed = computed(() => {
  const t = complaint.value?.snoozedUntil
  return !!t && (t.toMillis ? t.toMillis() : new Date(t).getTime()) > Date.now()
})
const snoozedUntilLabel = computed(() =>
  isSnoozed.value ? complaint.value.snoozedUntil?.formatDate?.('datetime') : null,
)
async function deskAction(path, body = {}) {
  acting.value = true
  saveError.value = null
  try {
    const res = await post(`/v1/services/supportDesk/tickets/${props.id}/${path}`, body)
    return res
  } catch (e) {
    saveError.value = e.message || 'Action failed'
    toast.error(saveError.value)
    return null
  } finally {
    acting.value = false
  }
}
// Chat presence/state (spec §4.3). `now` ticks so "visitor online" expires
// without a re-render from sync.
const nowTick = ref(Date.now())
const tick = setInterval(() => (nowTick.value = Date.now()), 15_000)
onBeforeUnmount(() => clearInterval(tick))
const visitorOnline = computed(() => {
  const t = complaint.value?.visitorLastSeenAt
  return !!t && nowTick.value - (t.toMillis ? t.toMillis() : new Date(t).getTime()) < 120_000
})
const chatStateClass = computed(
  () =>
    ({
      WAITING: 'tw:bg-amber-50 tw:text-amber-700',
      ACTIVE: 'tw:bg-green-50 tw:text-green-700',
      IDLE: 'tw:bg-gray-100 tw:text-secondary',
      ENDED: 'tw:bg-gray-100 tw:text-secondary',
    })[complaint.value?.chatState] || 'tw:bg-amber-50 tw:text-amber-700',
)
async function endChat() {
  const ok = await confirm({
    title: 'End this chat?',
    message:
      'The visitor sees the closing message and rating prompt; the ticket is resolved. They can start a new chat any time.',
    okLabel: 'End chat',
  })
  if (!ok) return
  if (await deskAction('endChat')) toast.success('Chat ended')
}

async function takeOver() {
  const ok = await confirm({
    title: 'Take over this ticket?',
    message: 'The current assignee will be notified and the hand-over is recorded on the thread.',
    okLabel: 'Take over',
  })
  if (!ok) return
  if (await deskAction('takeOver')) toast.success('You now hold this ticket')
}

const showSnoozeDialog = ref(false)
const snoozeUntil = ref(null)
const SNOOZE_PRESETS = [
  { label: '1 hour', pick: () => DateTime.now().plus({ hours: 1 }) },
  {
    label: 'This afternoon (3 pm)',
    pick: () => DateTime.now().set({ hour: 15, minute: 0, second: 0 }),
  },
  {
    label: 'Tomorrow 9 am',
    pick: () => DateTime.now().plus({ days: 1 }).set({ hour: 9, minute: 0, second: 0 }),
  },
  {
    label: 'Next Monday 9 am',
    pick: () =>
      DateTime.now().plus({ weeks: 1 }).set({ weekday: 1, hour: 9, minute: 0, second: 0 }),
  },
]
function openSnooze() {
  snoozeUntil.value = null
  showSnoozeDialog.value = true
}
async function submitSnooze() {
  const dt = snoozeUntil.value?.toISO
    ? snoozeUntil.value
    : DateTime.fromJSDate(new Date(snoozeUntil.value))
  if (!dt?.isValid || dt <= DateTime.now()) {
    toast.error('Pick a time in the future')
    return
  }
  if (await deskAction('snooze', { until: dt.toISO() })) {
    showSnoozeDialog.value = false
    toast.success(`Snoozed until ${dt.formatDate('datetime')}`)
  }
}
async function unsnooze() {
  if (await deskAction('snooze', { until: null })) toast.success('Back in the inbox')
}

const showSpamDialog = ref(false)
const spamLearn = ref({ email: true, domain: false, allBrands: false })
function openSpam() {
  spamLearn.value = { email: !!complaint.value?.customerEmail, domain: false, allBrands: false }
  showSpamDialog.value = true
}
async function submitSpam() {
  const res = await deskAction('spam', { learn: spamLearn.value })
  if (res) {
    showSpamDialog.value = false
    const n = res.learned?.length ?? 0
    toast.success(
      n ? `Marked as spam — ${n} sender rule${n === 1 ? '' : 's'} learned` : 'Marked as spam',
    )
  }
}
async function unspam() {
  if (await deskAction('unspam', { forget: true }))
    toast.success('Restored — learned rules removed')
}
const senderDomain = computed(() => {
  const e = complaint.value?.customerEmail || ''
  const at = e.lastIndexOf('@')
  return at >= 0 ? e.slice(at + 1).toLowerCase() : ''
})

async function handleAssign() {
  if (!assignUserId.value) return
  await runAction('assign', { userId: assignUserId.value })
  showAssignDialog.value = false
}

const showCloseDialog = ref(false)
const closeComment = ref('')

async function handleClose() {
  await runAction('close', { comment: closeComment.value.trim() || null })
  showCloseDialog.value = false
}

// ─── Escalate to Quality (Support → QMS bridge) ──────────────────────────────
const showEscalateDialog = ref(false)
const escalateNote = ref('')
const qaLink = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [ticketId]) => {
    const rows = await db.RecordLink.where('[fromType+fromId]', [
      'CustomerComplaint',
      ticketId,
    ]).exec()
    return rows.find((l) => l.toType === 'Complaint') || null
  },
  { models: ['RecordLink'], initial: null },
)
const qaComplaint = useLiveQueryWithDeps(
  [() => qaLink.value?.toId ?? null],
  async (db, [qid]) => (qid ? db.Complaint.findByPk(qid) : null),
  { models: ['Complaint'], initial: null },
)
async function submitEscalate() {
  const res = await deskAction('escalate', { note: escalateNote.value.trim() || null })
  if (res) {
    showEscalateDialog.value = false
    toast.success(`Escalated to Quality as ${res.complaint?.complaintNumber || 'a complaint'}`)
  }
}

// ─── Convert to NC ────────────────────────────────────────────────────────────
const showConvertDialog = ref(false)

function onConverted(ncId) {
  showConvertDialog.value = false
  router.push(getCompanyPath(`/nonconformances/${ncId}`))
}

// ─── Linked NCs (record_links: CustomerComplaint → Nonconformance) ────────────
// Was nc_source_links — a duplicate of record_links that the convert action
// wrote in the same loop. Dropped 2026-08-17; record_links is the one table
// that carries lineage for every module.
const ncLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    const rows = await db.RecordLink.where('[fromType+fromId]', [
      'CustomerComplaint',
      complaintId,
    ]).exec()
    return rows.filter((l) => l.toType === 'Nonconformance')
  },

  { models: ['RecordLink'], initial: [] },
)

const linkedNcIdList = computed(() => ncLinks.value.map((l) => l.toId).join(','))
const linkedNcs = useLiveQueryWithDeps(
  [() => linkedNcIdList.value],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const rows = await Promise.all(ids.map((id) => db.Nonconformance.findByPk(id)))
    return rows.filter(Boolean)
  },

  { models: ['Nonconformance'], initial: [] },
)

// ─── Audit log ────────────────────────────────────────────────────────────────
const showAuditLog = ref(false)
const auditIncludeEntities = computed(() => [
  { entityType: 'CustomerComplaint', entityIds: [props.id] },
  { entityType: 'CustomerComplaints', entityIds: [props.id] },
])

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const complaintBanners = computed(() =>
  buildComplaintBanners(complaint.value, {
    isEditable: isEditable.value,
    snoozedUntilLabel: snoozedUntilLabel.value,
  }),
)
const complaintSections = computed(() => buildComplaintSections(complaint.value))
const complaintActions = computed(() =>
  buildComplaintActions(
    {
      isEditable: isEditable.value,
      canUpdate: canUpdate.value,
      canConvert: canConvert.value,
      statusId: complaint.value?.statusId,
      acting: acting.value,
      hasAssignee: !!complaint.value?.assignedTo,
      canViewAuditTrail: isAllowed(['audit_trail:read']),
      canTakeOver: canTakeOver.value,
      heldByOther: heldByOther.value,
      isSpam: !!complaint.value?.isSpam,
      isSnoozed: isSnoozed.value,
      isLiveChat: complaint.value?.channelKind === 'CHAT' && complaint.value?.chatState !== 'ENDED',
      escalatedTo: qaComplaint.value?.complaintNumber || (qaLink.value ? 'Quality' : null),
    },
    {
      openEscalate() {
        escalateNote.value = ''
        showEscalateDialog.value = true
      },
      endChat,
      takeOver,
      openSnooze,
      unsnooze,
      openSpam,
      unspam,
      accept() {
        runAction('accept')
      },
      openAssign() {
        assignUserId.value = complaint.value?.assignedTo
        showAssignDialog.value = true
      },
      resolve() {
        runAction('resolve')
      },
      hold() {
        runAction('hold')
      },
      openClose() {
        showCloseDialog.value = true
      },
      reopen() {
        runAction('reopen')
      },
      openConvert() {
        showConvertDialog.value = true
      },
      openAudit() {
        showAuditLog.value = true
      },
    },
  ),
)

const complaintDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => complaintBanners.value,
    actions: complaintActions.value,
    sections: complaintSections.value,
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="complaintDetailConfig"
    :record="complaint"
    :loading="loading"
    :notFound="!loading && !complaint"
    notFoundTitle="Complaint not found"
    notFoundDescription="This customer complaint could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingSubject && isEditable"
        v-model="complaint.subject"
        placeholder="Subject"
        autofocus
        class="tw:mb-2"
        @blur="editingSubject = false"
      />
      <div
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2"
        :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
        @click="isEditable && (editingSubject = true)"
      >
        {{ complaint?.subject }}
      </div>
    </template>

    <template #status>
      <CustomerComplaintStatusBadgeById v-if="complaint" :statusId="complaint.statusId" />
    </template>

    <template v-if="complaint" #meta>
      <span class="">{{ complaint.complaintNumber }}</span>
      <template v-if="complaint.sourceId">
        · <CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" />
      </template>
      <!-- Live chat: state + whether the visitor still has the widget open
           (seen within the last 2 minutes — the widget polls every 3 s). -->
      <template v-if="complaint.channelKind === 'CHAT'">
        ·
        <span
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:px-1.5 tw:py-0.5 tw:text-micro"
          :class="chatStateClass"
        >
          Chat · {{ (complaint.chatState || 'WAITING').toLowerCase() }}
        </span>
        <span
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro"
          :class="visitorOnline ? 'tw:text-green-700' : 'tw:text-secondary'"
          :title="
            complaint.visitorLastSeenAt
              ? `Visitor last seen ${complaint.visitorLastSeenAt.formatDate('datetime')}`
              : ''
          "
        >
          <span
            class="tw:inline-block tw:h-2 tw:w-2 tw:rounded-full"
            :class="visitorOnline ? 'tw:bg-green-500' : 'tw:bg-gray-400'"
          />
          {{ visitorOnline ? 'visitor online' : 'visitor away' }}
        </span>
      </template>
      <template v-if="complaint.createdAt">
        · {{ complaint.createdAt.formatDate('date') }}
      </template>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="complaintActions" />
        <AskAiButton
          v-if="complaint?.id"
          entityType="CustomerComplaint"
          :entityId="complaint.id"
          :entityTitle="complaint.subject"
          :entityNumber="complaint.complaintNumber"
        />
      </div>
    </template>

    <template v-if="complaint" #section-details>
      <RecordTrailBreadcrumb />
      <div
        v-if="saveError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm"
      >
        {{ saveError }}
      </div>

      <!-- Ticket information -->
      <FormSection title="Ticket information">
        <BaseTextarea
          v-if="editingDescription && isEditable"
          v-model="complaint.description"
          placeholder="Description…"
          :rows="4"
          class="tw:mb-2"
          @blur="editingDescription = false"
        />
        <div v-else class="tw:mb-2" @click="isEditable && (editingDescription = true)">
          <p
            class="tw:text-sm tw:text-secondary tw:leading-relaxed tw:whitespace-pre-wrap"
            :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
          >
            {{ complaint.description || (isEditable ? 'Add a description…' : '—') }}
          </p>
        </div>
      </FormSection>

      <!-- Form submission data (web-form tickets only; self-hides) -->
      <CustomerComplaintFormPanel
        :formId="complaint.formId"
        :formSnapshot="complaint.formSnapshot"
        :customFields="complaint.customFields"
        :editable="isEditable"
        @update:customFields="(v) => (complaint.customFields = v)"
      />

      <!-- Conversation timeline -->
      <CustomerComplaintConversation
        :complaintId="id"
        :canReply="isEditable"
        :customerEmail="complaint.customerEmail"
        :customerName="complaint.customerName"
        :complaintNumber="complaint.complaintNumber"
      />

      <!-- QA Investigation — internal QA notes, separate from the conversation. -->
      <CustomerComplaintQaNotes :complaintId="id" :canUpdate="isEditable" />

      <!-- Attachments -->
      <CustomerComplaintAttachmentsPanel :complaintId="id" :canUpdate="isEditable" />
    </template>

    <template v-if="complaint" #rail>
      <!-- 1. General -->
      <BaseRailCard title="General" grid>
        <BaseDetailField label="Ticket number">
          <BaseText variant="body" weight="medium" class="tw:break-words">
            {{ complaint.complaintNumber || '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField label="Status">
          <CustomerComplaintStatusBadgeById :statusId="complaint.statusId" />
        </BaseDetailField>
        <BaseDetailField label="Source">
          <CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" />
        </BaseDetailField>
      </BaseRailCard>

      <!-- Admin-defined custom fields (self-hides when none configured). -->
      <CustomFieldsCard entityType="CustomerComplaint" :entityId="id" :editable="isEditable" />

      <!-- 2. Assignment -->
      <BaseRailCard title="Assignment" grid>
        <BaseDetailField label="Priority">
          <CustomerComplaintPrioritySelectMenu v-if="isEditable" v-model="complaint.priorityId" />
          <CustomerComplaintPriorityBadgeById
            v-else-if="complaint.priorityId"
            :priorityId="complaint.priorityId"
          />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Assigned to">
          <UserBadgeById v-if="complaint.assignedTo" :userId="complaint.assignedTo" />
          <BaseText v-else color="secondary" class="tw:italic">Unassigned</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Group">
          <GroupSelectMenu v-if="isEditable" v-model="complaint.assignedTeamId" />
          <GroupBadgeById v-else-if="complaint.assignedTeamId" :teamId="complaint.assignedTeamId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Sentiment">
          <BaseSelect
            v-if="isEditable"
            v-model="complaint.sentiment"
            optionLabel="name"
            optionValue="id"
            placeholder="Select sentiment"
            :options="[
              { id: 'POSITIVE', name: 'Positive' },
              { id: 'NEUTRAL', name: 'Neutral' },
              { id: 'NEGATIVE', name: 'Negative' },
              { id: 'URGENT', name: 'Urgent' },
            ]"
          />
          <CustomerComplaintSentimentBadgeById
            v-else-if="complaint.sentiment"
            :sentiment="complaint.sentiment"
          />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 3. Timeline -->
      <BaseRailCard title="Timeline">
        <BaseDetailField label="Created" :value="complaint.createdAt?.formatDate('datetime')" />
        <BaseDetailField
          v-if="complaint.lastCustomerMessageAt"
          label="Last customer reply"
          :value="complaint.lastCustomerMessageAt.formatDate('datetime')"
        />
        <BaseDetailField
          v-if="complaint.closedAt"
          label="Closed"
          :value="complaint.closedAt.formatDate('datetime')"
        />
        <BaseDetailField
          v-if="complaint.slaFirstResponseDueAt && !complaint.firstResponseAt"
          label="First response due"
        >
          <BaseText
            variant="body"
            weight="medium"
            :class="complaint.slaFirstResponseDueAt < DateTime.now() ? 'tw:text-red-600' : ''"
          >
            {{ complaint.slaFirstResponseDueAt.formatDate('datetime') }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="complaint.csatRating" label="Customer rating">
          <BaseText variant="body" weight="medium" :title="complaint.csatComment || ''">
            {{ '★'.repeat(complaint.csatRating) }}{{ '☆'.repeat(5 - complaint.csatRating) }}
          </BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <!-- 4. Customer profile + history (requester layer) -->
      <CustomerComplaintCustomerPanel :complaintId="id" :customerId="complaint.customerId" />

      <!-- 5. Customer details -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
        <div
          class="tw:flex tw:items-center tw:justify-between tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
        >
          <BaseText variant="overline">Customer</BaseText>
          <button
            v-if="isEditable"
            class="tw:text-xs tw:text-primary tw:hover:underline"
            @click="editingCustomer = !editingCustomer"
          >
            {{ editingCustomer ? 'Done' : 'Edit' }}
          </button>
        </div>
        <div v-if="editingCustomer && isEditable" class="tw:flex tw:flex-col tw:gap-2">
          <BaseTextInput v-model="complaint.customerName" placeholder="Name" size="sm" />
          <BaseTextInput
            v-model="complaint.customerEmail"
            type="email"
            placeholder="Email"
            size="sm"
          />
          <BaseTextInput v-model="complaint.customerCompany" placeholder="Company" size="sm" />
          <BaseTextInput v-model="complaint.customerPhone" placeholder="Phone" size="sm" />
        </div>
        <div v-else class="tw:flex tw:flex-col">
          <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
            <span class="tw:text-xs tw:text-secondary">Name</span>
            <span class="tw:text-sm tw:font-medium">{{ complaint.customerName || '—' }}</span>
          </div>
          <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
            <span class="tw:text-xs tw:text-secondary">Email</span>
            <span class="tw:text-sm tw:font-medium tw:truncate">
              {{ complaint.customerEmail || '—' }}
            </span>
          </div>
          <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
            <span class="tw:text-xs tw:text-secondary">Company</span>
            <span class="tw:text-sm tw:font-medium">
              {{ complaint.customerCompany || '—' }}
            </span>
          </div>
          <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
            <span class="tw:text-xs tw:text-secondary">Phone</span>
            <span class="tw:text-sm tw:font-medium">
              {{ complaint.customerPhone || '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 5b. Quality (escalated QMS complaint) -->
      <div v-if="qaComplaint" class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
        <BaseText variant="overline" class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
          Quality
        </BaseText>
        <RouterLink
          :to="getCompanyPath(`/complaints/${qaComplaint.id}`)"
          class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
        >
          <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
            <span class="tw:text-xs tw:text-secondary">{{ qaComplaint.complaintNumber }}</span>
            <span class="tw:text-sm tw:font-medium tw:truncate">{{ qaComplaint.subject }}</span>
          </div>
          <ComplaintStatusBadgeById :statusId="qaComplaint.statusId" />
        </RouterLink>
      </div>

      <!-- 6. Linked NC -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
        <BaseText variant="overline" class="tw:block tw:pb-2 tw:border-b tw:border-divider tw:mb-3">
          Linked NC
        </BaseText>
        <div v-if="linkedNcs.length" class="tw:flex tw:flex-col tw:gap-2">
          <RouterLink
            v-for="nc in linkedNcs"
            :key="nc.id"
            :to="getCompanyPath(`/nonconformances/${nc.id}`)"
            class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
              <span class="tw:text-xs tw:text-secondary">{{ nc.ncNumber }}</span>
              <span class="tw:text-sm tw:font-medium tw:truncate">{{ nc.title }}</span>
            </div>
            <NcStatusBadgeById :statusId="nc.statusId" />
          </RouterLink>
        </div>
        <div v-else class="tw:text-sm tw:text-secondary tw:italic">
          No NC generated from this complaint.
        </div>
      </div>
    </template>
  </BaseDetailLayout>

  <!-- Assign dialog -->
  <BaseDialog v-model="showAssignDialog" title="Assign Complaint" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Pick the agent responsible for this complaint. They'll be notified.
      </p>
      <UserSelectMenu v-model="assignUserId" allTypes required />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Assign"
        :loading="acting"
        :disabled="!assignUserId"
        @cancel="close"
        @submit="handleAssign"
      />
    </template>
  </BaseDialog>

  <!-- Snooze -->
  <BaseDialog v-model="showSnoozeDialog" title="Snooze ticket" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Hides the ticket from the open views until the time you pick — or until the customer
        replies, whichever comes first.
      </p>
      <div class="tw:flex tw:flex-wrap tw:gap-2">
        <BaseButton
          v-for="p in SNOOZE_PRESETS"
          :key="p.label"
          size="sm"
          variant="secondary"
          @click="snoozeUntil = p.pick()"
        >
          {{ p.label }}
        </BaseButton>
      </div>
      <BaseField label="Until">
        <BaseDateField v-model="snoozeUntil" mode="datetime" />
      </BaseField>
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Snooze"
        :loading="acting"
        :disabled="!snoozeUntil"
        @cancel="close"
        @submit="submitSnooze"
      />
    </template>
  </BaseDialog>

  <!-- Mark as spam + learn -->
  <BaseDialog v-model="showSpamDialog" title="Mark as spam" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        The ticket moves to the Spam box (kept, not deleted). Optionally remember the sender so
        future messages land there automatically — you can undo this with “Not spam”.
      </p>
      <BaseCheckbox v-if="complaint?.customerEmail" v-model="spamLearn.email"
        >Block this address
        <span class="tw:text-secondary">({{ complaint.customerEmail }})</span></BaseCheckbox
      >
      <BaseCheckbox v-if="senderDomain" v-model="spamLearn.domain"
        >Block the whole domain
        <span class="tw:text-secondary">(@{{ senderDomain }})</span></BaseCheckbox
      >
      <BaseCheckbox v-model="spamLearn.allBrands"
        >Apply to every brand
        <span class="tw:text-secondary">(default: this ticket’s brand)</span></BaseCheckbox
      >
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Mark as spam"
        submitVariant="danger"
        :loading="acting"
        @cancel="close"
        @submit="submitSpam"
      />
    </template>
  </BaseDialog>

  <!-- Escalate to Quality -->
  <BaseDialog v-model="showEscalateDialog" title="Escalate to Quality" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Creates a Quality complaint for the QA team with this ticket's subject, description and
        customer details. QA accepts it and decides whether it becomes an NC or CAPA.
      </p>
      <BaseTextarea v-model="escalateNote" :rows="4" placeholder="Note for Quality (optional)…" />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Escalate"
        :loading="acting"
        @cancel="close"
        @submit="submitEscalate"
      />
    </template>
  </BaseDialog>

  <!-- Close dialog -->
  <BaseDialog v-model="showCloseDialog" title="Close Complaint" maxWidth="md">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-sm tw:text-on-main">
        Closing marks this complaint as done. If the customer replies by email, the ticket reopens
        automatically.
      </p>
      <BaseTextarea v-model="closeComment" :rows="3" placeholder="Closing comment (optional)…" />
    </div>
    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Close Complaint"
        :loading="acting"
        @cancel="close"
        @submit="handleClose"
      />
    </template>
  </BaseDialog>

  <!-- Convert to NC -->
  <CustomerComplaintConvertToNcDialog
    v-model="showConvertDialog"
    :complaints="complaint ? [complaint] : []"
    @converted="onConverted"
  />

  <!-- Audit log -->
  <AuditLogDialog
    v-model="showAuditLog"
    :includeEntities="auditIncludeEntities"
    :title="`Audit Log — ${complaint?.complaintNumber ?? 'Complaint'}`"
  />
</template>
