<script setup>
import { IconLayoutDashboard } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const canCreate = computed(() => isAllowed(['qualityEvents:create']))
const canDelete = computed(() => isAllowed(['qualityEvents:delete']))

const filters = ref({ search: '', statusId: null, categoryId: null, severityId: null })
const showCreate = ref(false)

const events = useLiveQueryWithDeps(
  [
    () => filters.value.search,
    () => filters.value.statusId,
    () => filters.value.categoryId,
    () => filters.value.severityId,
  ],
  async (db, [search, statusId, categoryId, severityId]) => {
    let results = await db.QualityEvent.where().exec()
    if (search) {
      const q = search.toLowerCase()
      results = results.filter(
        (r) => r.title?.toLowerCase().includes(q) || r.eventNumber?.toLowerCase().includes(q),
      )
    }
    if (statusId) results = results.filter((r) => r.statusId === statusId)
    if (categoryId) results = results.filter((r) => r.categoryId === categoryId)
    if (severityId) results = results.filter((r) => r.severityId === severityId)
    return results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['QualityEvent'], initial: [] },
)

// Which events have been escalated (a record_links row with fromType QualityEvent).
const escalations = useLiveQuery((db) => db.RecordLink.where().exec(), {
  models: ['RecordLink'],
  initial: [],
})
const escalatedIds = computed(
  () =>
    new Set(
      (escalations.value || [])
        .filter((l) => l.fromType === 'QualityEvent')
        .map((l) => l.fromId),
    ),
)

async function onDeleteRow(row) {
  if (
    !(await confirm({
      title: 'Delete event',
      message: `Delete event ${row.eventNumber || ''} "${row.title}"?`,
      okLabel: 'Delete',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await row.delete()
    toast.success('Event deleted')
  } catch (e) {
    toast.error(e.message || 'Failed to delete')
  }
}

function onCreated(event) {
  showCreate.value = false
  if (event?.id) router.push(getCompanyPath(`/qualityEvents/${event.id}`))
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader
      title="Events & Observations"
      subtitle="Log quality observations, concerns, and near-misses — escalate only when justified."
    >
      <template #actions>
        <BaseButton variant="outline" @click="router.push(getCompanyPath('/qualityEvents/dashboard'))">
          <IconLayoutDashboard :size="16" class="tw:mr-1" />
          Dashboard
        </BaseButton>
        <BaseButton v-if="canCreate" variant="primary" @click="showCreate = true">Log Event</BaseButton>
      </template>
    </PageHeader>

    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseTextInput
        v-model="filters.search"
        placeholder="Search events…"
        size="sm"
        class="tw:w-64"
      />
      <div class="tw:w-44"><QualityEventStatusSelectMenu v-model="filters.statusId" :required="false" /></div>
      <div class="tw:w-48"><EventCategorySelectMenu v-model="filters.categoryId" :required="false" /></div>
      <div class="tw:w-44"><EventSeveritySelectMenu v-model="filters.severityId" :required="false" /></div>
    </div>

    <QualityEventsTable
      :rows="events"
      :escalatedIds="escalatedIds"
      :canDelete="canDelete"
      @delete="onDeleteRow"
    />

    <QualityEventCreateDialog v-model="showCreate" @created="onCreated" />
  </BasePage>
</template>
