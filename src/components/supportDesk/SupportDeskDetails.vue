<script setup>
import { IconX, IconExternalLink, IconStar, IconStarFilled } from '@tabler/icons-vue'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'
import { lastActivityMs } from './deskViews.js'
import { useSupportTicketActions } from '@/composables/useSupportTicketActions.js'

/**
 * Right-hand details drawer: assignment, conversation attributes, customer
 * data (inline edit + autosave), recent conversations from the same person,
 * form answers, attachments, linked NC and custom fields.
 */
const props = defineProps({
  conversationId: { type: String, required: true },
})
const emit = defineEmits(['close', 'openConversation'])

const complaint = useLiveQueryWithDeps(
  [() => props.conversationId],
  async (db, [id]) => db.CustomerComplaint.findByPk(id),
  { models: ['CustomerComplaint'] },
)
const canUpdate = computed(() => isAllowed(['complaint_management:update']))
const isEditable = computed(
  () =>
    !!complaint.value &&
    canUpdate.value &&
    !['CLOSED', 'CONVERTED_TO_NC'].includes(complaint.value.statusId),
)
const { saveError } = useAutoSave(complaint)

// The website visitor behind a chat (identity the host site passed).
const visitor = useLiveQueryWithDeps(
  [() => complaint.value?.visitorId ?? null],
  async (db, [id]) => (id ? db.SupportVisitor.findByPk(id) : null),
  { models: ['SupportVisitor'], initial: null },
)
const visitorAttributes = computed(() =>
  Object.entries(visitor.value?.attributes || {}).filter(([, v]) => v !== '' && v != null),
)
const brand = useLiveQueryWithDeps(
  [() => complaint.value?.brandId ?? null],
  async (db, [id]) => (id ? db.SupportBrand.findByPk(id) : null),
  { models: ['SupportBrand'], initial: null },
)

// Reassign straight from the drawer; the shared composable's RPC keeps
// notifications + audit identical to the action bar's Assign dialog.
const ticket = useSupportTicketActions(complaint)
const assigneeModel = computed({
  get: () => complaint.value?.assignedTo ?? null,
  set: (v) => v && ticket.assignTo(v),
})

// Recent conversations with the same person (email, falling back to customer id).
const recent = useLiveQueryWithDeps(
  [
    () => complaint.value?.customerEmail?.toLowerCase() ?? null,
    () => complaint.value?.customerId ?? null,
    () => props.conversationId,
  ],
  async (db, [email, customerId, id]) => {
    if (!email && !customerId) return []
    const rows = await db.CustomerComplaint.where().exec()
    return rows
      .filter(
        (r) =>
          r.id !== id &&
          ((email && r.customerEmail?.toLowerCase() === email) ||
            (customerId && r.customerId === customerId)),
      )
      .sort((a, b) => lastActivityMs(b) - lastActivityMs(a))
      .slice(0, 6)
  },
  { models: ['CustomerComplaint'], initial: [] },
)

// Linked NCs (record_links: CustomerComplaint → Nonconformance).
const ncLinks = useLiveQueryWithDeps(
  [() => props.conversationId],
  async (db, [id]) =>
    (await db.RecordLink.where('[fromType+fromId]', ['CustomerComplaint', id]).exec()).filter(
      (l) => l.toType === 'Nonconformance',
    ),
  { models: ['RecordLink'], initial: [] },
)
const linkedNcs = useLiveQueryWithDeps(
  [() => ncLinks.value.map((l) => l.toId).join(',')],
  async (db, [ids]) =>
    ids
      ? (await Promise.all(ids.split(',').map((i) => db.Nonconformance.findByPk(i)))).filter(
          Boolean,
        )
      : [],
  { models: ['Nonconformance'], initial: [] },
)

const open = ref(['assignment', 'attributes', 'user', 'customer', 'recent', 'quality'])
const sections = computed(() => [
  { value: 'assignment', title: 'Assignment' },
  { value: 'attributes', title: 'Conversation attributes' },
  ...(visitor.value ? [{ value: 'user', title: 'User data' }] : []),
  { value: 'customer', title: 'Customer' },
  {
    value: 'recent',
    title: `Recent conversations${recent.value.length ? ` (${recent.value.length})` : ''}`,
  },
  ...(complaint.value?.formId ? [{ value: 'form', title: 'Form answers' }] : []),
  { value: 'attachments', title: 'Attachments' },
  ...(ticket.qaComplaint ? [{ value: 'quality', title: 'Quality' }] : []),
  {
    value: 'nc',
    title: `Linked NC${linkedNcs.value.length ? ` (${linkedNcs.value.length})` : ''}`,
  },
  { value: 'custom', title: 'Additional information' },
])

