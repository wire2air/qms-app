<script setup>
import { IconSchool, IconCalendar, IconUsers, IconClock, IconSparkles } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { DateTime } from 'luxon'
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  documentId: { type: String, required: true },
  versionId: { type: String, default: null },
})

const toast = useToast()

// The currently selected version (for editing trainingConfig in DRAFT / IN_REVIEW)
const selectedVersion = useLiveQueryWithDeps(
  [() => props.versionId],

  async (db, [id]) => (id ? db.DocumentVersion.findByPk(id) : null),
  { models: ['DocumentVersion'] },
)

// Document + collaborator context. Editable by: original doc creator
// (Document.userId), current revision's author (DocumentVersion.createdBy),
// or any user listed as a collaborator (users_on_documents). Reviewers
// and other permission-holders are read-only.
const document = useLiveQueryWithDeps(
  [() => props.documentId],

  async (db, [id]) => (id ? db.Document.findByPk(id) : null),
  { models: ['Document'] },
)

const collaboratorRecords = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [docId]) => {
    if (!docId) return []
    const rows = await db.UserOnDocument.where().exec()
    return rows.filter((r) => r.documentId === docId && !r.deletedAt)
  },

  { models: ['UserOnDocument'], initial: [] },
)

const isAuthorisedEditor = computed(() => {
  const userId = currentSession.value?.userId
  if (!userId) return false
  if (selectedVersion.value?.createdBy === userId) return true
  if (document.value?.userId === userId) return true
  return (collaboratorRecords.value ?? []).some((r) => r.userId === userId)
})

const isEditable = computed(
  () =>
    isAuthorisedEditor.value &&
    ['DRAFT', 'REJECTED', 'CHANGES_REQUESTED'].includes(selectedVersion.value?.statusId),
)

// Whether the AI Generate Questions button is available. Same rule as
// editability — only the owner during a DRAFT-ish version. We additionally
// require training to be enabled because there's no point generating
// questions for a version where training won't run.
const canGenerateQuestions = computed(
  () => isEditable.value && selectedVersion.value?.trainingConfig?.enabled,
)
const showGenerateDialog = ref(false)

// AI dialog emits { questions: [...with fresh ids...] }. Append to the
// existing assessment so we never overwrite. ensureConfig() guarantees
// the trainingConfig object exists before we land here (the dialog only
// opens when canGenerateQuestions is true, which requires enabled = true).
//
// Drop empty starter questions (text === '') before appending — toggling
// Assessment on auto-creates one blank question, and users expect AI
// output to replace it, not sit alongside it.
function handleQuestionsApply({ questions }) {
  if (!selectedVersion.value || !questions?.length) return
  const cfg = selectedVersion.value.trainingConfig ?? {}
  const existing = Array.isArray(cfg.assessment) ? cfg.assessment : []
  const nonEmpty = existing.filter((q) => q.text?.trim())
  selectedVersion.value.trainingConfig = {
    ...cfg,
    assessment: [...nonEmpty, ...questions],
  }
  toast.notify({
    type: 'positive',
    message: `Appended ${questions.length} question${questions.length === 1 ? '' : 's'} to the assessment.`,
  })
}

// Returns null if every question is complete, otherwise the first error.
// "Complete" = text present, ≥2 options each with text, and the right
// number of correct answers for the question type.
function validateAssessment(assessment) {
  if (!Array.isArray(assessment)) return null
  for (let i = 0; i < assessment.length; i++) {
    const q = assessment[i]
    if (!q.text?.trim()) return `Question ${i + 1}: text is required`
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return `Question ${i + 1}: needs at least 2 options`
    }
    for (let j = 0; j < q.options.length; j++) {
      if (!q.options[j].text?.trim()) {
        return `Question ${i + 1}, option ${j + 1}: text is required`
      }
    }
    const correct = q.options.filter((o) => o.isCorrect).length
    if (q.type === 'single' && correct !== 1) {
      return `Question ${i + 1}: select exactly one correct answer`
    }
    if (q.type === 'multiple' && correct < 1) {
      return `Question ${i + 1}: select at least one correct answer`
    }
  }
  return null
}

