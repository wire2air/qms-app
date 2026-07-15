<script setup>
import { IconArrowUpRight } from '@tabler/icons-vue'
import { post } from '@/api'
import { isAllowed, isVerbAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentCompany } from '@/utils/currentCompany.js'
import { useDebounceFn } from '@vueuse/core'
import { DateTime } from 'luxon'
import {
  buildQualityEventBanners,
  buildQualityEventSections,
  buildQualityEventActions,
} from './qualityEventDetailConfig.js'

const props = defineProps({ id: { type: String, required: true } })

const toast = useToast()
const canUpdate = computed(() => isAllowed(['quality_events:update']))
const currentUserId = computed(() => currentSession.value?.userId ?? currentSession.value?.id ?? null)
const isSupplierPortalUser = computed(() => currentSession.value?.kind === 'EXTERNAL_SUPPLIER')

const event = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.QualityEvent.findByPk(id),
  { models: ['QualityEvent'] },
)
const loading = computed(() => event.value === undefined)
const isAssignedReviewer = computed(() => !!event.value?.assignedToUserId && event.value.assignedToUserId === currentUserId.value)
const canOwnerActions = computed(() => canUpdate.value && isAssignedReviewer.value)
// Close: the assigned reviewer, OR a role explicitly granted quality_events:close.
// Escalate: POST /escalate enforces quality_events:update, so gate on the same.
const canClose = computed(
  () => canOwnerActions.value || isVerbAllowed('quality_events', 'close'),
)
const canEscalate = computed(() => canUpdate.value)
const reviewSlaDays = computed(() => {
  const n = Number(currentCompany.value?.settings?.defaultQualityEventReviewSlaDays)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 7
})
const closing = ref(false)
const notifying = ref(false)
const supplierAckSubmitting = ref(false)
const supplierAckComment = ref('')
const supplierAcked = ref(false)
const notifySupplierUserId = ref(null)
const notifyDefaultsHydratedFor = ref(null)
const canSupplierAcknowledge = computed(() =>
  !!event.value
  && isSupplierPortalUser.value
  && !!event.value.supplierId
  && currentSession.value?.supplierId === event.value.supplierId,
)

// A supplier user can't read the supplier record (RLS hides internal fields),
// so SupplierBadgeById won't resolve. When the event's supplier is the viewer's
// own organization, label it as such instead of showing a raw UUID.
const isOwnSupplier = computed(
  () => !!event.value?.supplierId && currentSession.value?.supplierId === event.value.supplierId,
)

const qualityEventNotifyRule = useLiveQuery(async (db) => {
  const rows = await db.NotificationRule.where().exec()
  return rows.find((r) => r.entityType === 'QualityEvent' && r.isActive) || null
}, {
  models: ['NotificationRule'],
  initial: undefined,
})

const supplierUsers = useLiveQueryWithDeps(
  [() => event.value?.supplierId || null],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.User.where('supplierId', supplierId).exec()
    return rows.filter((u) => u.kind === 'EXTERNAL_SUPPLIER' && u.userStatusId === 'ACTIVE')
  },
  { models: ['User'], initial: [] },
)

const visibleSite = useLiveQueryWithDeps(
  [() => event.value?.siteId || null],
  async (db, [siteId]) => {
    if (!siteId) return null
    return db.Site.findByPk(siteId)
  },
  { models: ['Site'], initial: null },
)

const visibleSupplier = useLiveQueryWithDeps(
  [() => event.value?.supplierId || null],
  async (db, [supplierId]) => {
    if (!supplierId) return null
    return db.Supplier.findByPk(supplierId)
  },
  { models: ['Supplier'], initial: null },
)

const visibleAssignee = useLiveQueryWithDeps(
  [() => event.value?.assignedToUserId || null],
  async (db, [userId]) => {
    if (!userId) return null
    return db.User.findByPk(userId)
  },
  { models: ['User'], initial: null },
)

