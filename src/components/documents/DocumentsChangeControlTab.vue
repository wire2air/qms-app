<script setup>
import {
  IconHistory,
  IconShieldCheck,
  IconInfoCircle,
  IconLock,
  IconAlertTriangle,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'

/**
 * Change Control tab for a specific DocumentVersion.
 *
 * Displays + edits the change-control metadata captured at version creation:
 * change reason, type, regulatory impact, affected sections. Editable only
 * when the version is in a mutable status (DRAFT or REJECTED) and the user
 * has documents:update — otherwise read-only.
 *
 * v1.0 fields are optional (no prior version to "change from"). v > 1.0
 * has change_reason enforced server-side by a CHECK constraint, but we
 * don't re-validate here because the user can only land in this tab after
 * a successful creation — they're only refining existing values.
 *
 * Auto-save: same pattern as DocumentsMainContentLeft — deep watcher with
 * debouncedSave + isFirstLoad guard to skip the initial trigger.
 */

const props = defineProps({
  documentId: { type: String, required: true },
  versionId: { type: String, default: null },
})

const version = useLiveQueryWithDeps([() => props.versionId], async (db, [id]) =>
  id ? db.DocumentVersion.findByPk(id) : null,
)

// Document context — original doc creator (Document.userId) counts as an
// owner, alongside the current revision's author (DocumentVersion.createdBy).
// Both are allowed to edit change control during draft/review.
const document = useLiveQueryWithDeps([() => props.documentId], async (db, [id]) =>
  id ? db.Document.findByPk(id) : null,
)

// Collaborators have explicit edit access too — `users_on_documents`
// (UserOnDocument client model) is the join table. The Collaborators
// sidebar lets the owner add them. Without this lookup, only the owner +
// revision author could edit; reviewers and other permission-holders
// can't, which matches the QMS rule.
const collaboratorRecords = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [docId]) => {
    if (!docId) return []
    const rows = await db.UserOnDocument.where().exec()
    return rows.filter((r) => r.documentId === docId && !r.deletedAt)
  },
  { initial: [] },
)

const sections = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [vid]) => {
    if (!vid) return []
    const rows = await db.DocumentSection.where('documentVersionId', vid).exec()
    return rows.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  },
  { initial: [] },
)

// "Authorised editor" — owner, current revision author, or an explicit
// collaborator. Everyone else (including reviewers who hold the same
// permission) is read-only.
const isAuthorisedEditor = computed(() => {
  const userId = currentSession.value?.userId
  if (!userId) return false
  if (version.value?.createdBy === userId) return true
  if (document.value?.userId === userId) return true
  return (collaboratorRecords.value ?? []).some((r) => r.userId === userId)
})

// Editable iff: permission holds, the version is in a mutable status, AND
// the user is the owner / revision author / a collaborator. Once the
// version moves out of DRAFT/REJECTED — even into IN_REVIEW — change
// control is locked. EFFECTIVE = locked for everyone (must create a new
// revision to change anything).
const canUpdate = computed(
  () =>
    isAllowed(['documents:update']) &&
    isAuthorisedEditor.value &&
    version.value &&
    ['DRAFT', 'REJECTED'].includes(version.value.statusId),
)

const isInitial = computed(() => {
  const v = version.value
  if (!v) return false
  return (v.versionMajor ?? 1) === 1 && (v.versionMinor ?? 0) === 0
})

const CHANGE_TYPES = [
  {
    value: 'ADMINISTRATIVE',
    label: 'Administrative',
    description: 'Typos, formatting, ownership change. No procedural impact.',
  },
  {
    value: 'MINOR',
    label: 'Minor',
    description: 'Clarification or small procedural detail. Workflow unchanged.',
  },
  {
    value: 'MAJOR',
    label: 'Major',
    description: 'Workflow, scope, or compliance reference changed.',
  },
]

// Auto-save the version on field edits.
const isSaving = ref(false)
const saveError = ref(null)
const isFirstLoad = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!version.value || !canUpdate.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await version.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    isSaving.value = false
  }
}, 500)

watch(
  version,
  (v) => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (v && canUpdate.value) debouncedSave()
  },
  { deep: true },
)

function toggleAffected(sectionId) {
  if (!version.value || !canUpdate.value) return
  const list = version.value.affectedSectionIds || []
  const idx = list.indexOf(sectionId)
  if (idx === -1) {
    version.value.affectedSectionIds = [...list, sectionId]
  } else {
    version.value.affectedSectionIds = list.filter((id) => id !== sectionId)
  }
}

function setChangeType(value) {
  if (!canUpdate.value) return
  version.value.changeType = version.value.changeType === value ? null : value
}