// Auto-save the version's trainingConfig on edits
const isFirstLoad = ref(true)
const isSaving = ref(false)
const saveBlockedReason = ref(null)
// Cooldown prevents the toast firing on every keystroke while the user is
// typing into a still-incomplete question. The persistent inline status
// (saveBlockedReason) carries the message between toasts.
let lastToastMsg = null
let lastToastTime = 0
const TOAST_COOLDOWN_MS = 3000

const debouncedSave = useDebounceFn(async () => {
  if (!selectedVersion.value || !isEditable.value) return

  const cfg = selectedVersion.value.trainingConfig
  if (cfg?.enabled && cfg.assessment?.length) {
    const error = validateAssessment(cfg.assessment)
    if (error) {
      saveBlockedReason.value = error
      const now = Date.now()
      if (error !== lastToastMsg || now - lastToastTime > TOAST_COOLDOWN_MS) {
        toast.notify({ type: 'warning', message: error })
        lastToastMsg = error
        lastToastTime = now
      }
      return
    }
  }
  saveBlockedReason.value = null

  isSaving.value = true
  try {
    await selectedVersion.value.save()
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to save training config' })
  } finally {
    isSaving.value = false
  }
}, 500)
watch(
  () => selectedVersion.value?.trainingConfig,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (isEditable.value) debouncedSave()
  },
  { deep: true },
)

// Ensure the version has a trainingConfig object to bind against when editing
function ensureConfig() {
  if (!selectedVersion.value) return
  if (!selectedVersion.value.trainingConfig) {
    selectedVersion.value.trainingConfig = {
      enabled: false,
      autoLaunch: true,
      managerId: null,
      requireManagerVerification: true,
      completionDueDays: 7,
      passingScore: 80,
      maxAttempts: 1,
      roleIds: [],
      userIds: [],
      assessment: [],
    }
  }
}
watch(selectedVersion, ensureConfig, { immediate: true })

// Find the auto-Training for this document
const training = useLiveQueryWithDeps(
  [() => props.documentId],

  async (db, [docId]) => {
    if (!docId) return null
    const all = await db.Training.where().exec()
    return all.find((t) => t.sourceDocumentId === docId) ?? null
  },
  { models: ['Training'] },
)

// Most recent instance — retraining flow can spawn new instances, show the latest
const latestInstance = useLiveQueryWithDeps(
  [() => training.value?.id],

  async (db, [trainingId]) => {
    if (!trainingId) return null
    const all = await db.TrainingInstance.where('trainingId', trainingId).exec()
    if (!all.length) return null
    return all.reduce((newest, inst) =>
      (newest.createdAt?.toMillis?.() ?? 0) > (inst.createdAt?.toMillis?.() ?? 0) ? newest : inst,
    )
  },
  { models: ['TrainingInstance'] },
)

// All instances (for the history list)
const allInstances = useLiveQueryWithDeps(
  [() => training.value?.id],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    const all = await db.TrainingInstance.where('trainingId', trainingId).exec()
    return all.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['TrainingInstance'], initial: [] },
)

// Assignees for the latest instance
const assignees = useLiveQueryWithDeps(
  [() => latestInstance.value?.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    return db.TrainingAssignee.where('trainingInstanceId', instanceId).exec()
  },

  { models: ['TrainingAssignee'], initial: [] },
)

const stats = computed(() => {
  const all = assignees.value
  return {
    total: all.length,
    verified: all.filter((a) => a.status === 'VERIFIED').length,
    completed: all.filter((a) => a.status === 'COMPLETED').length, // pending verification
    failed: all.filter((a) => a.status === 'FAILED').length,
    retrainRequired: all.filter((a) => a.status === 'RETRAIN_REQUIRED').length,
    cancelled: all.filter((a) => a.status === 'CANCELLED' || a.status === 'REMOVED').length,
    inProgress: all.filter((a) => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status)).length,
  }
})

