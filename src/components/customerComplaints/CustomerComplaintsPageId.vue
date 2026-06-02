<script setup>
import { IconArrowLeft, IconCheck, IconShield, IconTrash, IconUserPlus } from '@tabler/icons-vue'
import { post } from '@/api'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const toast = useToast()

const canUpdate = computed(() => isAllowed(['customerComplaints:update']))
const canAssign = computed(() => isAllowed(['customerComplaints:assign']))
const canReply = computed(() => isAllowed(['customerComplaints:reply']))
const canDelete = computed(() => isAllowed(['customerComplaints:delete']))
const canLinkToNc = computed(() => isAllowed(['customerComplaints:linkToNc']))

const complaint = useLiveQueryWithDeps([() => props.id], async (db, [id]) =>
  db.CustomerComplaint.findByPk(id),
)

const messages = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) =>
    db.CustomerComplaintMessage.where('complaintId', id).orderBy('createdAt', 'asc').exec(),
  { initial: [], models: 'CustomerComplaintMessage' },
)

const ncLinks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) =>
    db.NonconformanceComplaint.where('complaintId', id).exec(),
  { initial: [], models: 'NonconformanceComplaint' },
)

const isClosed = computed(() => complaint.value?.statusId === 'CLOSED')
const editLocked = computed(() => !canUpdate.value || isClosed.value)

const editingSubject = ref(false)
const editingDescription = ref(false)

// Inline-edit auto-save: deep-watch the live record, debounce + persist.
// Skip the first watcher trigger so the initial load doesn't fire a save,
// then bail out if the record disappears (deletion mid-edit) or is closed
// (server would reject anyway, but no point pinging).
const isSaving = ref(false)
const saveError = ref(null)
const isFirstLoad = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!complaint.value || editLocked.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await complaint.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
    toast.notify({ type: 'negative', message: saveError.value })
  } finally {
    isSaving.value = false
  }
}, 500)

watch(
  complaint,
  (c) => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (c) debouncedSave()
  },
  { deep: true },
)

const STATUSES = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED']

async function changeStatus(statusId) {
  if (!complaint.value || statusId === complaint.value.statusId) return
  try {
    await post(`/v1/services/customerComplaints/${props.id}/status`, { statusId })
    toast.notify({ type: 'positive', message: `Status updated to ${statusId}` })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to change status' })
  }
}

async function selfAssign() {
  const userId = currentSession.value?.userId
  if (!userId) return
  try {
    await post(`/v1/services/customerComplaints/${props.id}/assign`, {
      assigneeUserId: userId,
    })
    toast.notify({ type: 'positive', message: 'Assigned to you' })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to assign' })
  }
}

async function unassign() {
  try {
    await post(`/v1/services/customerComplaints/${props.id}/assign`, {
      assigneeUserId: null,
    })
    toast.notify({ type: 'positive', message: 'Ticket unassigned' })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to unassign' })
  }
}

async function reassignTo(userId) {
  try {
    await post(`/v1/services/customerComplaints/${props.id}/assign`, {
      assigneeUserId: userId,
    })
    toast.notify({ type: 'positive', message: 'Assignee updated' })
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to reassign' })
  }
}

const showNcDialog = ref(false)
const showDeleteDialog = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!complaint.value) return
  deleting.value = true
  try {
    await complaint.value.delete()
    toast.notify({ type: 'positive', message: 'Ticket deleted' })
    router.push(getCompanyPath('/customer-complaints'))
  } catch (err) {
    toast.notify({ type: 'negative', message: err?.message || 'Failed to delete' })
  } finally {
    deleting.value = false
    showDeleteDialog.value = false
  }
}