const overdueFirstResponse = computed(
  () =>
    complaint.value?.slaFirstResponseDueAt &&
    !complaint.value.firstResponseAt &&
    complaint.value.slaFirstResponseDueAt < DateTime.now(),
)
const CHANNEL_LABEL = {
  CHAT: 'Live chat',
  EMAIL: 'Email',
  FORM: 'Web form',
  PHONE: 'Phone',
  MANUAL: 'Manual',
}
</script>

<template>
  <aside class="tw:flex tw:h-full tw:w-80 tw:shrink-0 tw:flex-col tw:bg-main">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-divider tw:bg-card tw:px-3 tw:py-2"
    >
      <span class="tw:text-sm tw:font-semibold">Details</span>
      <div class="tw:flex tw:items-center tw:gap-1">
        <RouterLink
          v-if="complaint"
          :to="getCompanyPath(`/desk/tickets/${complaint.id}`)"
          class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
          aria-label="Open full ticket"
        >
          <IconExternalLink :size="16" />
        </RouterLink>
        <button
          class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
          aria-label="Hide details"
          @click="emit('close')"
        >
          <IconX :size="16" />
        </button>
      </div>
    </div>

    <div v-if="complaint" class="tw:flex-1 tw:overflow-y-auto tw:p-2">
      <div
        v-if="saveError"
        class="tw:mb-2 tw:rounded-md tw:border tw:border-red-200 tw:bg-red-50 tw:p-2 tw:text-xs tw:text-red-700"
      >
        {{ saveError }}
      </div>

      <BaseAccordion v-model="open" :items="sections" multiple>
        <!-- Assignment -->
        <template #assignment>
          <div class="tw:flex tw:flex-col tw:gap-2.5">
            <BaseDetailField label="Assignee">
              <UserSelectMenu v-if="isEditable" v-model="assigneeModel" nullLabel="Unassigned" />
              <UserBadgeById v-else-if="complaint.assignedTo" :userId="complaint.assignedTo" />
              <BaseText v-else color="secondary" class="tw:italic">Unassigned</BaseText>
            </BaseDetailField>
            <BaseDetailField label="Team inbox">
              <span v-if="brand" class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-sm">
                <span
                  class="tw:inline-block tw:h-2 tw:w-2 tw:rounded-full"
                  :style="{ background: brand.accentColor || '#1f6feb' }"
                />
                {{ brand.name }}
              </span>
              <BaseText v-else color="secondary">—</BaseText>
            </BaseDetailField>
            <BaseDetailField label="Group">
              <GroupSelectMenu
                v-if="isEditable"
                v-model="complaint.assignedTeamId"
                nullLabel="No group"
              />
              <GroupBadgeById
                v-else-if="complaint.assignedTeamId"
                :teamId="complaint.assignedTeamId"
              />
              <BaseText v-else color="secondary">—</BaseText>
            </BaseDetailField>
            <BaseDetailField label="Priority">
              <CustomerComplaintPrioritySelectMenu
                v-if="isEditable"
                v-model="complaint.priorityId"
              />
              <CustomerComplaintPriorityBadgeById
                v-else-if="complaint.priorityId"
                :priorityId="complaint.priorityId"
              />
              <BaseText v-else color="secondary">—</BaseText>
            </BaseDetailField>
            <BaseDetailField label="Sentiment">
              <BaseSelect
                v-if="isEditable"
                v-model="complaint.sentiment"
                optionLabel="name"
                optionValue="id"
                placeholder="—"
                clearable
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
          </div>
        </template>

        <!-- Attributes -->
        <template #attributes>
          <dl class="tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-4 tw:gap-y-1.5 tw:text-xs">
            <dt class="tw:text-secondary">ID</dt>
            <dd class="tw:font-medium">{{ complaint.complaintNumber || '—' }}</dd>
            <dt class="tw:text-secondary">Status</dt>
            <dd><CustomerComplaintStatusBadgeById :statusId="complaint.statusId" /></dd>
            <dt class="tw:text-secondary">Channel</dt>
            <dd>
              {{ CHANNEL_LABEL[complaint.channelKind] || complaint.channelKind || '—' }}
              <span
                v-if="complaint.channelKind === 'CHAT' && complaint.chatState"
                class="tw:text-secondary"
              >
                · {{ complaint.chatState.toLowerCase() }}
              </span>
            </dd>
            <dt class="tw:text-secondary">Source</dt>
            <dd><CustomerComplaintSourceBadgeById :sourceId="complaint.sourceId" /></dd>
            <dt class="tw:text-secondary">Subject</dt>
            <dd class="tw:break-words">{{ complaint.subject || '—' }}</dd>
            <dt class="tw:text-secondary">Created</dt>
            <dd>{{ complaint.createdAt?.formatDate('datetime') }}</dd>
            <template v-if="complaint.firstResponseAt">
              <dt class="tw:text-secondary">First response</dt>
              <dd>{{ complaint.firstResponseAt.formatDate('datetime') }}</dd>
            </template>
            <template v-else-if="complaint.slaFirstResponseDueAt">
              <dt class="tw:text-secondary">Response due</dt>
              <dd :class="overdueFirstResponse ? 'tw:text-red-600 tw:font-medium' : ''">
                {{ complaint.slaFirstResponseDueAt.formatDate('datetime') }}
              </dd>
            </template>
            <template v-if="complaint.resolvedAt">
              <dt class="tw:text-secondary">Resolved</dt>
              <dd>{{ complaint.resolvedAt.formatDate('datetime') }}</dd>
            </template>
            <template v-if="complaint.closedAt">
              <dt class="tw:text-secondary">Closed</dt>
              <dd>{{ complaint.closedAt.formatDate('datetime') }}</dd>
            </template>
            <template v-if="complaint.csatRating">
              <dt class="tw:text-secondary">CX rating</dt>
              <dd class="tw:flex tw:items-center tw:gap-0.5" :title="complaint.csatComment || ''">
                <component
                  :is="n <= complaint.csatRating ? IconStarFilled : IconStar"
                  v-for="n in 5"
                  :key="n"
                  :size="12"
                  class="tw:text-amber-500"
                />
              </dd>
              <template v-if="complaint.csatComment">
                <dt class="tw:text-secondary">CX comment</dt>
                <dd class="tw:italic">“{{ complaint.csatComment }}”</dd>
              </template>
            </template>
          </dl>
        </template>

        <!-- User data (chat visitor identity) -->
        <template #user>
          <dl
            v-if="visitor"
            class="tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-4 tw:gap-y-1.5 tw:text-xs"
          >
            <dt class="tw:text-secondary">Type</dt>
            <dd>
              <SupportVisitorKindBadge
                :kind="visitor.visitorKind"
                :verified="visitor.identityVerified"
              />
              <span
                v-if="visitor.visitorKind === 'USER' && !visitor.identityVerified"
                class="tw:ml-1 tw:text-secondary"
                >unverified</span
              >
            </dd>
            <dt class="tw:text-secondary">Name</dt>
            <dd>{{ visitor.identifiedName || '—' }}</dd>
            <dt class="tw:text-secondary">Email</dt>
            <dd class="tw:break-all">{{ visitor.identifiedEmail || '—' }}</dd>
            <dt class="tw:text-secondary">Company</dt>
            <dd>{{ visitor.externalCompany || '—' }}</dd>
            <dt class="tw:text-secondary">User id</dt>
            <dd class="tw:break-all">{{ visitor.externalUserId || '—' }}</dd>
            <template v-for="[k, v] in visitorAttributes" :key="k">
              <dt class="tw:text-secondary tw:break-all">{{ k }}</dt>
              <dd class="tw:break-all">{{ v }}</dd>
            </template>
            <dt class="tw:text-secondary">Last page</dt>
            <dd class="tw:break-all">
              <a
                v-if="visitor.lastPageUrl"
                :href="visitor.lastPageUrl"
                target="_blank"
                rel="noopener"
                class="tw:text-primary tw:underline"
              >
                {{ visitor.lastPageUrl.replace(/^https?:\/\//, '') }}
              </a>
              <template v-else>—</template>
            </dd>
            <dt class="tw:text-secondary">Locale</dt>
            <dd>{{ visitor.locale || '—' }}</dd>
            <dt class="tw:text-secondary">First seen</dt>
            <dd>{{ visitor.firstSeenAt?.formatDate('datetime') || '—' }}</dd>
            <dt class="tw:text-secondary">Last seen</dt>
            <dd>{{ visitor.lastSeenAt?.formatDate('datetime') || '—' }}</dd>
          </dl>
        </template>

        <!-- Customer -->
        <template #customer>
          <div v-if="isEditable" class="tw:flex tw:flex-col tw:gap-2">
            <BaseTextInput
              v-model="complaint.customerName"
              label="Name"
              placeholder="Name"
              size="sm"
            />
            <BaseTextInput
              v-model="complaint.customerEmail"
              type="email"
              label="Email"
              placeholder="Email"
              size="sm"
            />
            <BaseTextInput
              v-model="complaint.customerCompany"
              label="Company"
              placeholder="Company"
              size="sm"
            />
            <BaseTextInput
              v-model="complaint.customerPhone"
              label="Phone"
              placeholder="Phone"
              size="sm"
            />
          </div>
          <dl v-else class="tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-4 tw:gap-y-1.5 tw:text-xs">
            <dt class="tw:text-secondary">Name</dt>
            <dd>{{ complaint.customerName || '—' }}</dd>
            <dt class="tw:text-secondary">Email</dt>
            <dd class="tw:break-all">{{ complaint.customerEmail || '—' }}</dd>
            <dt class="tw:text-secondary">Company</dt>
            <dd>{{ complaint.customerCompany || '—' }}</dd>
            <dt class="tw:text-secondary">Phone</dt>
            <dd>{{ complaint.customerPhone || '—' }}</dd>
          </dl>
          <CustomerComplaintCustomerPanel
            v-if="complaint.customerId"
            class="tw:mt-3"
            :complaintId="complaint.id"
            :customerId="complaint.customerId"
          />
        </template>

        <!-- Recent conversations -->
        <template #recent>
          <ul v-if="recent.length" class="tw:flex tw:flex-col tw:gap-1">
            <li v-for="r in recent" :key="r.id">
              <BaseClickableRow
                :aria-label="`Open ${r.complaintNumber}`"
                class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:hover:bg-main-hover"
                @click="emit('openConversation', r.id)"
              >
                <div class="tw:min-w-0">
                  <div class="tw:truncate tw:text-xs tw:font-medium">
                    {{ r.subject || r.complaintNumber }}
                  </div>
                  <div class="tw:text-micro tw:text-secondary">
                    {{ r.complaintNumber }} · {{ r.createdAt?.formatDate('date') }}
                  </div>
                </div>
                <CustomerComplaintStatusBadgeById :statusId="r.statusId" class="tw:text-micro" />
              </BaseClickableRow>
            </li>
          </ul>
          <p v-else class="tw:text-xs tw:italic tw:text-secondary">
            First conversation with this person.
          </p>
        </template>

        <!-- Form answers -->
        <template #form>
          <CustomerComplaintFormPanel
            :formId="complaint.formId"
            :formSnapshot="complaint.formSnapshot"
            :customFields="complaint.customFields"
            :editable="isEditable"
            @update:customFields="(v) => (complaint.customFields = v)"
          />
        </template>

        <!-- Attachments -->
        <template #attachments>
          <CustomerComplaintAttachmentsPanel :complaintId="complaint.id" :canUpdate="isEditable" />
        </template>

        <!-- Quality (escalated QMS complaint, read-only here) -->
        <template #quality>
          <RouterLink
            v-if="ticket.qaComplaint"
            :to="getCompanyPath(`/complaints/${ticket.qaComplaint.id}`)"
            class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:hover:bg-main-hover"
          >
            <div class="tw:min-w-0">
              <div class="tw:text-micro tw:text-secondary">
                {{ ticket.qaComplaint.complaintNumber }}
              </div>
              <div class="tw:truncate tw:text-xs tw:font-medium">
                {{ ticket.qaComplaint.subject }}
              </div>
              <div class="tw:text-micro tw:text-secondary">
                {{
                  ticket.qaComplaint.ownerId
                    ? 'Accepted by Quality'
                    : 'Waiting for Quality to accept'
                }}
              </div>
            </div>
            <ComplaintStatusBadgeById :statusId="ticket.qaComplaint.statusId" />
          </RouterLink>
        </template>

        <!-- Linked NC -->
        <template #nc>
          <div v-if="linkedNcs.length" class="tw:flex tw:flex-col tw:gap-1">
            <RouterLink
              v-for="nc in linkedNcs"
              :key="nc.id"
              :to="getCompanyPath(`/nonconformances/${nc.id}`)"
              class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:hover:bg-main-hover"
            >
              <div class="tw:min-w-0">
                <div class="tw:text-micro tw:text-secondary">{{ nc.ncNumber }}</div>
                <div class="tw:truncate tw:text-xs tw:font-medium">{{ nc.title }}</div>
              </div>
              <NcStatusBadgeById :statusId="nc.statusId" />
            </RouterLink>
          </div>
          <p v-else class="tw:text-xs tw:italic tw:text-secondary">
            No NC generated from this ticket.
          </p>
        </template>

        <!-- Custom fields -->
        <template #custom>
          <CustomFieldsCard
            entityType="CustomerComplaint"
            :entityId="complaint.id"
            :editable="isEditable"
          />
        </template>
      </BaseAccordion>
    </div>
  </aside>
</template>