const instanceOverdue = computed(() => {
  const inst = latestInstance.value
  if (!inst?.dueDate || inst.status !== 'ACTIVE') return false
  return inst.dueDate < DateTime.now()
})

// ── Library training history ────────────────────────────────────────────
// Trainings created in the Training Library that REFERENCE this document
// via training_document_links. Distinct from the auto-Training that came
// from the doc's own trainingConfig (which is the section above). Auditors
// looking at "all training completed on this doc" want both views.
//
// Filter excludes the auto-training row to avoid duplication when the
// auto-training also happens to be linked back.
const libraryLinks = useLiveQueryWithDeps(
  [() => props.documentId],
  async (db, [docId]) => {
    if (!docId) return []
    const rows = await db.TrainingDocumentLink.where().exec()
    return rows.filter((l) => l.documentId === docId && !l.deletedAt)
  },

  { models: ['TrainingDocumentLink'], initial: [] },
)

const libraryTrainingIds = computed(() => [...new Set(libraryLinks.value.map((l) => l.trainingId))])

const libraryTrainings = useLiveQueryWithDeps(
  [() => libraryTrainingIds.value.join(',')],
  async (db, [key]) => {
    const ids = key.split(',').filter(Boolean)
    if (!ids.length) return []
    const found = await Promise.all(ids.map((id) => db.Training.findByPk(id)))
    // Exclude the auto-training (covered by the section above).
    return found.filter((t) => t && t.sourceDocumentId !== props.documentId)
  },

  { models: ['Training'], initial: [] },
)

const trainingsById = computed(() => {
  const map = {}
  for (const t of libraryTrainings.value) map[t.id] = t
  return map
})

// Flatten: instances across all library trainings for this doc, newest
// first. Each row carries the parent training reference so we can show
// "training title · launched date · status · counts".
const libraryInstances = useLiveQueryWithDeps(
  [() => libraryTrainings.value.map((t) => t.id).join(',')],
  async (db, [key]) => {
    const ids = key.split(',').filter(Boolean)
    if (!ids.length) return []
    const all = []
    for (const id of ids) {
      const rows = await db.TrainingInstance.where('trainingId', id).exec()
      all.push(...rows)
    }
    return all.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['TrainingInstance'], initial: [] },
)

// Per-instance assignee rows (full detail) so each instance card can render
// the same row layout as the auto-training section: user + completion +
// score + status badge. Live-queried as an object keyed by instance id —
// re-runs when any TrainingAssignee changes.
const libraryAssigneesByInstance = useLiveQueryWithDeps(
  [() => libraryInstances.value.map((i) => i.id).join(',')],
  async (db, [key]) => {
    const ids = key.split(',').filter(Boolean)
    if (!ids.length) return {}
    const out = {}
    for (const id of ids) {
      out[id] = await db.TrainingAssignee.where('trainingInstanceId', id).exec()
    }
    return out
  },

  { models: ['TrainingAssignee'], initial: {} },
)

function libraryAssigneeStats(instanceId) {
  const rows = libraryAssigneesByInstance.value?.[instanceId] ?? []
  return {
    total: rows.length,
    verified: rows.filter((a) => a.status === 'VERIFIED').length,
    completed: rows.filter((a) => a.status === 'COMPLETED').length,
    failed: rows.filter((a) => a.status === 'FAILED').length,
  }
}
</script>