function onBack() {
  router.push(getCompanyPath('/customer-complaints'))
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">
          {{ complaint?.complaintNumber || 'Complaint' }}
        </h2>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:items-center tw:gap-2">
      <button
        class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-primary"
        @click="onBack"
      >
        <IconArrowLeft :size="16" />
        <span>Back to tickets</span>
      </button>
      <span v-if="isSaving" class="tw:text-xs tw:text-secondary tw:italic">Saving…</span>
    </div>

    <div v-if="!complaint" class="tw:text-sm tw:text-secondary tw:italic tw:py-12 tw:text-center">
      Loading…
    </div>

    <div v-else class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-4">
      <!-- Left: subject, description, messages thread, reply composer -->
      <div class="tw:col-span-2 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
            <div class="tw:flex tw:flex-col tw:gap-1 tw:flex-1">
              <div class="tw:font-mono tw:text-xs tw:text-secondary">
                {{ complaint.complaintNumber }}
              </div>
              <template v-if="editingSubject && !editLocked">
                <BaseTextInput
                  v-model="complaint.subject"
                  placeholder="Subject"
                  @keyup.enter="editingSubject = false"
                  @blur="editingSubject = false"
                />
              </template>
              <h2
                v-else
                class="tw:text-2xl tw:font-bold tw:text-on-sidebar"
                :class="{ 'tw:cursor-pointer tw:hover:text-primary': !editLocked }"
                @click="!editLocked && (editingSubject = true)"
              >
                {{ complaint.subject || 'Untitled' }}
              </h2>
            </div>
            <div class="tw:flex tw:items-center tw:gap-1 tw:flex-wrap tw:justify-end">
              <CustomerComplaintStatusBadgeById :statusId="complaint.statusId" />
              <CustomerComplaintPriorityBadgeById :priorityId="complaint.priorityId" />
              <CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" />
            </div>
          </div>

          <div class="tw:flex tw:flex-col tw:gap-1">
            <span class="tw:text-xs tw:text-secondary tw:uppercase tw:tracking-wide tw:font-semibold">
              Description
            </span>
            <template v-if="editingDescription && !editLocked">
              <BaseTextarea
                v-model="complaint.description"
                rows="4"
                placeholder="Description"
                @blur="editingDescription = false"
              />
            </template>
            <div
              v-else
              class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap tw:min-h-6"
              :class="{ 'tw:cursor-pointer tw:hover:bg-main-hover tw:rounded-sm tw:p-1 tw:-m-1': !editLocked }"
              @click="!editLocked && (editingDescription = true)"
            >
              {{ complaint.description || (editLocked ? '—' : 'Click to add a description…') }}
            </div>
          </div>
        </div>

        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
            Conversation
          </div>
          <CustomerComplaintMessageList :messages="messages" />
        </div>

        <CustomerComplaintReplyComposer
          v-if="canReply"
          :complaintId="complaint.id"
          :customerEmail="complaint.customerEmail"
          :disabled="isClosed"
        />
      </div>

      <!-- Right: meta, assignment, actions -->
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
            Status
          </div>
          <CustomerComplaintStatusSelectMenu
            v-if="canUpdate && !isClosed"
            :modelValue="complaint.statusId"
            required
            @update:modelValue="changeStatus"
          />
          <CustomerComplaintStatusBadgeById v-else :statusId="complaint.statusId" />
          <div v-if="canUpdate && !isClosed" class="tw:flex tw:gap-2 tw:flex-wrap">
            <BaseButton
              v-for="s in STATUSES.filter((s) => s !== complaint.statusId && s !== 'CLOSED')"
              :key="s"
              variant="outline"
              size="sm"
              @click="changeStatus(s)"
            >
              {{ s.replace(/_/g, ' ').toLowerCase() }}
            </BaseButton>
            <BaseButton variant="primary" size="sm" @click="changeStatus('CLOSED')">
              <template #icon><IconCheck :size="14" /></template>
              Close
            </BaseButton>
          </div>
        </div>

        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
            Assignee
          </div>
          <UserSelectMenu
            v-if="canAssign && !isClosed"
            :modelValue="complaint.assignedToUserId"
            @update:modelValue="reassignTo"
          />
          <template v-else>
            <UserBadgeById v-if="complaint.assignedToUserId" :userId="complaint.assignedToUserId" />
            <span v-else class="tw:text-xs tw:text-secondary tw:italic">Unassigned</span>
          </template>
          <div v-if="canAssign && !isClosed" class="tw:flex tw:gap-2">
            <BaseButton
              v-if="complaint.assignedToUserId !== currentSession?.userId"
              variant="outline"
              size="sm"
              @click="selfAssign"
            >
              <template #icon><IconUserPlus :size="14" /></template>
              Assign to me
            </BaseButton>
            <BaseButton
              v-if="complaint.assignedToUserId"
              variant="outline"
              size="sm"
              @click="unassign"
            >
              Unassign
            </BaseButton>
          </div>
        </div>

        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
            Customer
          </div>
          <div class="tw:text-sm tw:text-on-main">
            <div class="tw:font-medium">{{ complaint.customerName || '—' }}</div>
            <div class="tw:text-secondary tw:text-xs">{{ complaint.customerEmail || 'no email' }}</div>
          </div>
          <UserBadgeById v-if="complaint.customerUserId" :userId="complaint.customerUserId" />
        </div>

        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
            Priority
          </div>
          <CustomerComplaintPrioritySelectMenu
            v-if="!editLocked"
            v-model="complaint.priorityId"
            required
          />
          <CustomerComplaintPriorityBadgeById v-else :priorityId="complaint.priorityId" />

          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mt-2">
            Product
          </div>
          <ProductSelectMenu v-if="!editLocked" v-model="complaint.productId" :required="false" />
          <template v-else>
            <ProductBadgeById v-if="complaint.productId" :productId="complaint.productId" />
            <span v-else class="tw:text-xs tw:text-secondary tw:italic">—</span>
          </template>

          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:mt-2">
            Supplier
          </div>
          <SupplierSelectMenu v-if="!editLocked" v-model="complaint.supplierId" :required="false" />
          <template v-else>
            <SupplierBadgeById v-if="complaint.supplierId" :supplierId="complaint.supplierId" />
            <span v-else class="tw:text-xs tw:text-secondary tw:italic">—</span>
          </template>
        </div>

        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
            Linked Nonconformances
          </div>
          <div v-if="!ncLinks.length" class="tw:text-xs tw:text-secondary tw:italic">
            None yet.
          </div>
          <div v-else class="tw:flex tw:flex-col tw:gap-1">
            <LinkedNonconformanceRow
              v-for="link in ncLinks"
              :key="link.id"
              :ncId="link.ncId"
            />
          </div>
          <BaseButton
            v-if="canLinkToNc && !isClosed"
            variant="outline"
            size="sm"
            @click="showNcDialog = true"
          >
            <template #icon><IconShield :size="14" /></template>
            Generate Nonconformance
          </BaseButton>
        </div>

        <div v-if="canDelete" class="tw:flex tw:justify-end">
          <BaseButton variant="outline" size="sm" @click="showDeleteDialog = true">
            <template #icon><IconTrash :size="14" /></template>
            Delete ticket
          </BaseButton>
        </div>
      </div>
    </div>

    <CreateNonconformanceFromComplaintsDialog
      v-if="showNcDialog && complaint"
      v-model="showNcDialog"
      :complaint="complaint"
    />

    <BaseDialog v-model="showDeleteDialog" title="Delete ticket?">
      <div class="tw:text-sm tw:text-on-main">
        This soft-deletes the ticket. Audit history is preserved.
      </div>
      <template #actions>
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :loading="deleting" @click="handleDelete">Delete</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
