<script setup>
import {
  buildComplaintBanners,
  buildComplaintSections,
  buildComplaintActions,
} from './customerComplaintDetailConfig.js'
import { isAllowed } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()
const toast = useToast()
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
  { label: 'Customer Complaints', to: getCompanyPath('/customer-complaints') },
  { label: complaint.value?.complaintNumber || complaint.value?.subject || 'Loading…' },
])

const canUpdate = computed(() => isAllowed(['customerComplaints:update']))
const canConvert = computed(
  () => isAllowed(['customerComplaints:update']) && isAllowed(['nonconformances:create']),
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

// ─── Convert to NC ────────────────────────────────────────────────────────────
const showConvertDialog = ref(false)

function onConverted(ncId) {
  showConvertDialog.value = false
  router.push(getCompanyPath(`/nonconformances/${ncId}`))
}

// ─── Linked NC (via the generic nc_source_links table) ───────────────────────
const ncLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [complaintId]) => {
    if (!complaintId) return []
    return db.NcSourceLink.where('[sourceType+sourceId]', [
      'CUSTOMER_COMPLAINT',
      complaintId,
    ]).exec()
  },

  { models: ['NcSourceLink'], initial: [] },
)

const linkedNcIdList = computed(() => ncLinks.value.map((l) => l.ncId).join(','))
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
  buildComplaintBanners(complaint.value, { isEditable: isEditable.value }),
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
    },
    {
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
      <UserSelectMenu v-model="assignUserId" required />
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