<template>
  <div class="tw:max-w-360 tw:mx-auto tw:px-6 tw:py-8 tw:w-full tw:flex tw:flex-col tw:gap-5">
    <!-- Edit-in-place training config for DRAFT / REJECTED / CHANGES_REQUESTED versions -->
    <div v-if="isEditable && selectedVersion?.trainingConfig" class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:flex-wrap">
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">
          Training config for this version
          <span class="tw:font-normal tw:text-on-sidebar tw:ml-1">
            (v{{ selectedVersion.versionMajor }}.{{ selectedVersion.versionMinor }} ·
            {{ selectedVersion.statusId }})
          </span>
        </p>
        <div class="tw:flex tw:items-center tw:gap-3">
          <button
            v-if="canGenerateQuestions"
            class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium tw:px-2.5 tw:py-1 tw:text-xs"
            title="Use AI to draft quiz questions from the document content"
            @click="showGenerateDialog = true"
          >
            <IconSparkles :size="13" />
            AI Generate Questions
          </button>
          <span v-if="isSaving" class="tw:text-xs tw:text-secondary">Saving…</span>
          <span
            v-else-if="saveBlockedReason"
            class="tw:text-xs tw:text-red-600 tw:font-medium"
            :title="saveBlockedReason"
          >
            Save blocked: {{ saveBlockedReason }}
          </span>
        </div>
      </div>
      <DocumentsCreateTraining v-model="selectedVersion.trainingConfig" />
    </div>

    <!-- AI Generate Questions dialog. Mounted at root level (still inside
         v-if=isEditable section so it tears down when ownership changes). -->
    <DocumentGenerateQuestionsDialog
      v-if="canGenerateQuestions"
      v-model="showGenerateDialog"
      :versionId="versionId"
      :documentTitle="document?.title ?? ''"
      @apply="handleQuestionsApply"
    />

    <!-- No training configured AND not on an editable version → empty state -->
    <div
      v-else-if="!training"
      class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-8 tw:text-center"
    >
      <IconSchool :size="48" class="tw:mx-auto tw:mb-3 tw:text-gray-300" />
      <p class="tw:text-sm tw:text-secondary">
        No training has been configured for this document yet.
      </p>
    </div>

    <!-- No instances launched yet (training exists but doc never became effective) -->
    <div
      v-else-if="!latestInstance"
      class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-8 tw:text-center"
    >
      <IconSchool :size="48" class="tw:mx-auto tw:mb-3 tw:text-gray-300" />
      <p class="tw:text-sm tw:text-secondary">
        Training is configured. The first training instance will launch when this document becomes
        effective.
      </p>
    </div>

    <template v-else>
      <!-- Header: latest instance summary -->
      <RouterLink
        :to="getCompanyPath(`/training-instances/${latestInstance.id}`)"
        class="tw:block tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:hover:bg-gray-50 tw:transition-colors tw:no-underline"
      >
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:mb-3">
          <div>
            <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">
              {{ latestInstance.snapshot?.title || training.title }}
            </h2>
            <p
              class="tw:text-xs tw:text-secondary tw:mt-1 tw:flex tw:items-center tw:gap-3 tw:flex-wrap"
            >
              <span class="tw:flex tw:items-center tw:gap-1">
                <IconCalendar :size="12" /> Launched
                {{ latestInstance.createdAt?.formatDate('date') }}
              </span>
              <span
                v-if="latestInstance.dueDate"
                class="tw:flex tw:items-center tw:gap-1"
                :class="instanceOverdue ? 'tw:text-red-600 tw:font-medium' : ''"
              >
                <IconClock :size="12" /> Due {{ latestInstance.dueDate.formatDate('date') }}
                <span v-if="instanceOverdue">· overdue</span>
              </span>
              <span v-if="training.managerId" class="tw:flex tw:items-center tw:gap-1">
                Manager: <UserBadgeById :userId="training.managerId" />
              </span>
            </p>
          </div>
          <TrainingInstanceStatusBadgeById :statusId="latestInstance.status" />
        </div>

        <!-- Summary stats -->
        <div class="tw:grid tw:grid-cols-5 tw:gap-3 tw:mt-4">
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Total</p>
            <p class="tw:text-lg tw:font-bold tw:text-on-sidebar">{{ stats.total }}</p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Verified</p>
            <p class="tw:text-lg tw:font-bold tw:text-green-600">{{ stats.verified }}</p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Pending</p>
            <p class="tw:text-lg tw:font-bold tw:text-amber-600">
              {{ stats.completed + stats.inProgress }}
            </p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Failed</p>
            <p
              class="tw:text-lg tw:font-bold"
              :class="stats.failed > 0 ? 'tw:text-red-600' : 'tw:text-on-sidebar'"
            >
              {{ stats.failed }}
            </p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Retrain</p>
            <p
              class="tw:text-lg tw:font-bold"
              :class="stats.retrainRequired > 0 ? 'tw:text-orange-600' : 'tw:text-on-sidebar'"
            >
              {{ stats.retrainRequired }}
            </p>
          </div>
        </div>
      </RouterLink>

      <!-- Assignees list -->
      <div class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-5">
        <h3
          class="tw:text-sm tw:font-bold tw:text-on-sidebar tw:mb-3 tw:flex tw:items-center tw:gap-2"
        >
          <IconUsers :size="16" /> Assignees ({{ assignees.length }})
        </h3>
        <div v-if="!assignees.length" class="tw:text-sm tw:text-secondary tw:italic">
          No assignees on this instance.
        </div>
        <div v-else class="tw:flex tw:flex-col tw:gap-1">
          <div
            v-for="a in assignees"
            :key="a.id"
            class="tw:grid tw:grid-cols-[1fr_auto_auto_auto] tw:items-center tw:gap-4 tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:border-divider"
          >
            <UserBadgeById :userId="a.userId" />
            <span class="tw:text-xs tw:text-secondary">
              <template v-if="a.completedAt"
                >Completed {{ a.completedAt.formatDate('date') }}</template
              >
              <template v-else>—</template>
            </span>
            <span
              v-if="a.score !== null"
              class="tw:text-sm tw:font-semibold tw:w-12 tw:text-right"
              :class="
                a.status === 'VERIFIED' || a.status === 'COMPLETED'
                  ? 'tw:text-green-600'
                  : 'tw:text-red-600'
              "
            >
              {{ a.score }}%
            </span>
            <span v-else class="tw:text-sm tw:text-secondary tw:w-12 tw:text-right">—</span>
            <TrainingAssigneeStatusBadgeById :statusId="a.status" />
          </div>
        </div>
      </div>

      <!-- History (prior instances from retraining) -->
      <div
        v-if="allInstances.length > 1"
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-5"
      >
        <h3 class="tw:text-sm tw:font-bold tw:text-on-sidebar tw:mb-3">Training History</h3>
        <p class="tw:text-xs tw:text-secondary tw:mb-3">
          Each document revision (or retraining triggered by the manager) launches a new instance.
        </p>
        <div class="tw:flex tw:flex-col tw:gap-1">
          <RouterLink
            v-for="inst in allInstances"
            :key="inst.id"
            :to="getCompanyPath(`/training-instances/${inst.id}`)"
            class="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:border-divider tw:hover:bg-gray-50 tw:no-underline"
            :class="inst.id === latestInstance.id ? 'tw:bg-blue-50/40 tw:border-blue-200' : ''"
          >
            <span class="tw:text-sm tw:text-on-sidebar">
              Launched {{ inst.createdAt?.formatDate('date') }}
              <span v-if="inst.id === latestInstance.id" class="tw:text-xs tw:text-primary tw:ml-2"
                >· current</span
              >
            </span>
            <TrainingInstanceStatusBadgeById :statusId="inst.status" :showDot="false" />
          </RouterLink>
        </div>
      </div>
    </template>

    <!-- Library Training History — shown regardless of whether this doc has
         its own auto-Training. Captures trainings created in the Training
         Library that reference this document as material. Each instance is
         rendered as a card with its assignees expanded inline (same row
         layout as the auto-training assignees section) so auditors can see
         WHO completed WHICH training on this document and when. -->
    <div v-if="libraryInstances.length" class="tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <h3 class="tw:text-sm tw:font-bold tw:text-on-sidebar">
          Library Training Referencing This Document
        </h3>
        <p class="tw:text-xs tw:text-secondary">
          Trainings from the Training Library that include this document as a reference. Each
          instance shows its assignees and completion status.
        </p>
      </div>

      <div
        v-for="inst in libraryInstances"
        :key="inst.id"
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:flex tw:flex-col tw:gap-4"
      >
        <!-- Instance header — click-through to the full instance page -->
        <RouterLink
          :to="getCompanyPath(`/training-instances/${inst.id}`)"
          class="tw:flex tw:items-start tw:justify-between tw:gap-4 tw:no-underline"
        >
          <div class="tw:flex tw:flex-col tw:gap-1 tw:min-w-0 tw:flex-1">
            <h4 class="tw:text-base tw:font-semibold tw:text-on-sidebar tw:truncate">
              {{
                inst.snapshot?.title || trainingsById[inst.trainingId]?.title || 'Untitled training'
              }}
            </h4>
            <p class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
              <span class="tw:flex tw:items-center tw:gap-1">
                <IconCalendar :size="12" /> Launched {{ inst.createdAt?.formatDate('date') }}
              </span>
              <span v-if="inst.dueDate" class="tw:flex tw:items-center tw:gap-1">
                <IconClock :size="12" /> Due {{ inst.dueDate.formatDate('date') }}
              </span>
              <span
                v-if="trainingsById[inst.trainingId]?.managerId"
                class="tw:flex tw:items-center tw:gap-1"
              >
                Manager:
                <UserBadgeById :userId="trainingsById[inst.trainingId].managerId" />
              </span>
            </p>
          </div>
          <TrainingInstanceStatusBadgeById :statusId="inst.status" />
        </RouterLink>

        <!-- Per-instance stats strip (mirrors the auto-training card above) -->
        <div class="tw:grid tw:grid-cols-4 tw:gap-3">
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Assigned</p>
            <p class="tw:text-lg tw:font-bold tw:text-on-sidebar">
              {{ libraryAssigneeStats(inst.id).total }}
            </p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Verified</p>
            <p class="tw:text-lg tw:font-bold tw:text-green-600">
              {{ libraryAssigneeStats(inst.id).verified }}
            </p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Completed</p>
            <p class="tw:text-lg tw:font-bold tw:text-amber-600">
              {{ libraryAssigneeStats(inst.id).completed }}
            </p>
          </div>
          <div class="tw:bg-gray-50 tw:rounded-lg tw:px-3 tw:py-2">
            <p class="tw:text-[10px] tw:uppercase tw:font-bold tw:text-secondary">Failed</p>
            <p class="tw:text-lg tw:font-bold tw:text-red-600">
              {{ libraryAssigneeStats(inst.id).failed }}
            </p>
          </div>
        </div>

        <!-- Assignees list (same row layout as the auto-training section) -->
        <div>
          <h5
            class="tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-2 tw:flex tw:items-center tw:gap-2"
          >
            <IconUsers :size="14" /> Assignees ({{
              (libraryAssigneesByInstance[inst.id] ?? []).length
            }})
          </h5>
          <div
            v-if="!(libraryAssigneesByInstance[inst.id] ?? []).length"
            class="tw:text-sm tw:text-secondary tw:italic"
          >
            No assignees on this instance.
          </div>
          <div v-else class="tw:flex tw:flex-col tw:gap-1">
            <div
              v-for="a in libraryAssigneesByInstance[inst.id]"
              :key="a.id"
              class="tw:grid tw:grid-cols-[1fr_auto_auto_auto] tw:items-center tw:gap-4 tw:px-3 tw:py-2 tw:rounded-lg tw:border tw:border-divider"
            >
              <UserBadgeById :userId="a.userId" />
              <span class="tw:text-xs tw:text-secondary">
                <template v-if="a.completedAt">
                  Completed {{ a.completedAt.formatDate('date') }}
                </template>
                <template v-else>—</template>
              </span>
              <span
                v-if="a.score !== null && a.score !== undefined"
                class="tw:text-sm tw:font-semibold tw:w-12 tw:text-right"
                :class="
                  a.status === 'VERIFIED' || a.status === 'COMPLETED'
                    ? 'tw:text-green-600'
                    : 'tw:text-red-600'
                "
              >
                {{ a.score }}%
              </span>
              <span v-else class="tw:text-sm tw:text-secondary tw:w-12 tw:text-right">—</span>
              <TrainingAssigneeStatusBadgeById :statusId="a.status" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
