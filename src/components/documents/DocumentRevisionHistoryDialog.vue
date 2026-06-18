<script setup>
import { IconHistory, IconShieldCheck } from '@tabler/icons-vue'

/**
 * Revision History for a Document — the audit-facing view of every version
 * (DRAFT through SUPERSEDED) with change-control metadata and approval
 * chain. Drives ISO 9001 / 13485 / 21 CFR Part 11 traceability:
 * "who changed what, why, and who approved it."
 *
 * Approver info comes from audit_logs (action='APPROVE' or 'SET_EFFECTIVE')
 * keyed by version id — the same pattern PrintLayout already uses for the
 * "Approvals & Signatures" section.
 */

const props = defineProps({
  documentId: { type: String, required: true },
  documentTitle: { type: String, default: '' },
})

const show = defineModel({ type: Boolean, default: false })

const versions = useLiveQueryWithDeps(
  [() => props.documentId, () => show.value],
  async (db, [docId, isOpen]) => {
    if (!docId || !isOpen) return []
    return db.DocumentVersion.where('documentId', docId)
      .orderBy('versionMajor', 'desc')
      .exec()
      .then((rows) =>
        // Secondary sort by versionMinor (orderBy chains the first comparison only).
        [...rows].sort((a, b) => {
          if (a.versionMajor !== b.versionMajor) return b.versionMajor - a.versionMajor
          return (b.versionMinor ?? 0) - (a.versionMinor ?? 0)
        }),
      )
  },

  { models: ['DocumentVersion'], initial: [] },
)

const versionIds = computed(() => (versions.value ?? []).map((v) => v.id))

const APPROVAL_ACTIONS = ['APPROVE', 'SET_EFFECTIVE']

// Pull APPROVE / SET_EFFECTIVE audit rows for every version on the doc so
// we can show approver + approved-at without joining to TaskInstance/Signature
// (same pattern PrintLayout uses).
//
// Uses the compound [entityType+entityId] index on auditLogs — there is no
// solo `entityId` index, so a `where('entityId', …)` query throws
// NotFoundError. Both 'DocumentVersions' and 'DocumentVersion' are tried to
// catch legacy rows.
const approvalLogs = useLiveQueryWithDeps(
  [() => versionIds.value.join(','), () => show.value],
  async (db, [idsKey, isOpen]) => {
    if (!isOpen) return []
    const ids = idsKey.split(',').filter(Boolean)
    if (!ids.length) return []
    const rows = []
    for (const id of ids) {
      for (const type of ['DocumentVersions', 'DocumentVersion']) {
        const r = await db.AuditLog.where('[entityType+entityId]', [type, id]).exec()
        rows.push(...r)
      }
    }
    return rows.filter((l) => APPROVAL_ACTIONS.includes(l.action))
  },

  { models: ['AuditLog'], initial: [] },
)

// Map: versionId -> { approverId, approvedAt }
// Picks the latest APPROVE (or SET_EFFECTIVE if no APPROVE) per version.
const approvalByVersion = computed(() => {
  const map = {}
  for (const log of approvalLogs.value ?? []) {
    const existing = map[log.entityId]
    if (!existing) {
      map[log.entityId] = { who: log.performedBy, when: log.performedAt, action: log.action }
      continue
    }
    // Prefer APPROVE over SET_EFFECTIVE; otherwise prefer the most recent.
    const preferNew =
      (log.action === 'APPROVE' && existing.action !== 'APPROVE') ||
      (log.action === existing.action &&
        (log.performedAt?.toMillis?.() ?? 0) > (existing.when?.toMillis?.() ?? 0))
    if (preferNew) {
      map[log.entityId] = { who: log.performedBy, when: log.performedAt, action: log.action }
    }
  }
  return map
})

function fmtDate(dt) {
  if (!dt) return '—'
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy')
  return new Date(dt).toLocaleDateString()
}

function versionLabel(v) {
  if (v?.versionLabel) return v.versionLabel
  return `v${v?.versionMajor ?? '?'}.${v?.versionMinor ?? 0}`
}

const STATUS_CLASS = {
  DRAFT: 'tw:bg-gray-100 tw:text-gray-700',
  IN_REVIEW: 'tw:bg-blue-100 tw:text-blue-800',
  CHANGES_REQUESTED: 'tw:bg-amber-100 tw:text-amber-800',
  REJECTED: 'tw:bg-red-100 tw:text-red-800',
  APPROVED: 'tw:bg-emerald-100 tw:text-emerald-800',
  EFFECTIVE: 'tw:bg-green-100 tw:text-green-900',
  SUPERSEDED: 'tw:bg-slate-100 tw:text-slate-700',
  ARCHIVED: 'tw:bg-stone-200 tw:text-stone-700',
}

