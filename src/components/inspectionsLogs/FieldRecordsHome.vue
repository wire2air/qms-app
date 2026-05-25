<script setup>
import { IconFileText, IconLock, IconAlertCircle, IconShieldCheck } from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { DateTime } from 'luxon'

/**
 * Field Records — the submitted records that landed in the new
 * field_records table (Inspections & Logs path). Not the legacy
 * `records` table.
 *
 * Defaults to "mine" but admins with fieldRecords:read_all can flip a
 * filter to see everyone's records. The Sync engine already enforces
 * the RLS visibility on the wire — this filter is just for UI ergonomics.
 */
// Match the convention used across CAPA / Change Request / NC pages:
// .id is the user-on-company id set when the active company is picked;
// .userId is the older legacy field. Order matters — reversing it left
// these pages empty for new records.
const userId = computed(() => currentSession.value?.id ?? currentSession.value?.userId)
const canReadAll = computed(() => isAllowed(['fieldRecords:read_all']))

const scope = ref('mine') // 'mine' | 'all'
const statusFilter = ref('all') // 'all' | 'SUBMITTED' | 'LOCKED' | 'UNDER_REVIEW' | 'VOIDED'

const records = useLiveQueryWithDeps(
  [() => userId.value, () => scope.value, () => statusFilter.value],
  async (db, [uid, scopeVal, status]) => {
    let rows = await db.FieldRecord.where().exec()
    if (scopeVal === 'mine' && uid) {
      rows = rows.filter((r) => r.submittedByUserId === uid)
    }
    if (status !== 'all') {
      rows = rows.filter((r) => r.statusId === status)
    }
    return rows.sort(
      (a, b) => (b.submittedAt?.toMillis?.() ?? 0) - (a.submittedAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const formTemplates = useLiveQuery((db) => db.FormTemplate.where().exec(), { initial: [] })
const templateById = computed(() => new Map(formTemplates.value.map((t) => [t.id, t])))

function templateTitle(record) {
  return templateById.value.get(record.formTemplateId)?.title ?? record.formTemplateId
}

function statusBadgeClass(statusId) {
  switch (statusId) {
    case 'SUBMITTED':
      return 'tw:bg-blue-100 tw:text-blue-700'
    case 'LOCKED':
      return 'tw:bg-gray-200 tw:text-gray-800'
    case 'UNDER_REVIEW':
      return 'tw:bg-amber-100 tw:text-amber-700'
    case 'APPROVED':
      return 'tw:bg-green-100 tw:text-green-700'
    case 'REJECTED':
      return 'tw:bg-red-100 tw:text-red-700'
    case 'VOIDED':
      return 'tw:bg-purple-100 tw:text-purple-700'
    default:
      return 'tw:bg-gray-100 tw:text-gray-700'
  }
}

function classificationBadgeClass(cls) {
  if (cls === 'CONTROLLED_RECORD') return 'tw:bg-red-50 tw:text-red-700 tw:border-red-200'
  if (cls === 'OPERATIONAL_LOG') return 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200'
  return 'tw:bg-gray-50 tw:text-gray-600 tw:border-gray-200'
}

function fmtDate(dt) {
  if (!dt) return '—'
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy HH:mm')
  const d = new Date(dt)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

const lockCountdown = (dt) => {
  if (!dt) return null
  const ms = dt.toMillis() - DateTime.now().toMillis()
  if (ms <= 0) return null
  const minutes = Math.round(ms / 60_000)
  if (minutes > 60 * 24) return `${Math.round(minutes / (60 * 24))}d`
  if (minutes > 60) return `${Math.round(minutes / 60)}h`
  return `${minutes}m`
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:h-full tw:p-5 tw:overflow-y-auto">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Field Records</h2>
      </div>
    </SafeTeleport>

    <div class="tw:flex tw:flex-col tw:gap-1">
      <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Field Records</div>
      <div class="tw:text-sm tw:text-secondary">
        Submitted records on OPERATIONAL_LOG and CONTROLLED_RECORD form templates. Distinct from the
        legacy /records page which shows UTILITY records.
      </div>
    </div>

    <!-- Filters -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
      <div v-if="canReadAll" class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Scope</span>
        <select
          v-model="scope"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="mine">My records only</option>
          <option value="all">All in tenant</option>
        </select>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <span class="tw:text-xs tw:text-secondary">Status</span>
        <select
          v-model="statusFilter"
          class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
        >
          <option value="all">All</option>
          <option value="SUBMITTED">Submitted (in window)</option>
          <option value="LOCKED">Locked</option>
          <option value="UNDER_REVIEW">Under review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="VOIDED">Voided</option>
        </select>
      </div>
    </div>

    <!-- Empty -->
    <div
      v-if="records.length === 0"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:py-16 tw:text-secondary"
    >
      <IconFileText :size="48" class="tw:opacity-60" />
      <div class="tw:text-sm">
        No field records yet. Submit one via the
        <RouterLink to="../records" class="tw:text-primary tw:underline">/records</RouterLink>
        page with a classified form template.
      </div>
    </div>

    <!-- Table -->
    <div v-else class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden">
      <table class="tw:w-full tw:text-sm">
        <thead class="tw:bg-main">
          <tr class="tw:text-left">
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Form</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Classification</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Status</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Submitted</th>
            <th class="tw:px-3 tw:py-2 tw:font-semibold tw:text-secondary">Lock</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in records"
            :key="row.id"
            class="tw:border-t tw:border-divider tw:hover:bg-main-hover"
          >
            <td class="tw:px-3 tw:py-2">
              <div class="tw:font-medium tw:text-on-main">{{ templateTitle(row) }}</div>
              <div class="tw:text-xs tw:text-secondary tw:truncate">{{ row.id }}</div>
            </td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-0.5 tw:border"
                :class="classificationBadgeClass(row.recordClassification)"
              >
                <IconShieldCheck
                  v-if="row.recordClassification === 'CONTROLLED_RECORD'"
                  :size="10"
                />
                {{ row.recordClassification?.replace('_', ' ') }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2">
              <span
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-bold tw:rounded tw:px-2 tw:py-0.5"
                :class="statusBadgeClass(row.statusId)"
              >
                <IconLock v-if="row.statusId === 'LOCKED'" :size="10" />
                <IconAlertCircle v-if="row.statusId === 'UNDER_REVIEW'" :size="10" />
                {{ row.statusId?.replace('_', ' ') }}
              </span>
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-secondary tw:text-xs">
              {{ fmtDate(row.submittedAt) }}
            </td>
            <td class="tw:px-3 tw:py-2 tw:text-xs">
              <template v-if="row.statusId === 'LOCKED'">
                <span class="tw:text-gray-700">
                  locked
                  <span v-if="row.lockReason" class="tw:text-secondary">
                    ({{ row.lockReason.toLowerCase() }})
                  </span>
                </span>
              </template>
              <template v-else-if="row.lockAt && lockCountdown(row.lockAt)">
                <span class="tw:text-amber-700">
                  editable for {{ lockCountdown(row.lockAt) }}
                </span>
              </template>
              <template v-else-if="row.lockAt">
                <span class="tw:text-secondary">expires {{ fmtDate(row.lockAt) }}</span>
              </template>
              <template v-else>
                <span class="tw:text-secondary">—</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