const visibleReporter = useLiveQueryWithDeps(
  [() => event.value?.reportedByUserId || null],
  async (db, [userId]) => {
    if (!userId) return null
    return db.User.findByPk(userId)
  },
  { models: ['User'], initial: null },
)

const supplierAcknowledgements = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AuditLog.where('[entityType+entityId]', ['QualityEvent', id]).exec()
    return rows
      .filter((r) => r.action === 'ACKNOWLEDGED' && r?.newValueJson?.acknowledgedBySupplier)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
  },
  { models: ['AuditLog'], initial: [] },
)

function supplierAckCommentText(log) {
  const text = typeof log?.newValueJson?.comment === 'string'
    ? log.newValueJson.comment.trim()
    : ''
  return text || null
}

function toDateTime(value) {
  if (!value) return null
  if (DateTime.isDateTime(value)) return value
  if (value instanceof Date) return DateTime.fromJSDate(value)
  if (typeof value === 'string') {
    const dt = DateTime.fromISO(value)
    return dt.isValid ? dt : null
  }
  return null
}

const activeTab = ref('overview')
const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'review', label: 'Review' },
  { value: 'escalations', label: 'Escalations' },
]

function uniqueIds(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter(Boolean))]
}

// ── Inline edit + autosave ────────────────────────────────────────────────
const isSaving = ref(false)
const saveError = ref(null)
const isFirstLoad = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!event.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await event.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
    toast.error(saveError.value)
  } finally {
    isSaving.value = false
  }
}, 600)

watch(
  event,
  (e) => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (e && canUpdate.value) debouncedSave()
  },
  { deep: true },
)

watch(
  [event, reviewSlaDays, qualityEventNotifyRule],
  ([e, sla, notifyRule]) => {
    if (!e) return

    // Once notification-rule query resolves (row or null), hydrate defaults once per event.
    if (
      notifyRule !== undefined
      && (!notifyDefaultsHydratedFor.value || notifyDefaultsHydratedFor.value !== e.id)
    ) {
      const defaultGroups = notifyRule?.recipients?.groupIds || []
      const defaultUsers = notifyRule?.recipients?.userIds || []
      e.notifyGroupIds = uniqueIds([...(e.notifyGroupIds || []), ...defaultGroups])
      e.notifyUserIds = uniqueIds([...(e.notifyUserIds || []), ...defaultUsers])
      notifyDefaultsHydratedFor.value = e.id
    }

    // Normalize date fields for BaseDateField rendering.
    const occ = toDateTime(e.occurrenceDate)
    if (occ && !DateTime.isDateTime(e.occurrenceDate)) e.occurrenceDate = occ.startOf('day')

    const existing = toDateTime(e.reviewDueDate)
    if (existing) {
      // Keep the bound value in DateTime form so BaseDateField always renders it.
      if (!DateTime.isDateTime(e.reviewDueDate)) e.reviewDueDate = existing.startOf('day')
      return
    }

    const base = toDateTime(e.createdAt) || toDateTime(e.reportedDate)
    if (!base) return
    e.reviewDueDate = base.plus({ days: sla }).startOf('day')
  },
  { immediate: true },
)

watch(
  [() => event.value?.supplierId || null, supplierUsers],
  ([supplierId, users]) => {
    if (!supplierId) {
      notifySupplierUserId.value = null
      return
    }
    const keepCurrent = users.some((u) => u.id === notifySupplierUserId.value)
    if (!keepCurrent) notifySupplierUserId.value = users[0]?.id || null
  },
  { immediate: true },
)

watch([() => event.value?.id || null, canSupplierAcknowledge], () => {
  supplierAcked.value = false
  supplierAckComment.value = ''
})