const STATUS_LABEL = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  CHANGES_REQUESTED: 'Changes Requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  EFFECTIVE: 'Effective',
  SUPERSEDED: 'Superseded',
  ARCHIVED: 'Archived',
}
</script>

<template>
  <div v-if="!version" class="tw:py-10 tw:text-secondary tw:text-center">Loading…</div>
  <div v-else class="tw:max-w-4xl tw:mx-auto tw:py-4 tw:flex tw:flex-col tw:gap-6">
    <section class="tw:bg-sidebar tw:rounded-2xl tw:shadow-sm tw:border tw:border-divider tw:p-6">
      <header class="tw:flex tw:items-start tw:justify-between tw:gap-3 tw:mb-6">
        <div class="tw:flex tw:items-start tw:gap-3">
          <div
            class="tw:flex tw:items-center tw:justify-center tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:text-primary"
          >
            <IconHistory :size="22" />
          </div>
          <div>
            <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Change Control</h2>
            <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
              v{{ version.versionMajor }}.{{ version.versionMinor }} ·
              {{ STATUS_LABEL[version.statusId] || version.statusId }}
              <span v-if="!canUpdate" class="tw:ml-1 tw:inline-flex tw:items-center tw:gap-0.5">
                <IconLock :size="11" /> read-only
              </span>
            </p>
          </div>
        </div>
        <span v-if="isSaving" class="tw:text-xs tw:text-secondary">Saving…</span>
        <span v-else-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</span>
      </header>

      <!-- v1.0 banner: optional fields -->
      <div
        v-if="isInitial"
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-blue-900 tw:text-xs tw:mb-5"
      >
        <IconInfoCircle :size="16" class="tw:mt-0.5 tw:flex-none" />
        <div>
          <strong>Initial release (v1.0).</strong> Change control fields are optional here — there's
          no prior version to "change from". They become required on every revision after.
        </div>
      </div>

      <!-- Change reason -->
      <div class="tw:flex tw:flex-col tw:gap-1.5 tw:mb-5">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Reason for change
          <span v-if="!isInitial" class="tw:text-red-600">*</span>
          <span class="tw:text-xs tw:font-normal tw:text-secondary tw:ml-1">(why this revision?)</span>
        </label>
        <BaseTextarea
          v-if="canUpdate"
          v-model="version.changeReason"
          :rows="2"
          placeholder="e.g. New calibration interval required by SOP-014 revision 4."
        />
        <div
          v-else
          class="tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider tw:text-sm tw:whitespace-pre-wrap"
        >
          {{ version.changeReason || '—' }}
        </div>
      </div>

      <!-- Description of change -->
      <div class="tw:flex tw:flex-col tw:gap-1.5 tw:mb-5">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Description of change
          <span class="tw:text-xs tw:font-normal tw:text-secondary tw:ml-1">
            (what reviewers should focus on)
          </span>
        </label>
        <BaseTextarea
          v-if="canUpdate"
          v-model="version.changeSummary"
          :rows="3"
          placeholder="Summarise the substantive content changes in this revision."
        />
        <div
          v-else
          class="tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider tw:text-sm tw:whitespace-pre-wrap"
        >
          {{ version.changeSummary || '—' }}
        </div>
      </div>

      <!-- Change type -->
      <div class="tw:flex tw:flex-col tw:gap-2 tw:mb-5">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Change type
          <span v-if="!isInitial" class="tw:text-red-600">*</span>
        </label>
        <div
          v-if="canUpdate"
          class="tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-2"
        >
          <button
            v-for="opt in CHANGE_TYPES"
            :key="opt.value"
            type="button"
            class="tw:flex tw:flex-col tw:items-start tw:text-left tw:p-3 tw:rounded-lg tw:border tw:transition-colors tw:cursor-pointer"
            :class="
              version.changeType === opt.value
                ? 'tw:border-primary tw:bg-primary/5 tw:text-on-sidebar'
                : 'tw:border-divider tw:bg-main-hover tw:text-secondary tw:hover:border-primary/40'
            "
            @click="setChangeType(opt.value)"
          >
            <span class="tw:text-sm tw:font-semibold">{{ opt.label }}</span>
            <span class="tw:text-xs tw:mt-1 tw:leading-snug">{{ opt.description }}</span>
          </button>
        </div>
        <div v-else class="tw:p-3 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider tw:text-sm">
          {{ version.changeType || '—' }}
        </div>
      </div>

      <!-- Affected sections -->
      <div v-if="sections.length" class="tw:flex tw:flex-col tw:gap-1.5 tw:mb-5">
        <label class="tw:text-sm tw:font-medium tw:text-on-sidebar">
          Affected sections
          <span class="tw:text-xs tw:font-normal tw:text-secondary tw:ml-1">
            (reviewer focus)
          </span>
        </label>
        <div
          class="tw:max-h-48 tw:overflow-y-auto tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:p-2 tw:flex tw:flex-col tw:gap-1"
        >
          <template v-if="canUpdate">
            <label
              v-for="s in sections"
              :key="s.id"
              class="tw:flex tw:items-center tw:gap-2 tw:p-1.5 tw:rounded tw:cursor-pointer tw:hover:bg-sidebar"
            >
              <input
                type="checkbox"
                :checked="(version.affectedSectionIds || []).includes(s.id)"
                class="tw:size-4 tw:accent-primary tw:cursor-pointer"
                @change="toggleAffected(s.id)"
              />
              <span class="tw:text-sm">{{ s.order ?? '?' }}. {{ s.title || '(untitled)' }}</span>
            </label>
          </template>
          <template v-else>
            <div
              v-for="s in sections"
              :key="s.id"
              class="tw:flex tw:items-center tw:gap-2 tw:p-1.5 tw:text-sm"
              :class="
                (version.affectedSectionIds || []).includes(s.id)
                  ? 'tw:text-on-sidebar tw:font-medium'
                  : 'tw:text-secondary'
              "
            >
              <span
                class="tw:size-4 tw:rounded tw:border tw:border-divider tw:flex tw:items-center tw:justify-center tw:text-[10px]"
                :class="
                  (version.affectedSectionIds || []).includes(s.id)
                    ? 'tw:bg-primary tw:text-white tw:border-primary'
                    : ''
                "
              >
                {{ (version.affectedSectionIds || []).includes(s.id) ? '✓' : '' }}
              </span>
              <span>{{ s.order ?? '?' }}. {{ s.title || '(untitled)' }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- Regulatory impact -->
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:rounded-lg tw:bg-main-hover tw:border tw:border-divider">
        <label
          class="tw:flex tw:items-start tw:gap-3"
          :class="canUpdate ? 'tw:cursor-pointer' : ''"
        >
          <input
            v-model="version.regulatoryImpact"
            type="checkbox"
            class="tw:mt-0.5 tw:size-4 tw:accent-primary"
            :class="canUpdate ? 'tw:cursor-pointer' : 'tw:cursor-default'"
            :disabled="!canUpdate"
          />
          <div class="tw:flex tw:flex-col tw:gap-0.5">
            <span class="tw:text-sm tw:font-medium tw:text-on-sidebar tw:flex tw:items-center tw:gap-1.5">
              <IconShieldCheck :size="14" /> Regulatory impact
            </span>
            <span class="tw:text-xs tw:text-secondary">
              Affects a regulatory submission, claimed standard (ISO, FDA), or compliance scope.
            </span>
          </div>
        </label>

        <div v-if="version.regulatoryImpact" class="tw:flex tw:flex-col tw:gap-1.5">
          <label class="tw:text-xs tw:font-medium tw:text-secondary">
            Regulatory impact notes
            <span class="tw:text-red-600">*</span>
          </label>
          <BaseTextarea
            v-if="canUpdate"
            v-model="version.regulatoryImpactNotes"
            :rows="2"
            placeholder="Which standard / submission is affected? What changed?"
          />
          <div
            v-else
            class="tw:p-3 tw:rounded-lg tw:bg-sidebar tw:border tw:border-divider tw:text-sm tw:whitespace-pre-wrap"
          >
            {{ version.regulatoryImpactNotes || '—' }}
          </div>
        </div>
      </div>
    </section>

    <!-- Audit footer — read-only context auditors look for -->
    <section
      class="tw:bg-sidebar tw:rounded-2xl tw:shadow-sm tw:border tw:border-divider tw:p-4 tw:text-xs tw:text-secondary tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-1"
    >
      <div>
        <strong class="tw:text-on-sidebar">Created</strong>
        {{ version.createdAt?.toFormat?.('LLL d, yyyy') ?? '—' }}
        <span v-if="version.createdBy"> by <UserBadgeById :userId="version.createdBy" /></span>
      </div>
      <div v-if="version.effectiveDate">
        <strong class="tw:text-on-sidebar">Effective</strong>
        {{ version.effectiveDate?.toFormat?.('LLL d, yyyy') ?? version.effectiveDate }}
      </div>
      <div v-if="version.approvedAt">
        <strong class="tw:text-on-sidebar">Approved at</strong>
        {{ version.approvedAt?.toFormat?.('LLL d, yyyy HH:mm') ?? '—' }}
      </div>
    </section>

    <div
      v-if="version.regulatoryImpact && !version.regulatoryImpactNotes && canUpdate"
      class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
    >
      <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
      <div>
        Regulatory impact is flagged — notes are required. The save will fail until you fill them in.
      </div>
    </div>
  </div>
</template>
