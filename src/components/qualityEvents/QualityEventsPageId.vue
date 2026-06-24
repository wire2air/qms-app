<script setup>
import { IconArrowUpRight, IconPaperclip, IconTrash } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { upload } from '@/api'
import { useDebounceFn } from '@vueuse/core'
import {
  buildQualityEventBanners,
  buildQualityEventSections,
  buildQualityEventActions,
} from './qualityEventDetailConfig.js'

const props = defineProps({ id: { type: String, required: true } })

const toast = useToast()
const canUpdate = computed(() => isAllowed(['qualityEvents:update']))

const event = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.QualityEvent.findByPk(id),
  { models: ['QualityEvent'] },
)
const loading = computed(() => event.value === undefined)

const activeTab = ref('overview')
const tabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'review', label: 'Review' },
  { value: 'notes', label: 'Notes' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'escalations', label: 'Escalations' },
  { value: 'activity', label: 'Activity Log' },
]

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

// ── Escalations ────────────────────────────────────────────────────────────
const showEscalate = ref(false)
const links = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    const rows = await db.RecordLink.where('[fromType+fromId]', ['QualityEvent', id]).exec()
    return rows
  },
  { models: ['RecordLink'], initial: [] },
)

// ── Notes ────────────────────────────────────────────────────────────────
const notes = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) =>
    (await db.EventNote.where('qualityEventId', id).exec()).sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    ),
  { models: ['EventNote'], initial: [] },
)
const newNote = ref('')
const newNoteVisibility = ref('INTERNAL')
const addNote = useLiveMutation(async (db, payload) => {
  const n = db.EventNote.create(payload)
  await n.save()
  return n
})
async function submitNote() {
  if (!newNote.value.trim()) return
  try {
    await addNote({
      qualityEventId: props.id,
      body: newNote.value.trim(),
      visibility: newNoteVisibility.value,
    })
    newNote.value = ''
    toast.success('Note added')
  } catch (e) {
    toast.error(e.message || 'Failed to add note')
  }
}

// ── Attachments ──────────────────────────────────────────────────────────
const attachments = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.EventAttachment.where('qualityEventId', id).exec(),
  { models: ['EventAttachment'], initial: [] },
)
const createAttachment = useLiveMutation(async (db, payload) => {
  const a = db.EventAttachment.create(payload)
  await a.save()
  return a
})
const uploading = ref(false)
const fileInput = ref(null)
async function onFilePicked(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const { asset } = await upload('/v1/files/upload', form)
    await createAttachment({
      qualityEventId: props.id,
      assetId: asset?.id ?? null,
      fileName: asset?.name ?? file.name,
      contentType: asset?.mimeType ?? file.type,
      storagePath: asset?.path ?? null,
    })
    toast.success('File attached')
  } catch (err) {
    toast.error(err.message || 'Upload failed')
  } finally {
    uploading.value = false
    e.target.value = ''
  }
}
async function removeAttachment(row) {
  try {
    await row.delete()
    toast.success('Attachment removed')
  } catch (err) {
    toast.error(err.message || 'Failed to remove')
  }
}

