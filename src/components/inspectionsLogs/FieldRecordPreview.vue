<script setup>
import {
  IconX,
  IconShieldCheck,
  IconLock,
  IconCircleCheck,
  IconCircleX,
  IconArrowBackUp,
} from '@tabler/icons-vue'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import { isAllowed } from '@/utils/currentSession.js'
import { refetchSyncRecord } from '@/utils/syncEngineRefresh.js'
import { post } from '@/api'

/**
 * Full-screen preview for a field record. Opens from the row click on
 * the FieldRecordsList. Shows the payload (read-only DynamicForm),
 * status / classification / signature metadata, and — when the record
 * is UNDER_REVIEW and the user has fieldRecords:review — exposes
 * Approve / Reject / Return-for-info actions that route through the
 * existing e-sig dialog.
 *
 * Edit / amend / void affordances are not in this commit. They'll
 * land as separate buttons gated by the matching permissions.
 */
const props = defineProps({
  recordId: { type: String, default: null },
})
const emit = defineEmits(['close', 'changed'])
const toast = useToast()

const canReview = computed(() => isAllowed(['fieldRecords:review']))

const record = useLiveQueryWithDeps(
  [() => props.recordId],
  async (db, [id]) => {
    if (!id) return null
    return db.FieldRecord.findByPk(id)
  },
)

const currentRevision = useLiveQueryWithDeps(
  [() => record.value?.currentRevisionId],
  async (db, [rid]) => {
    if (!rid) return null
    return db.FieldRecordRevision.findByPk(rid)
  },
)

const template = useLiveQueryWithDeps(
  [() => record.value?.formTemplateId],
  async (db, [tid]) => {
    if (!tid) return null
    return db.FormTemplate.findByPk(tid)
  },
)

// Prefer the schema snapshot stored on the record (frozen at submit
// time); fall back to the live template schema for very old records
// that pre-date the snapshot column.
const schemaFields = computed(() => {
  const snap = record.value?.formTemplateSchemaSnapshot
  if (Array.isArray(snap)) return snap
  if (Array.isArray(template.value?.schema)) return template.value.schema
  return []
})

const payload = computed(() => currentRevision.value?.payload ?? {})

const statusLabel = computed(() => record.value?.statusId?.replace('_', ' ') ?? '—')
const classificationLabel = computed(
  () => record.value?.recordClassification?.replace('_', ' ') ?? '—',
)

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

