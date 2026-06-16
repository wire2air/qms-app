<script setup>
import { IconClipboardList, IconTransform } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const toast = useToast()

const complaint = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.CustomerComplaint.findByPk(id),
  { models: ['CustomerComplaint'] },
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
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <!-- Lifecycle actions -->
        <BaseButton
          v-if="isEditable && !complaint.assignedTo"
          variant="primary"
          :disabled="acting"
          @click="runAction('accept')"
        >
          Accept
        </BaseButton>
        <BaseButton
          v-if="isEditable"
          variant="outline"
          :disabled="acting"
          @click="((assignUserId = complaint.assignedTo), (showAssignDialog = true))"
        >
          {{ complaint.assignedTo ? 'Reassign' : 'Assign' }}
        </BaseButton>
        <BaseButton
          v-if="isEditable && complaint.statusId !== 'RESOLVED'"
          variant="outline"
          :disabled="acting"
          @click="runAction('resolve')"
        >
          Resolve
        </BaseButton>
        <BaseButton
          v-if="isEditable && complaint.statusId !== 'ON_HOLD'"
          variant="outline"
          :disabled="acting"
          @click="runAction('hold')"
        >
          Hold
        </BaseButton>
        <BaseButton
          v-if="isEditable"
          variant="outline"
          :disabled="acting"
          @click="showCloseDialog = true"
        >
          Close
        </BaseButton>
        <BaseButton
          v-if="canUpdate && ['CLOSED', 'RESOLVED'].includes(complaint?.statusId)"
          variant="outline"
          :disabled="acting"
          @click="runAction('reopen')"
        >
          Reopen
        </BaseButton>
        <BaseButton
          v-if="canConvert && complaint && complaint.statusId !== 'CONVERTED_TO_NC'"
          variant="primary"
          :disabled="acting"
          @click="showConvertDialog = true"
        >
          <IconTransform :size="18" class="tw:mr-1" />
          Convert to NC
        </BaseButton>

        <!-- Utility -->
        <BaseButton v-if="complaint?.id" variant="secondary" @click="showAuditLog = true">
          <IconClipboardList :size="20" class="tw:mr-1" />
          Audit Log
        </BaseButton>
      </div>
    </SafeTeleport>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="md" />
    </div>

    <div v-else-if="complaint" class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div
          v-if="saveError"
          class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm"
        >
          {{ saveError }}
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_280px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Ticket information -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Ticket information
              </div>
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
                {{ complaint.subject }}
              </div>

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
            </div>

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
          </div>

          <!-- Right column -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <!-- Overview -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Overview
              </div>
              <div class="tw:flex tw:flex-col">
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Ticket number</span>
                  <span class="tw:text-xs tw:font-mono tw:font-medium">
                    {{ complaint.complaintNumber || '—' }}
                  </span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Status</span>
                  <CustomerComplaintStatusBadgeById :statusId="complaint.statusId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Source</span>
                  <CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" />
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Priority</span>
                  <CustomerComplaintPrioritySelectMenu
                    v-if="isEditable"
                    v-model="complaint.priorityId"
                  />
                  <template v-else>
                    <CustomerComplaintPriorityBadgeById
                      v-if="complaint.priorityId"
                      :priorityId="complaint.priorityId"
                    />
                    <span v-else class="tw:text-sm tw:text-secondary">—</span>
                  </template>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Assigned to</span>
                  <UserBadgeById v-if="complaint.assignedTo" :userId="complaint.assignedTo" />
                  <span v-else class="tw:text-sm tw:text-secondary tw:italic">Unassigned</span>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Group</span>
                  <GroupSelectMenu v-if="isEditable" v-model="complaint.assignedTeamId" />
                  <template v-else>
                    <GroupBadgeById
                      v-if="complaint.assignedTeamId"
                      :teamId="complaint.assignedTeamId"
                    />
                    <span v-else class="tw:text-sm tw:text-secondary">—</span>
                  </template>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Sentiment</span>
                  <BaseSelectMenu
                    v-if="isEditable"
                    v-model="complaint.sentiment"
                    :items="[
                      { id: 'POSITIVE', name: 'Positive' },
                      { id: 'NEUTRAL', name: 'Neutral' },
                      { id: 'NEGATIVE', name: 'Negative' },
                      { id: 'URGENT', name: 'Urgent' },
                    ]"
                  />
                  <template v-else>
                    <CustomerComplaintSentimentBadgeById
                      v-if="complaint.sentiment"
                      :sentiment="complaint.sentiment"
                    />
                    <span v-else class="tw:text-sm tw:text-secondary">—</span>
                  </template>
                </div>
                <div class="tw:flex tw:justify-between tw:items-center tw:py-2">
                  <span class="tw:text-xs tw:text-secondary">Created</span>
                  <span class="tw:text-sm tw:font-medium">
                    {{ complaint.createdAt?.formatDate('datetime') }}
                  </span>
                </div>
                <div
                  v-if="complaint.lastCustomerMessageAt"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2"
                >
                  <span class="tw:text-xs tw:text-secondary">Last customer reply</span>
                  <span class="tw:text-sm tw:font-medium">
                    {{ complaint.lastCustomerMessageAt.formatDate('datetime') }}
                  </span>
                </div>
                <div
                  v-if="complaint.closedAt"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2"
                >
                  <span class="tw:text-xs tw:text-secondary">Closed</span>
                  <span class="tw:text-sm tw:font-medium">
                    {{ complaint.closedAt.formatDate('datetime') }}
                  </span>
                </div>
                <div
                  v-if="complaint.slaFirstResponseDueAt && !complaint.firstResponseAt"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2"
                >
                  <span class="tw:text-xs tw:text-secondary">First response due</span>
                  <span
                    class="tw:text-sm tw:font-medium"
                    :class="
                      complaint.slaFirstResponseDueAt < DateTime.now() ? 'tw:text-red-600' : ''
                    "
                  >
                    {{ complaint.slaFirstResponseDueAt.formatDate('datetime') }}
                  </span>
                </div>
                <div
                  v-if="complaint.csatRating"
                  class="tw:flex tw:justify-between tw:items-center tw:py-2"
                >
                  <span class="tw:text-xs tw:text-secondary">Customer rating</span>
                  <span class="tw:text-sm tw:font-medium" :title="complaint.csatComment || ''">
                    {{ '★'.repeat(complaint.csatRating) }}{{ '☆'.repeat(5 - complaint.csatRating) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Customer profile + history (requester layer) -->
            <CustomerComplaintCustomerPanel :complaintId="id" :customerId="complaint.customerId" />

            <!-- Customer details -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:flex tw:items-center tw:justify-between tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                <div
                  class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
                >
                  Customer
                </div>
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
                <BaseTextInput
                  v-model="complaint.customerCompany"
                  placeholder="Company"
                  size="sm"
                />
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

            <!-- Linked NC -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <div
                class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-2 tw:border-b tw:border-divider tw:mb-3"
              >
                Linked NC
              </div>
              <div v-if="linkedNcs.length" class="tw:flex tw:flex-col tw:gap-2">
                <RouterLink
                  v-for="nc in linkedNcs"
                  :key="nc.id"
                  :to="getCompanyPath(`/nonconformances/${nc.id}`)"
                  class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2 tw:hover:bg-main-hover"
                >
                  <div class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                    <span class="tw:text-xs tw:font-mono tw:text-secondary">{{ nc.ncNumber }}</span>
                    <span class="tw:text-sm tw:font-medium tw:truncate">{{ nc.title }}</span>
                  </div>
                  <NcStatusBadgeById :statusId="nc.statusId" />
                </RouterLink>
              </div>
              <div v-else class="tw:text-sm tw:text-secondary tw:italic">
                No NC generated from this complaint.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BaseEmptyState
      v-else
      title="Complaint not found"
      description="This customer complaint could not be found."
    />

    <!-- Assign dialog -->
    <BaseDialog v-model="showAssignDialog" title="Assign Complaint" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-secondary">
          Pick the agent responsible for this complaint. They'll be notified.
        </p>
        <UserSelectMenu v-model="assignUserId" required />
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="acting" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="!assignUserId || acting" @click="handleAssign">
          Assign
        </BaseButton>
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
        <BaseButton variant="outline" :disabled="acting" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="acting" @click="handleClose">
          Close Complaint
        </BaseButton>
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
  </div>
</template>