// ── Activity log ───────────────────────────────────────────────────────────
const activity = useLiveQueryWithDeps(
  [() => props.id, () => activeTab.value],
  async (db, [id, tab]) => {
    if (tab !== 'activity') return []
    const rows = await db.AuditLog.where('[entityType+entityId]', ['QualityEvent', id]).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['AuditLog'], initial: [] },
)

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
    { canUpdate: canUpdate.value, statusId: event.value?.statusId },
    {
      escalate() {
        showEscalate.value = true
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
      <div v-if="event" class="tw:w-48">
        <QualityEventStatusSelectMenu v-if="canUpdate" v-model="event.statusId" />
        <QualityEventStatusBadgeById v-else :statusId="event.statusId" />
      </div>
    </template>

    <template v-if="event" #meta>
      <span class="tw:font-mono">{{ event.eventNumber }}</span>
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
            <BaseField v-slot="{ id: fid }" label="Title" class="tw:md:col-span-2">
              <BaseTextInput :id="fid" v-model="event.title" :disabled="!canUpdate" />
            </BaseField>
            <BaseField v-slot="{ id: fid }" label="Description" class="tw:md:col-span-2">
              <BaseTextarea :id="fid" v-model="event.description" :rows="4" :disabled="!canUpdate" />
            </BaseField>
            <BaseField label="Category">
              <EventCategorySelectMenu v-if="canUpdate" v-model="event.categoryId" :required="false" />
              <EventCategoryBadgeById v-else-if="event.categoryId" :categoryId="event.categoryId" />
              <span v-else class="tw:text-secondary">—</span>
            </BaseField>
            <BaseField label="Severity">
              <EventSeveritySelectMenu v-if="canUpdate" v-model="event.severityId" :required="false" />
              <EventSeverityBadgeById v-else-if="event.severityId" :severityId="event.severityId" />
              <span v-else class="tw:text-secondary">—</span>
            </BaseField>
            <BaseField label="Site / Location">
              <SiteSelectMenu v-if="canUpdate" v-model="event.siteId" :required="false" />
              <SiteBadgeById v-else-if="event.siteId" :siteId="event.siteId" />
              <span v-else class="tw:text-secondary">—</span>
            </BaseField>
            <BaseField label="Department">
              <DepartmentSelectMenu v-if="canUpdate" v-model="event.departmentId" :required="false" />
              <DepartmentBadgeById v-else-if="event.departmentId" :departmentId="event.departmentId" />
              <span v-else class="tw:text-secondary">—</span>
            </BaseField>
            <BaseField label="Assigned To">
              <UserSelectMenu v-if="canUpdate" v-model="event.assignedToUserId" :required="false" />
              <UserBadgeById v-else-if="event.assignedToUserId" :userId="event.assignedToUserId" />
              <span v-else class="tw:text-secondary">—</span>
            </BaseField>
            <BaseField label="Reported By">
              <UserBadgeById v-if="event.reportedByUserId" :userId="event.reportedByUserId" />
              <span v-else class="tw:text-secondary">—</span>
            </BaseField>
            <BaseField v-slot="{ id: fid }" label="Occurrence Date">
              <BaseDatePicker :id="fid" v-model="event.occurrenceDate" :disabled="!canUpdate" />
            </BaseField>
          </div>
        </BaseTabPanel>

        <!-- Review -->
        <BaseTabPanel value="review">
          <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-3xl">
            <BaseField v-slot="{ id: fid }" label="Review Summary">
              <BaseTextarea :id="fid" v-model="event.reviewSummary" :rows="3" :disabled="!canUpdate" />
            </BaseField>
            <div class="tw:grid tw:grid-cols-2 tw:gap-4">
              <BaseField label="Root cause required?">
                <div class="tw:flex tw:items-center tw:gap-2">
                  <BaseSwitch v-model="event.rootCauseRequired" :disabled="!canUpdate" />
                  <span class="tw:text-xs tw:text-secondary">Yes / No</span>
                </div>
              </BaseField>
              <BaseField label="Escalation required?">
                <div class="tw:flex tw:items-center tw:gap-2">
                  <BaseSwitch v-model="event.escalationRequired" :disabled="!canUpdate" />
                  <span class="tw:text-xs tw:text-secondary">Yes / No</span>
                </div>
              </BaseField>
            </div>
            <BaseField v-slot="{ id: fid }" label="Recommended Action">
              <BaseTextarea :id="fid" v-model="event.recommendedAction" :rows="2" :disabled="!canUpdate" />
            </BaseField>
            <BaseField v-slot="{ id: fid }" label="Decision">
              <BaseTextarea :id="fid" v-model="event.decision" :rows="2" :disabled="!canUpdate" />
            </BaseField>
            <div class="tw:grid tw:grid-cols-2 tw:gap-4">
              <BaseField v-slot="{ id: fid }" label="Review Date">
                <BaseDatePicker :id="fid" v-model="event.reviewDate" :disabled="!canUpdate" />
              </BaseField>
              <BaseField v-slot="{ id: fid }" label="Decision Date">
                <BaseDatePicker :id="fid" v-model="event.decisionDate" :disabled="!canUpdate" />
              </BaseField>
            </div>
          </div>
        </BaseTabPanel>

        <!-- Notes -->
        <BaseTabPanel value="notes">
          <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-3xl">
            <div v-if="canUpdate" class="tw:flex tw:flex-col tw:gap-2 tw:border tw:border-divider tw:rounded-lg tw:p-3">
              <BaseTextarea v-model="newNote" :rows="2" placeholder="Add a note…" />
              <div class="tw:flex tw:items-center tw:justify-between">
                <div class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary">
                  Visibility
                  <select v-model="newNoteVisibility" class="tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1 tw:text-xs">
                    <option value="INTERNAL">Internal</option>
                    <option value="PUBLIC">Public</option>
                  </select>
                </div>
                <BaseButton variant="primary" size="sm" :disabled="!newNote.trim()" @click="submitNote">
                  Add Note
                </BaseButton>
              </div>
            </div>
            <div v-if="!notes.length" class="tw:text-sm tw:text-secondary tw:italic">No notes yet.</div>
            <div
              v-for="note in notes"
              :key="note.id"
              class="tw:border tw:border-divider tw:rounded-lg tw:p-3"
            >
              <div class="tw:flex tw:items-center tw:gap-2 tw:mb-1">
                <UserBadgeById v-if="note.createdBy" :userId="note.createdBy" />
                <span class="tw:text-xs tw:text-secondary">{{ note.createdAt?.formatDate('datetime') }}</span>
                <BaseBadge
                  class="tw:ml-auto"
                  :class="note.visibility === 'PUBLIC' ? 'tw:bg-blue-100 tw:text-blue-700' : 'tw:bg-gray-100 tw:text-gray-600'"
                >
                  {{ note.visibility === 'PUBLIC' ? 'Public' : 'Internal' }}
                </BaseBadge>
              </div>
              <p class="tw:text-sm tw:text-on-main tw:whitespace-pre-wrap">{{ note.body }}</p>
            </div>
          </div>
        </BaseTabPanel>

        <!-- Attachments -->
        <BaseTabPanel value="attachments">
          <div class="tw:flex tw:flex-col tw:gap-3 tw:max-w-3xl">
            <div v-if="canUpdate">
              <button
                type="button"
                class="tw:inline-flex tw:items-center tw:gap-2 tw:cursor-pointer tw:text-sm tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0"
                :disabled="uploading"
                @click="fileInput?.click()"
              >
                <IconPaperclip :size="16" />
                {{ uploading ? 'Uploading…' : 'Attach a file' }}
              </button>
              <input ref="fileInput" type="file" class="tw:hidden" :disabled="uploading" @change="onFilePicked" />
            </div>
            <div v-if="!attachments.length" class="tw:text-sm tw:text-secondary tw:italic">No attachments.</div>
            <div
              v-for="a in attachments"
              :key="a.id"
              class="tw:flex tw:items-center tw:gap-2 tw:border tw:border-divider tw:rounded-lg tw:px-3 tw:py-2"
            >
              <IconPaperclip :size="16" class="tw:text-secondary" />
              <span class="tw:text-sm tw:text-on-main">{{ a.fileName || 'File' }}</span>
              <span class="tw:text-xs tw:text-secondary">{{ a.contentType }}</span>
              <button
                v-if="canUpdate"
                class="tw:ml-auto tw:p-1 tw:rounded tw:text-secondary tw:hover:text-red-600"
                title="Remove"
                @click="removeAttachment(a)"
              >
                <IconTrash :size="15" />
              </button>
            </div>
          </div>
        </BaseTabPanel>

        <!-- Escalations -->
        <BaseTabPanel value="escalations">
          <div class="tw:flex tw:flex-col tw:gap-3 tw:max-w-3xl">
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
              <span class="tw:text-xs tw:text-secondary tw:font-mono">{{ link.toId }}</span>
              <span class="tw:ml-auto tw:text-xs tw:text-secondary">{{ link.relation }}</span>
            </RouterLink>
          </div>
        </BaseTabPanel>

        <!-- Activity -->
        <BaseTabPanel value="activity">
          <div class="tw:flex tw:flex-col tw:gap-2 tw:max-w-3xl">
            <div v-if="!activity.length" class="tw:text-sm tw:text-secondary tw:italic">No activity recorded yet.</div>
            <div
              v-for="log in activity"
              :key="log.id"
              class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:border-b tw:border-divider tw:py-2"
            >
              <span class="tw:font-medium tw:text-on-main">{{ log.action }}</span>
              <UserBadgeById v-if="log.performedBy" :userId="log.performedBy" />
              <span class="tw:ml-auto tw:text-xs tw:text-secondary">{{ log.createdAt?.formatDate('datetime') }}</span>
            </div>
          </div>
        </BaseTabPanel>
      </BaseTabs>
    </template>
  </BaseDetailLayout>

  <QualityEventEscalateDialog
    v-if="event"
    v-model="showEscalate"
    :eventId="props.id"
    @escalated="onEscalated"
  />
</template>