async function handleSupplierAcknowledge() {
  if (!event.value || !canSupplierAcknowledge.value) return

  supplierAckSubmitting.value = true
  try {
    const comment = String(supplierAckComment.value || '').trim()
    const res = await post(`/v1/services/qualityEvents/${event.value.id}/acknowledge-view`, {
      comment: comment || null,
    })
    supplierAcked.value = true

    if (res?.alreadyAcknowledged) {
      toast.success('This event was already acknowledged.')
      return
    }

    if (res?.createdFeedbackTask) {
      toast.success('Acknowledged. Your feedback was sent to the reviewer as a task.')
      return
    }

    toast.success('Acknowledged.')
  } catch (e) {
    toast.error(e.message || 'Failed to acknowledge event')
  } finally {
    supplierAckSubmitting.value = false
  }
}

async function handleNotify() {
  if (!event.value) return
  if (!canOwnerActions.value) {
    toast.warning('Only the assigned reviewer can notify recipients.')
    return
  }
  const notifyGroupIds = uniqueIds(event.value.notifyGroupIds)
  const notifyUserIds = uniqueIds(event.value.notifyUserIds)
  const supplierUserId = notifySupplierUserId.value || null

  if (!supplierUserId && !notifyGroupIds.length && !notifyUserIds.length) {
    toast.warning('Pick at least one supplier user, group, or person to notify.')
    return
  }

  notifying.value = true
  try {
    const res = await post(`/v1/services/qualityEvents/${event.value.id}/notify`, {
      supplierUserId,
      notifyGroupIds,
      notifyUserIds,
    })
    const createdTaskCount = Number(res?.createdTaskCount || 0)
    const notifiedEmailCount = Number(res?.notifiedEmailCount || 0)
    const parts = []
    if (createdTaskCount > 0) {
      parts.push(`Created ${createdTaskCount} supplier task${createdTaskCount === 1 ? '' : 's'}.`)
    }
    if (notifiedEmailCount > 0) {
      parts.push(`Sent ${notifiedEmailCount} email notification${notifiedEmailCount === 1 ? '' : 's'}.`)
    }
    toast.success(parts.join(' ') || 'Notifications sent.')
  } catch (e) {
    toast.error(e.message || 'Failed to notify recipients')
  } finally {
    notifying.value = false
  }
}

async function handleClose() {
  if (!event.value) return
  if (!canClose.value) {
    toast.warning('You need the Close permission, or to be the assigned reviewer, to close this event.')
    return
  }
  closing.value = true
  try {
    const res = await post(`/v1/services/qualityEvents/${event.value.id}/close`, {})
    if (res?.qualityEvent) {
      event.value.statusId = res.qualityEvent.statusId
    }
    toast.success('Event closed')
  } catch (e) {
    toast.error(e.message || 'Failed to close event')
  } finally {
    closing.value = false
  }
}

// ── Escalations ────────────────────────────────────────────────────────────
const showEscalate = ref(false)
const showAuditLog = ref(false)
const links = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const rows = await db.RecordLink.where('[fromType+fromId]', ['QualityEvent', id]).exec()
    return rows
  },
  { models: ['RecordLink'], initial: [] },
)

const auditIncludeEntities = computed(() => [
  { entityType: 'QualityEvents', entityIds: props.id ? [props.id] : [] },
])

function onEscalated(target) {
  showEscalate.value = false
  if (target?.urlPath && target?.id) {
    toast.success(`Created ${target.number || target.type}`)
    // Stay on the event; the Escalations tab updates live.
    activeTab.value = 'escalations'
  }
}