const TYPE_CLASS = {
  ADMINISTRATIVE: 'tw:bg-gray-100 tw:text-gray-700',
  MINOR: 'tw:bg-blue-50 tw:text-blue-700',
  MAJOR: 'tw:bg-purple-50 tw:text-purple-700',
}
</script>

<template>
  <BaseDialog v-model="show" maxWidth="6xl">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconHistory :size="22" />
        </div>
        <div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">Revision History</div>
          <div v-if="documentTitle" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ documentTitle }}
          </div>
        </div>
      </div>
    </template>

    <div v-if="!versions.length" class="tw:text-center tw:py-12 tw:text-secondary tw:text-sm">
      No versions found for this document.
    </div>

    <div v-else class="tw:overflow-x-auto">
      <table class="tw:w-full tw:text-sm tw:border-collapse">
        <thead>
          <tr
            class="tw:text-left tw:text-xs tw:uppercase tw:tracking-wide tw:text-secondary tw:border-b tw:border-divider"
          >
            <th class="tw:py-2 tw:pr-3">Version</th>
            <th class="tw:py-2 tw:pr-3">Status</th>
            <th class="tw:py-2 tw:pr-3">Type</th>
            <th class="tw:py-2 tw:pr-3">Created</th>
            <th class="tw:py-2 tw:pr-3">Effective</th>
            <th class="tw:py-2 tw:pr-3">Approved</th>
            <th class="tw:py-2 tw:pr-3">Reason for change</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in versions" :key="v.id" class="tw:border-b tw:border-divider tw:align-top">
            <td class="tw:py-3 tw:pr-3 tw:font-mono tw:font-semibold tw:whitespace-nowrap">
              {{ versionLabel(v) }}
            </td>
            <td class="tw:py-3 tw:pr-3">
              <span
                class="tw:inline-flex tw:items-center tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold"
                :class="STATUS_CLASS[v.statusId] || 'tw:bg-gray-100 tw:text-gray-600'"
              >
                {{ v.statusId }}
              </span>
            </td>
            <td class="tw:py-3 tw:pr-3">
              <span
                v-if="v.changeType"
                class="tw:inline-flex tw:items-center tw:rounded tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium"
                :class="TYPE_CLASS[v.changeType] || 'tw:bg-gray-100 tw:text-gray-600'"
              >
                {{ v.changeType }}
              </span>
              <span v-else class="tw:text-secondary">—</span>
              <span
                v-if="v.regulatoryImpact"
                class="tw:ml-1.5 tw:inline-flex tw:items-center tw:gap-0.5 tw:rounded tw:bg-amber-100 tw:text-amber-800 tw:px-1.5 tw:py-0.5 tw:text-micro tw:font-semibold"
                title="Regulatory impact flagged"
              >
                <IconShieldCheck :size="10" /> REG
              </span>
            </td>
            <td class="tw:py-3 tw:pr-3 tw:whitespace-nowrap">
              <div>{{ fmtDate(v.createdAt) }}</div>
              <div v-if="v.createdBy" class="tw:text-xs tw:text-secondary">
                <UserBadgeById :userId="v.createdBy" />
              </div>
            </td>
            <td class="tw:py-3 tw:pr-3 tw:whitespace-nowrap">
              {{ fmtDate(v.effectiveDate) }}
            </td>
            <td class="tw:py-3 tw:pr-3 tw:whitespace-nowrap">
              <template v-if="approvalByVersion[v.id]">
                <div>{{ fmtDate(approvalByVersion[v.id].when) }}</div>
                <div class="tw:text-xs tw:text-secondary">
                  <UserBadgeById :userId="approvalByVersion[v.id].who" />
                </div>
              </template>
              <span v-else class="tw:text-secondary">—</span>
            </td>
            <td class="tw:py-3 tw:pr-3 tw:max-w-md">
              <div v-if="v.changeReason" class="tw:text-on-main">
                {{ v.changeReason }}
              </div>
              <div v-else class="tw:text-secondary">—</div>
              <div
                v-if="v.changeSummary"
                class="tw:mt-1 tw:text-xs tw:text-secondary tw:italic tw:line-clamp-3"
              >
                {{ v.changeSummary }}
              </div>
              <div
                v-if="v.regulatoryImpact && v.regulatoryImpactNotes"
                class="tw:mt-1 tw:text-xs tw:text-amber-700"
              >
                <strong>Regulatory impact:</strong> {{ v.regulatoryImpactNotes }}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="show = false">Close</BaseButton>
    </template>
  </BaseDialog>
</template>