function fmtDate(dt) {
  if (!dt) return '—'
  if (dt.toFormat) return dt.toFormat('LLL d, yyyy HH:mm')
  const d = new Date(dt)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

// ─── Review action handling ────────────────────────────────────────
// The e-sig dialog emits { method, provider, token } shapes; translate
// to the backend's flat { strategy, code, token, password } esign object.
function buildEsignFromVerified(v) {
  if (!v) return null
  if (v.method === 'PASSWORD') return { password: v.token }
  if (v.method === 'OAUTH' && v.provider === 'MICROSOFT') {
    return { strategy: 'microsoft', token: v.token }
  }
  if (v.method === 'OAUTH' && v.provider === 'GOOGLE') {
    return { strategy: 'google', code: v.token, token: v.token }
  }
  return v
}

const showEsignDialog = ref(false)
const pendingReview = ref(null) // { outcome, comment }
const reviewComment = ref('')
const showCommentDialog = ref(false)
const pendingOutcome = ref(null)
const isSubmittingReview = ref(false)

function startReview(outcome) {
  // APPROVED + REJECTED require e-sig per the backend. RETURN_FOR_INFO
  // doesn't. We always collect a comment first so the reviewer has a
  // chance to add context.
  pendingOutcome.value = outcome
  reviewComment.value = ''
  showCommentDialog.value = true
}

function confirmComment() {
  if (!pendingOutcome.value) return
  showCommentDialog.value = false
  if (pendingOutcome.value === 'RETURN_FOR_INFO') {
    submitReview({ comment: reviewComment.value || null, esign: null })
  } else {
    pendingReview.value = { outcome: pendingOutcome.value, comment: reviewComment.value || null }
    showEsignDialog.value = true
  }
}

async function onEsignVerified(verified) {
  showEsignDialog.value = false
  if (!pendingReview.value) return
  const esign = buildEsignFromVerified(verified)
  await submitReview({ comment: pendingReview.value.comment, esign })
  pendingReview.value = null
}

async function submitReview({ comment, esign }) {
  if (!record.value?.id || !pendingOutcome.value) return
  isSubmittingReview.value = true
  try {
    await post(`/v1/services/fieldRecords/${record.value.id}/review`, {
      outcome: pendingOutcome.value,
      comment,
      esign,
    })
    // REST endpoint doesn't go through SyncEngine, so the natural
    // socket.io push may not arrive before the user expects the UI to
    // update. Force a refetch + IDB write so the live query in this
    // panel reflects the new state immediately. The new
    // REVIEW_OUTCOME revision will be auto-fetched by findByPk the
    // first time the currentRevision live query asks for it.
    await refetchSyncRecord('FieldRecord', record.value.id)
    toast.success(`Record ${pendingOutcome.value.toLowerCase().replace('_', ' ')}`)
    pendingOutcome.value = null
    emit('changed')
  } catch (e) {
    toast.error(e?.message ?? 'Review action failed')
  } finally {
    isSubmittingReview.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="tw:fixed tw:inset-0 tw:z-50 tw:flex tw:flex-col tw:bg-main">
    <!-- Header -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:px-5 tw:py-3 tw:border-b tw:border-divider">
      <button
        type="button"
        class="tw:p-1.5 tw:rounded tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary"
        @click="close"
      >
        <IconX :size="20" />
      </button>
      <div class="tw:flex-1 tw:min-w-0">
        <div class="tw:text-base tw:font-bold tw:text-on-main tw:truncate">
          {{ template?.title ?? 'Field Record' }}
        </div>
        <div class="tw:text-xs tw:text-secondary tw:truncate">{{ record?.id }}</div>
      </div>
      <span
        v-if="record?.recordClassification"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-2 tw:py-1 tw:border"
        :class="
          record.recordClassification === 'CONTROLLED_RECORD'
            ? 'tw:bg-red-50 tw:text-red-700 tw:border-red-200'
            : 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200'
        "
      >
        <IconShieldCheck
          v-if="record.recordClassification === 'CONTROLLED_RECORD'"
          :size="12"
        />
        {{ classificationLabel }}
      </span>
      <span
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:font-bold tw:rounded tw:px-2 tw:py-1"
        :class="statusBadgeClass(record?.statusId)"
      >
        <IconLock v-if="record?.statusId === 'LOCKED'" :size="12" />
        {{ statusLabel }}
      </span>
    </div>

    <!-- Body -->
    <div class="tw:flex-1 tw:overflow-y-auto tw:p-5">
      <div class="tw:max-w-3xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
        <!-- Metadata -->
        <div
          class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:grid tw:grid-cols-2 tw:md:grid-cols-4 tw:gap-3 tw:text-xs"
        >
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Submitted by</div>
            <UserBadgeById
              v-if="record?.submittedByUserId"
              :userId="record.submittedByUserId"
            />
            <span v-else class="tw:text-secondary">—</span>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Submitted at</div>
            <div class="tw:text-on-main">{{ fmtDate(record?.submittedAt) }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Effective at</div>
            <div class="tw:text-on-main">{{ fmtDate(record?.effectiveAt) }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Via</div>
            <div class="tw:text-on-main">{{ record?.submittedVia ?? '—' }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Lock at</div>
            <div class="tw:text-on-main">{{ fmtDate(record?.lockAt) }}</div>
          </div>
          <div>
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Lock reason</div>
            <div class="tw:text-on-main">{{ record?.lockReason ?? '—' }}</div>
          </div>
          <div v-if="currentRevision">
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Revision</div>
            <div class="tw:text-on-main">
              #{{ currentRevision.revisionNumber }} ({{ currentRevision.revisionType }})
            </div>
          </div>
          <div v-if="currentRevision?.signatureId">
            <div class="tw:font-bold tw:uppercase tw:text-secondary">Signature</div>
            <div class="tw:text-on-main tw:flex tw:items-center tw:gap-1">
              <IconShieldCheck :size="12" class="tw:text-green-600" />
              Signed
            </div>
          </div>
        </div>

        <!-- Payload -->
        <div class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4">
          <h3 class="tw:text-sm tw:font-bold tw:text-on-main tw:mb-3">Record content</h3>
          <FormSchemaReadonlyView
            v-if="schemaFields.length > 0"
            :fields="schemaFields"
            :values="payload"
          />
          <pre
            v-else
            class="tw:text-xs tw:bg-main tw:p-3 tw:rounded tw:overflow-x-auto"
          ><code>{{ JSON.stringify(payload, null, 2) }}</code></pre>
        </div>

        <!-- Void reason -->
        <div
          v-if="record?.statusId === 'VOIDED' && record?.voidReason"
          class="tw:bg-purple-50 tw:rounded-lg tw:border tw:border-purple-200 tw:p-4"
        >
          <h3 class="tw:text-sm tw:font-bold tw:text-purple-900 tw:mb-1">Void reason</h3>
          <p class="tw:text-sm tw:text-purple-900">{{ record.voidReason }}</p>
          <div
            v-if="record?.voidedByUserId"
            class="tw:flex tw:items-center tw:gap-2 tw:mt-2 tw:text-xs tw:text-purple-700"
          >
            Voided by <UserBadgeById :userId="record.voidedByUserId" />
            <span v-if="record?.voidedAt">on {{ fmtDate(record.voidedAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer / actions -->
    <div
      v-if="record?.statusId === 'UNDER_REVIEW' && canReview"
      class="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:px-5 tw:py-3 tw:border-t tw:border-divider tw:bg-card"
    >
      <button
        type="button"
        class="tw:px-3 tw:py-2 tw:text-sm tw:rounded tw:bg-amber-100 tw:text-amber-700 tw:font-medium tw:hover:bg-amber-200 tw:transition tw:flex tw:items-center tw:gap-1.5"
        :disabled="isSubmittingReview"
        @click="startReview('RETURN_FOR_INFO')"
      >
        <IconArrowBackUp :size="16" />
        Return for info
      </button>
      <button
        type="button"
        class="tw:px-3 tw:py-2 tw:text-sm tw:rounded tw:bg-red-600 tw:text-white tw:font-medium tw:hover:bg-red-700 tw:transition tw:flex tw:items-center tw:gap-1.5"
        :disabled="isSubmittingReview"
        @click="startReview('REJECTED')"
      >
        <IconCircleX :size="16" />
        Reject
      </button>
      <button
        type="button"
        class="tw:px-3 tw:py-2 tw:text-sm tw:rounded tw:bg-green-600 tw:text-white tw:font-medium tw:hover:bg-green-700 tw:transition tw:flex tw:items-center tw:gap-1.5"
        :disabled="isSubmittingReview"
        @click="startReview('APPROVED')"
      >
        <IconCircleCheck :size="16" />
        Approve
      </button>
    </div>
    <div
      v-else-if="record?.statusId === 'UNDER_REVIEW'"
      class="tw:flex tw:items-center tw:gap-2 tw:px-5 tw:py-3 tw:border-t tw:border-divider tw:bg-amber-50 tw:text-amber-900 tw:text-xs"
    >
      <IconShieldCheck :size="14" />
      This record is awaiting review. You need the
      <code>fieldRecords:review</code> permission to approve / reject.
    </div>

    <!-- Comment dialog -->
    <Teleport to="body">
      <div
        v-if="showCommentDialog"
        class="tw:fixed tw:inset-0 tw:z-60 tw:flex tw:items-center tw:justify-center tw:bg-black/40"
      >
        <div class="tw:bg-white tw:rounded-lg tw:max-w-md tw:w-full tw:p-5 tw:m-3">
          <h3 class="tw:text-base tw:font-bold tw:text-on-main tw:mb-2">
            {{
              pendingOutcome === 'APPROVED'
                ? 'Approve record'
                : pendingOutcome === 'REJECTED'
                  ? 'Reject record'
                  : 'Return for more information'
            }}
          </h3>
          <p class="tw:text-xs tw:text-secondary tw:mb-3">
            {{
              pendingOutcome === 'RETURN_FOR_INFO'
                ? 'Comment is required so the submitter knows what to add.'
                : 'Comment is optional. E-signature confirmation follows.'
            }}
          </p>
          <textarea
            v-model="reviewComment"
            rows="4"
            class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:text-on-main tw:px-3 tw:py-2 tw:text-sm"
            placeholder="Optional comment for the audit trail"
          ></textarea>
          <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-3">
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-transparent tw:text-secondary tw:hover:bg-main-hover tw:transition tw:border-0"
              @click="showCommentDialog = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="tw:px-3 tw:py-1.5 tw:text-sm tw:rounded tw:bg-primary tw:text-white tw:font-medium tw:hover:bg-primary/90 tw:transition tw:border-0"
              :disabled="pendingOutcome === 'RETURN_FOR_INFO' && !reviewComment.trim()"
              @click="confirmComment"
            >
              {{ pendingOutcome === 'RETURN_FOR_INFO' ? 'Submit' : 'Continue to sign' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- E-sig prompt -->
    <WorkflowInstanceEsignAuthDialog
      v-model="showEsignDialog"
      @verified="onEsignVerified"
    />
  </div>
</template>