function targetRoute(link) {
  const map = {
    Nonconformance: 'nonconformances',
    Capa: 'capas',
    ChangeRequest: 'change-requests',
    CustomerComplaint: 'customer-complaints',
  }
  const seg = map[link.toType]
  return seg ? getCompanyPath(`/${seg}/${link.toId}`) : null
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const breadcrumbs = computed(() => [
  { label: 'Events', to: getCompanyPath('/qualityEvents') },
  { label: event.value?.title || event.value?.eventNumber || 'Loading…' },
])
const qualityEventBanners = computed(() => buildQualityEventBanners(event.value))
const qualityEventActions = computed(() =>
  buildQualityEventActions(
    {
      canClose: canClose.value,
      canEscalate: canEscalate.value,
      statusId: event.value?.statusId,
      closing: closing.value,
    },
    {
      close() {
        handleClose()
      },
      escalate() {
        showEscalate.value = true
      },
      openAudit() {
        showAuditLog.value = true
      },
    },
  ),
)
const qualityEventDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => qualityEventBanners.value,
    actions: qualityEventActions.value,
    sections: buildQualityEventSections(event.value),
  }),
)
</script>

<template>
  <div class="tw:contents">
    <BaseDetailLayout
    :config="qualityEventDetailConfig"
    :record="event"
    :loading="loading"
    :notFound="!loading && !event"
    notFoundTitle="Event not found"
    notFoundDescription="This quality event could not be found."
  >
    <template #title>
      <span class="tw:text-base tw:font-semibold tw:text-on-main">{{ event?.title }}</span>
    </template>

    <template #status>
      <div v-if="event" class="tw:w-full tw:sm:w-48">
        <QualityEventStatusSelectMenu v-if="canUpdate" v-model="event.statusId" />
        <QualityEventStatusBadgeById v-else :statusId="event.statusId" />
      </div>
    </template>

    <template v-if="event" #meta>
      <span class="">{{ event.eventNumber }}</span>
      <template v-if="event.categoryId">
        · <EventCategoryBadgeById :categoryId="event.categoryId" />
      </template>
      <template v-if="event.severityId">
        · <EventSeverityBadgeById :severityId="event.severityId" />
      </template>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span v-if="isSaving" class="tw:text-sm tw:text-secondary">Saving…</span>
        <DetailActionBar :actions="qualityEventActions" />
      </div>
    </template>

    <template v-if="event" #section-details>
      <BaseTabs v-model="activeTab" :tabs="tabs" ariaLabel="Event detail">
        <!-- Overview -->
        <BaseTabPanel value="overview">
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
            <div
              v-if="canSupplierAcknowledge"
              class="tw:md:col-span-2 tw:bg-card tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
            >
              <BaseText variant="overline" class="tw:block">Supplier Acknowledgement</BaseText>
              <p class="tw:text-sm tw:text-secondary">
                Acknowledge that you reviewed this event. You can also send optional feedback to the reviewer.
              </p>
              <BaseField v-slot="{ id: fieldId }" label="Feedback (optional)">
                <BaseTextarea
                  :id="fieldId"
                  v-model="supplierAckComment"
                  :rows="3"
                  :disabled="supplierAckSubmitting || supplierAcked"
                  placeholder="Add feedback for the reviewer"
                />
              </BaseField>
              <div class="tw:flex tw:justify-end">
                <BaseButton
                  variant="primary"
                  :loading="supplierAckSubmitting"
                  :disabled="supplierAckSubmitting || supplierAcked"
                  @click="handleSupplierAcknowledge"
                >
                  {{ supplierAcked ? 'Acknowledged' : 'Acknowledge Event' }}
                </BaseButton>
              </div>
            </div>

            <BaseField v-slot="{ id: fid }" label="Title" class="tw:md:col-span-2">
              <BaseTextInput :id="fid" v-model="event.title" :disabled="!canUpdate" />
            </BaseField>
            <BaseField label="Issue" class="tw:md:col-span-2">
              <RichTextAttachments
                v-model="event.description"
                :readonly="!canUpdate"
                placeholder="Describe the issue and context"
              />
            </BaseField>
          </div>
        </BaseTabPanel>

        <!-- Review -->
        <BaseTabPanel value="review">
          <div class="tw:flex tw:flex-col tw:gap-4">
            <BaseField label="Review Summary">
              <RichTextAttachments
                v-model="event.reviewSummary"
                :readonly="!canUpdate"
                placeholder="Summarize review observations"
              />
            </BaseField>
            <BaseField label="Recommended Action">
              <RichTextAttachments
                v-model="event.recommendedAction"
                :readonly="!canUpdate"
                placeholder="Document recommended action"
              />
            </BaseField>
            <BaseField label="Decision">
              <RichTextAttachments
                v-model="event.decision"
                :readonly="!canUpdate"
                placeholder="Record final decision"
              />
            </BaseField>

              <div
                v-if="canOwnerActions"
                class="tw:bg-card tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
              >
              <BaseText variant="overline" class="tw:block">Notify</BaseText>
              <!-- Only offer the supplier-user picker when a supplier is set on
                   the event; otherwise there's nobody to notify on the supplier side. -->
              <BaseField v-if="event.supplierId" label="Supplier user">
                <UserSelectMenu
                  v-model="notifySupplierUserId"
                  kind="EXTERNAL_SUPPLIER"
                  :supplierId="event.supplierId"
                  :required="false"
                  :disabled="!canOwnerActions"
                  nullLabel="— Select supplier user —"
                />
              </BaseField>
              <NotificationCcField
                v-model:groupIds="event.notifyGroupIds"
                v-model:userIds="event.notifyUserIds"
                  :editable="canOwnerActions"
                hint="Default recipients come from company notification settings. Add more as needed; dedup is automatic on send."
              />
              <div class="tw:flex tw:justify-end">
                <BaseButton
                  variant="primary"
                  :loading="notifying"
                    :disabled="!canOwnerActions || notifying"
                  @click="handleNotify"
                >
                  Notify Selected Parties
                </BaseButton>
              </div>
            </div>

            <div
              v-if="canOwnerActions"
              class="tw:bg-card tw:border tw:border-divider tw:rounded-lg tw:p-4 tw:flex tw:flex-col tw:gap-3"
            >
              <BaseText variant="overline" class="tw:block">Supplier Feedback</BaseText>
              <div v-if="!supplierAcknowledgements.length" class="tw:text-sm tw:text-secondary tw:italic">
                No supplier acknowledgements yet.
              </div>
              <div v-else class="tw:flex tw:flex-col tw:gap-2">
                <div
                  v-for="entry in supplierAcknowledgements"
                  :key="entry.id"
                  class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-main"
                >
                  <div class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mb-2">
                    <UserBadgeById v-if="entry.performedBy" :userId="entry.performedBy" />
                    <span v-else class="tw:text-xs tw:text-secondary">Supplier user</span>
                    <span class="tw:text-xs tw:text-secondary">{{ entry.createdAt?.formatDate?.('datetime') || '—' }}</span>
                  </div>
                  <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">
                    {{ supplierAckCommentText(entry) || 'Acknowledged without additional comment.' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </BaseTabPanel>

        <!-- Escalations -->
        <BaseTabPanel value="escalations">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div v-if="!links.length" class="tw:text-sm tw:text-secondary tw:italic">
              This event has not been escalated. Use the <strong>Escalate</strong> button to spawn a
              formal record.
            </div>
            <RouterLink
              v-for="link in links"
              :key="link.id"
              :to="targetRoute(link) || '#'"
              class="tw:flex tw:items-center tw:gap-2 tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-2 tw:hover:border-primary"
            >
              <IconArrowUpRight :size="16" class="tw:text-orange-600" />
              <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ link.toType }}</span>
              <span class="tw:text-xs tw:text-secondary">{{ link.toId }}</span>
              <span class="tw:ml-auto tw:text-xs tw:text-secondary">{{ link.relation }}</span>
            </RouterLink>
          </div>
        </BaseTabPanel>

      </BaseTabs>
    </template>

    <!-- Organized attributes in the right rail (mirrors the NC page). Editable
         inline when canUpdate; glanceable badges/values otherwise. -->
    <template v-if="event" #rail>
      <BaseRailCard title="Classification" grid>
        <BaseDetailField label="Category">
          <EventCategorySelectMenu v-if="canUpdate" v-model="event.categoryId" :required="false" />
          <EventCategoryBadgeById v-else-if="event.categoryId" :categoryId="event.categoryId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Severity">
          <EventSeveritySelectMenu v-if="canUpdate" v-model="event.severityId" :required="false" />
          <EventSeverityBadgeById v-else-if="event.severityId" :severityId="event.severityId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <BaseRailCard title="Location" grid>
        <BaseDetailField label="Site / Location">
          <SiteSelectMenu
            v-if="canUpdate"
            v-model="event.siteId"
            :required="false"
            nullLabel="— Select site —"
          />
          <SiteBadgeById v-else-if="event.siteId && visibleSite" :siteId="event.siteId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Department">
          <DepartmentSelectMenu
            v-if="canUpdate"
            v-model="event.departmentId"
            :required="false"
            nullLabel="— Select department —"
          />
          <DepartmentBadgeById
            v-else-if="event.departmentId"
            :departmentId="event.departmentId"
          />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Supplier">
          <SupplierSelectMenu
            v-if="canUpdate"
            v-model="event.supplierId"
            :required="false"
            nullLabel="— Select supplier —"
          />
          <SupplierBadgeById
            v-else-if="event.supplierId && visibleSupplier"
            :supplierId="event.supplierId"
          />
          <!-- RLS hides the supplier record from supplier users; label their own
               org instead of a raw UUID. -->
          <BaseText v-else-if="isOwnSupplier" color="secondary">Your organization</BaseText>
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <BaseRailCard title="People" grid>
        <BaseDetailField label="Assigned To">
          <UserSelectMenu v-if="canUpdate" v-model="event.assignedToUserId" :required="false" />
          <UserBadgeById
            v-else-if="event.assignedToUserId && visibleAssignee"
            :userId="event.assignedToUserId"
          />
          <!-- Assigned but not resolvable to the viewer: neutral, never the UUID. -->
          <BaseText v-else-if="event.assignedToUserId" color="secondary">Assigned</BaseText>
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Reported By">
          <UserBadgeById
            v-if="event.reportedByUserId && visibleReporter"
            :userId="event.reportedByUserId"
          />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
      </BaseRailCard>

      <BaseRailCard title="Schedule">
        <!-- Reported date is the intake timestamp (read-only) — shown first.
             Uses the :value prop so it renders in the canonical rail value
             style (text-body / medium / on-main), consistent with other fields. -->
        <BaseDetailField
          label="Reported Date"
          :value="event.reportedDate ? toDateTime(event.reportedDate)?.formatDate('datetime') : null"
        />
        <BaseDetailField label="Occurrence Date">
          <BaseDateField v-if="canUpdate" v-model="event.occurrenceDate" mode="date" />
          <BaseText v-else color="secondary">
            {{ event.occurrenceDate ? toDateTime(event.occurrenceDate)?.formatDate('date') : '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField label="Review Due Date">
          <BaseDateField v-if="canUpdate" v-model="event.reviewDueDate" mode="date" />
          <BaseText v-else color="secondary">
            {{ event.reviewDueDate ? toDateTime(event.reviewDueDate)?.formatDate('date') : '—' }}
          </BaseText>
        </BaseDetailField>
      </BaseRailCard>
    </template>
    </BaseDetailLayout>

    <QualityEventEscalateDialog
      v-if="event"
      v-model="showEscalate"
      :eventId="props.id"
      @escalated="onEscalated"
    />

    <AuditLogDialog
      v-model="showAuditLog"
      :includeEntities="auditIncludeEntities"
      :title="`Audit Log — ${event?.eventNumber ?? 'Event'}`"
    />
  </div>
</template>
