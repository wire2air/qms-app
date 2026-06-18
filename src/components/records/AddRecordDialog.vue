<script setup>
import DynamicForm from '@/components/form/DynamicForm.js'
import {
  IconArrowLeft,
  IconX,
  IconSearch,
  IconChevronRight,
  IconCircleCheck,
  IconFileText,
  IconShieldLock,
} from '@tabler/icons-vue'
import { post } from '@/api'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { freezeOptionLabels } from '@/utils/freezeFormPayloadLabels.js'
import { db } from '@models/index'

const props = defineProps({
  /**
   * Restrict the template-picker list:
   *   - 'all'        — every active template (default)
   *   - 'inspections' — only OPERATIONAL_LOG + CONTROLLED_RECORD,
   *                    AND further gated to templates the current user
   *                    has an active FormAssignment for (direct or via
   *                    role). Admins with `inspections:assign` or
   *                    `fieldRecords:read_all` can flip "View all".
   *   - 'utility'    — only UTILITY (or unclassified)
   */
  classificationFilter: {
    type: String,
    default: 'all',
    validator: (v) => ['all', 'inspections', 'utility'].includes(v),
  },
  // When set, skip the template picker and open straight into the fill
  // form for this log book (e.g. launched from a task — we already know
  // which log book the entry is for).
  logBookId: {
    type: String,
    default: null,
  },
  // The scheduled instance this fill completes. Passed through to the
  // submission so the backend flips the instance to COMPLETED + closes
  // its task. Null for ad-hoc submissions.
  assignmentInstanceId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['created', 'close'])
const model = defineModel({ type: Boolean, default: false })
const toast = useToast()

const userId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)

// Admins / planners can bypass the assignment gate so they can submit
// any inspection template (e.g. for testing or a one-off entry).
const canBypassAssignmentGate = computed(() =>
  isAllowed(['inspections:assign', 'fieldRecords:read_all']),
)
const viewAll = ref(false)

// Roles the current user holds — used to resolve role-based
// FormAssignments.
const myRoleIds = useLiveQueryWithDeps(
  [() => userId.value],
  async (db, [uid]) => {
    if (!uid) return []
    const rows = await db.RoleOnUser.where('userId', uid).exec()
    return rows.map((r) => r.roleId)
  },

  { models: ['RoleOnUser'], initial: [] },
)

/**
 * Templates referenced by an active FormAssignment that targets the
 * current user — either directly via `assignedUserIds` or via a role
 * they hold. Skips role-only plans whose role they don't have. Honors
 * `effectiveAt` / `effectiveUntil` windows.
 *
 * Returns a Set<logBookId> so the picker filter is O(1) per row.
 *
 * Full-scan + in-memory filter is intentional: IndexedDB doesn't allow
 * Boolean values as index keys, so the model's `active` index is dead
 * and `.where('active', true)` returns nothing. There are very few
 * assignment rows per company; the scan is fine.
 */
const assignedTemplateIds = useLiveQueryWithDeps(
  [() => userId.value, () => myRoleIds.value],
  async (db, [uid, roleIds]) => {
    if (!uid) return new Set()
    const rows = await db.FormAssignment.where().exec()
    const roleSet = new Set(roleIds ?? [])
    const ids = new Set()
    for (const row of rows) {
      if (row.active === false) continue
      const directHit = Array.isArray(row.assignedUserIds) && row.assignedUserIds.includes(uid)
      const roleHit = row.assignedRoleId && roleSet.has(row.assignedRoleId)
      if (directHit || roleHit) ids.add(row.logBookId)
    }
    return ids
  },

  { models: ['FormAssignment'], initial: new Set() },
)

// E-sig dialog state for Inspections & Logs submissions. Pending data
// holds the form payload so we can replay it after the user signs.
const showEsignDialog = ref(false)
const pendingEsignPayload = ref(null)

/**
 * Translate the workflowInstanceEsignAuthDialog's `verified` emit shape
 * (which uses `{ method, provider, token }` and sends the password as
 * `token`) into the flat `{ strategy, code, token, password }` esign
 * sub-object that the backend signatureService expects.
 */
function buildEsignFromVerified(v) {
  if (!v) return null
  if (v.method === 'PASSWORD') return { password: v.token }
  if (v.method === 'PIN') return { strategy: 'pin', token: v.token }
  if (v.method === 'OAUTH' && v.provider === 'MICROSOFT') {
    return { strategy: 'microsoft', token: v.token }
  }
  if (v.method === 'OAUTH' && v.provider === 'GOOGLE') {
    return { strategy: 'google', code: v.token, token: v.token }
  }
  return v
}

// Dialog state
const step = ref('select') // 'select' | 'form' | 'success'

// Template selection
const templateSearch = ref('')
const selectedTemplate = ref(null)

// Form state
const formData = ref({})
const documentTypeId = ref(null)
const submitting = ref(false)
const createdRecord = ref(null)

// Round 0 refactor: the source of templates depends on the entry
// point. Inspections & Logs reads from the first-class log_books
// table; the legacy /records flow still reads from form_templates
// (UTILITY only). When classificationFilter == 'all' (e.g. an admin
// sees both), we union both sources and stamp a `_kind` so the
// downstream submit code knows which path to take.
const inspectionTemplates = useLiveQuery(
  async (db) => {
    const rows = await db.LogBook.where('statusId', 'ACTIVE').exec()
    // Controlled entity: only a log book with an approved EFFECTIVE
    // version can accept entries. Brand-new books awaiting approval (no
    // current_effective_version_id) are filtered out of the picker; the
    // backend also rejects them with LOG_BOOK_NOT_EFFECTIVE as a backstop.
    return rows.filter((r) => r.currentEffectiveVersionId).map((r) => ({ ...r, _kind: 'LOG_BOOK' }))
  },

  { models: ['LogBook'], initial: [] },
)
const utilityTemplates = useLiveQuery(
  async (db) => {
    const rows = await db.FormTemplate.where('statusId', 'ACTIVE').exec()
    // form_templates may still hold OPERATIONAL_LOG / CONTROLLED_RECORD
    // rows if they were never migrated; defensive filter keeps only
    // unclassified (= UTILITY) rows for this side of the union.
    return rows
      .filter((t) => {
        const cls = t.config?.recordClassification
        return !cls || cls === 'UTILITY'
      })
      .map((t) => ({ ...t, _kind: 'FORM_TEMPLATE' }))
  },

  { models: ['FormTemplate'], initial: [] },
)

const templates = computed(() => {
  if (props.classificationFilter === 'inspections') return inspectionTemplates.value
  if (props.classificationFilter === 'utility') return utilityTemplates.value
  return [...inspectionTemplates.value, ...utilityTemplates.value]
})

function templateMatchesFilter(t) {
  if (props.classificationFilter === 'inspections') {
    // Every row in inspectionTemplates already qualifies by class.
    // Just apply the assignment gate.
    if (canBypassAssignmentGate.value && viewAll.value) return true
    return assignedTemplateIds.value.has(t.id)
  }
  // utility / all — no extra gating.
  return true
}

const filteredTemplates = computed(() => {
  let list = templates.value.filter(templateMatchesFilter)
  if (templateSearch.value) {
    const search = templateSearch.value.toLowerCase()
    list = list.filter(
      (t) => t.title.toLowerCase().includes(search) || t.code.toLowerCase().includes(search),
    )
  }
  return list
})

function selectTemplate(template) {
  selectedTemplate.value = template
  formData.value = {}
  documentTypeId.value = template.documentTypeId || null
  step.value = 'form'
}

// Launched with a specific log book (e.g. from a task) → skip the picker
// and open its fill form directly once the templates have loaded.
watch(
  [inspectionTemplates, () => props.logBookId],
  ([tmpls, lbId]) => {
    if (!lbId || selectedTemplate.value) return
    const match = tmpls.find((t) => t.id === lbId)
    if (match) selectTemplate(match)
  },
  { immediate: true },
)

const createRecord = useLiveMutation(async (db, { templateId, documentTypeId, payload }) => {
  const template = await db.FormTemplate.findByPk(templateId)
  if (!template) throw new Error('Template not found')

  const { code } = template

  // Get or create counter scoped to this documentTypeId
  const allCounters = await db.RecordCounter.where().exec()
  let counter = allCounters.find((c) => c.documentTypeId === documentTypeId)

  if (!counter) {
    counter = db.RecordCounter.create({ documentTypeId, currentValue: 1 })
  } else {
    counter.currentValue += 1
  }

  const recordNumber = `${code}-${documentTypeId}-${String(counter.currentValue).padStart(4, '0')}`

  const record = db.Record.create({ templateId, documentTypeId, payload, recordNumber })
  await record.save()
  await counter.save()

  return record
})

/**
 * Read the classification from the selected row.
 *   - LogBook rows have `recordClassification` as a column.
 *   - Legacy FormTemplate rows store it (or don't) under config.
 * Defaults to UTILITY for unclassified form templates.
 */
const classification = computed(() => {
  const t = selectedTemplate.value
  if (!t) return 'UTILITY'
  if (t._kind === 'LOG_BOOK') return t.recordClassification ?? 'OPERATIONAL_LOG'
  const cls = t.config?.recordClassification
  if (cls === 'OPERATIONAL_LOG' || cls === 'CONTROLLED_RECORD') return cls
  return 'UTILITY'
})

const isInspectionRecord = computed(() => classification.value !== 'UTILITY')

/**
 * Signature requirement at submission:
 *  - CONTROLLED_RECORD: always
 *  - OPERATIONAL_LOG: only if the log book / template opted in
 *  - UTILITY: never (and we route through the legacy path anyway)
 */
const requiresSignatureAtSubmit = computed(() => {
  const t = selectedTemplate.value
  if (!t) return false
  if (classification.value === 'CONTROLLED_RECORD') return true
  if (classification.value === 'OPERATIONAL_LOG') {
    if (t._kind === 'LOG_BOOK') return Boolean(t.signatureRequired)
    return Boolean(t.config?.signature?.requiredAtSubmission)
  }
  return false
})

const editWindow = computed(() => {
  const t = selectedTemplate.value
  if (!t) return null
  if (t._kind === 'LOG_BOOK') {
    return t.editWindowMode === 'TIME_WINDOW'
      ? { mode: 'TIME_WINDOW', durationMinutes: t.editWindowMinutes }
      : { mode: t.editWindowMode }
  }
  return t.config?.editWindow ?? null
})

/**
 * INSPECTIONS & LOGS submission path. Calls POST /v1/services/fieldRecords
 * with the proper payload. The backend enforces:
 *   - CONTROLLED_RECORD or opted-in OPERATIONAL_LOG → requires esign
 *   - Edit window computation (TIME_WINDOW / UNTIL_NEXT_ENTRY / UNTIL_REVIEW)
 *   - Snapshot the form schema onto the new field_record row
 *   - Write the INITIAL_SUBMIT revision in the same transaction
 */
// ─── Flag-on-submit (R2) ─────────────────────────────────────────────
// Floor users can flag an entry "for supervisor review" at submission
// time. We capture severity + notes inline; after the FieldRecord
// lands, we post the flag against its id. Photo capture is deferred
// to a separate round once a reusable file-upload component exists.
const flagOnSubmit = ref(false)
const flagSeverity = ref('WARN')
// RichTextAttachments encoded string: "<html>\n[qms-attachments]::[…]". Holds
// the reason text + inline photos + attached files in one field.
const flagNotes = ref('')

// Has real content — strips tags/whitespace from the HTML part; any attached
// file counts too. Gates the submit button + the flag POST.
const flagHasContent = computed(() => {
  const s = flagNotes.value || ''
  const [htmlPart] = s.split('\n[qms-attachments]::')
  const hasAttachments = s.includes('\n[qms-attachments]::')
  const text = htmlPart.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim()
  return text.length > 0 || hasAttachments
})

async function postFlagForRecord(recordId) {
  if (!flagOnSubmit.value || !flagHasContent.value) return
  try {
    await post(`/v1/services/fieldRecords/${recordId}/flag`, {
      notes: flagNotes.value,
      severity: flagSeverity.value,
    })
  } catch (err) {
    // Don't fail the whole submission if the flag couldn't be raised —
    // the entry is already in the system. Tell the user and let them
    // re-flag via the preview.
    toast.error(
      `Entry saved, but flag failed to raise: ${err?.message ?? 'unknown error'}. ` +
        'You can flag it from the entry detail.',
    )
  }
}

async function submitFieldRecord(payload, esign) {
  // Round 0: I&L records reference log_books via logBookId, not the
  // old form_template_id. Selected row's _kind is always LOG_BOOK on
  // this submit path (the UTILITY branch never reaches here).
  // Freeze OptionSet labels onto the payload so saved records stay
  // readable as the admin originally meant them even if the source
  // OptionSet is later edited. See utils/freezeFormPayloadLabels.js.
  const frozen = await freezeOptionLabels(db, templateSchema.value, payload)
  const body = {
    logBookId: selectedTemplate.value.id,
    payload: frozen,
    submittedVia: 'MAIN_QMS',
  }
  // Link the scheduled instance so the backend completes it + closes the
  // task (assignment-driven fills launched from /tasks).
  if (props.assignmentInstanceId) body.assignmentInstanceId = props.assignmentInstanceId
  if (esign) body.esign = esign

  const res = await post('/v1/services/fieldRecords', body)
  return res?.record ?? res
}

async function handleSubmit(data) {
  // UTILITY templates keep the legacy SyncEngine path — they write to
  // the `records` table and require a document type selection.
  if (!isInspectionRecord.value) {
    if (!documentTypeId.value) {
      toast.error('Document Type is required')
      return
    }
    submitting.value = true
    try {
      const frozen = await freezeOptionLabels(db, templateSchema.value, data)
      const record = await createRecord({
        templateId: selectedTemplate.value.id,
        documentTypeId: documentTypeId.value,
        payload: frozen,
      })
      createdRecord.value = record
      step.value = 'success'
      emit('created', record)
    } catch (err) {
      toast.error(err.message || 'Failed to create record')
    } finally {
      submitting.value = false
    }
    return
  }

  // Inspections & Logs path. If a signature is required, hold the
  // payload, pop the e-sig dialog, replay after `verified` fires.
  if (requiresSignatureAtSubmit.value) {
    pendingEsignPayload.value = data
    showEsignDialog.value = true
    return
  }

  // OPERATIONAL_LOG without esign requirement → submit straight away.
  submitting.value = true
  try {
    const record = await submitFieldRecord(data, null)
    createdRecord.value = record
    await postFlagForRecord(record.id)
    step.value = 'success'
    emit('created', record)
  } catch (err) {
    toast.error(err?.message || 'Failed to submit record')
  } finally {
    submitting.value = false
  }
}

async function onEsignVerified(verified) {
  const esign = buildEsignFromVerified(verified)
  showEsignDialog.value = false
  if (!pendingEsignPayload.value) return
  submitting.value = true
  try {
    const record = await submitFieldRecord(pendingEsignPayload.value, esign)
    createdRecord.value = record
    pendingEsignPayload.value = null
    await postFlagForRecord(record.id)
    step.value = 'success'
    emit('created', record)
  } catch (err) {
    toast.error(err?.message || 'Submission failed after signature')
  } finally {
    submitting.value = false
  }
}

function goBackToSelect() {
  step.value = 'select'
  selectedTemplate.value = null
  formData.value = {}
  flagOnSubmit.value = false
  flagSeverity.value = 'WARN'
  flagNotes.value = ''
  documentTypeId.value = null
}

function handleClose() {
  model.value = false
  emit('close')
}

// "Back" from the form. When the dialog was opened against a fixed log
// book (from a task, or from a specific log book's "fill" entry) there is
// no template picker to return to — so back closes the dialog and lets the
// parent route the user where they came from (e.g. the task inbox), rather
// than dropping them on the unrelated log-book picker.
function handleBack() {
  if (props.logBookId) {
    handleClose()
    return
  }
  goBackToSelect()
}

const templateSchema = computed(() => {
  if (!selectedTemplate.value?.schema) return []
  return Array.isArray(selectedTemplate.value.schema) ? selectedTemplate.value.schema : []
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enterActiveClass="tw:transition-transform tw:duration-300 tw:ease-out"
      enterFromClass="tw:translate-y-full"
      enterToClass="tw:translate-y-0"
      leaveActiveClass="tw:transition-transform tw:duration-200 tw:ease-in"
      leaveFromClass="tw:translate-y-0"
      leaveToClass="tw:translate-y-full"
    >
      <div v-if="model" class="tw:fixed tw:inset-0 tw:z-modal tw:flex tw:flex-col tw:bg-main">
        <div class="tw:flex tw:flex-col tw:h-full tw:flex-nowrap">
          <!-- Header -->
          <div class="tw:flex tw:items-center tw:border-b tw:border-divider tw:py-3 tw:px-4">
            <div class="tw:flex tw:items-center tw:gap-2">
              <button
                v-if="step === 'form'"
                class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
                @click="handleBack"
              >
                <IconArrowLeft :size="20" />
              </button>
              <div class="tw:text-lg tw:font-medium tw:text-on-main">
                <template v-if="step === 'select'">Select a Template</template>
                <template v-else-if="step === 'form'">{{ selectedTemplate?.title }}</template>
                <template v-else>Record Created</template>
              </div>
            </div>
            <div class="tw:flex-1" />
            <button
              class="tw:p-1.5 tw:rounded-full tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
              @click="handleClose"
            >
              <IconX :size="20" />
            </button>
          </div>

          <!-- Step 1: Template Selection -->
          <div
            v-if="step === 'select'"
            class="tw:flex-1 tw:overflow-auto tw:bg-sidebar tw:relative"
          >
            <div class="tw:max-w-175 tw:mx-auto tw:flex tw:flex-col tw:gap-4 tw:p-4">
              <!-- Search -->
              <div class="tw:relative">
                <IconSearch
                  :size="18"
                  class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
                />
                <BaseTextInput
                  v-model="templateSearch"
                  placeholder="Search templates..."
                  class="tw:pl-9"
                />
              </div>

              <!-- Admin toggle: bypass the assignment gate.
                   Only shown for the inspections entry point AND only to
                   users with inspections:assign or fieldRecords:read_all. -->
              <div
                v-if="classificationFilter === 'inspections' && canBypassAssignmentGate"
                class="tw:flex tw:items-center tw:gap-2 tw:text-xs"
              >
                <label class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
                  <input v-model="viewAll" type="checkbox" />
                  <span>View all inspection templates (admin)</span>
                </label>
                <span class="tw:text-secondary"> — default is your assigned forms only. </span>
              </div>

              <!-- Empty: distinguish "no assignments yet" from "no match" -->
              <div
                v-if="
                  filteredTemplates.length === 0 &&
                  classificationFilter === 'inspections' &&
                  !viewAll &&
                  assignedTemplateIds.size === 0
                "
                class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-10 tw:text-center"
              >
                <IconFileText :size="36" class="tw:text-secondary tw:opacity-60" />
                <div class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                  No forms assigned to you yet
                </div>
                <div class="tw:text-xs tw:text-secondary tw:max-w-md">
                  Ask an admin to add you to a Form Assignment plan, or have them open this dialog
                  and toggle "View all" to submit on your behalf.
                </div>
              </div>
              <BaseEmptyState
                v-else-if="filteredTemplates.length === 0"
                :icon="IconFileText"
                title="No templates found"
                dense
              />

              <!-- Template List -->
              <div v-else class="tw:flex tw:flex-col tw:gap-2">
                <BaseClickableRow
                  v-for="template in filteredTemplates"
                  :key="template.id"
                  class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:transition-all tw:hover:shadow-md tw:hover:border-primary/30"
                  :aria-label="`Select template ${template.title}`"
                  @click="selectTemplate(template)"
                >
                  <div class="tw:flex tw:items-center tw:gap-3">
                    <div class="tw:flex tw:flex-col tw:gap-0.5">
                      <div class="tw:font-bold tw:text-on-sidebar">{{ template.title }}</div>
                      <div class="tw:text-xs tw:text-secondary tw:font-mono tw:uppercase">
                        {{ template.code }}
                      </div>
                    </div>
                    <div class="tw:flex-1" />
                    <IconChevronRight :size="24" class="tw:text-secondary" />
                  </div>
                </BaseClickableRow>
              </div>
            </div>
          </div>

          <!-- Step 2: Form -->
          <div v-else-if="step === 'form'" class="tw:flex-1 tw:p-0 tw:overflow-auto tw:bg-sidebar">
            <div class="tw:p-5 tw:min-h-full">
              <div
                class="tw:bg-main tw:border tw:border-divider tw:rounded-lg tw:mx-auto"
                style="max-width: 800px"
              >
                <!-- Inspections & Logs banner: only shows for non-UTILITY templates -->
                <div
                  v-if="isInspectionRecord"
                  class="tw:px-4 tw:py-2.5 tw:border-b tw:border-divider tw:bg-amber-50 tw:text-amber-900 tw:flex tw:items-start tw:gap-2"
                >
                  <IconShieldLock :size="18" class="tw:mt-0.5 tw:shrink-0" />
                  <div class="tw:text-xs tw:leading-relaxed">
                    <div class="tw:font-bold tw:uppercase tw:tracking-wide">
                      {{ classification.replace('_', ' ') }}
                    </div>
                    <div>
                      This is a regulated record. Once submitted, the record is preserved immutably;
                      edits only allowed during the configured window
                      <span v-if="editWindow?.mode">({{ editWindow.mode }})</span>.
                      <span v-if="requiresSignatureAtSubmit">
                        E-signature required on submit.
                      </span>
                    </div>
                  </div>
                </div>

                <div class="tw:p-4 tw:flex tw:flex-col tw:gap-4">
                  <!-- Document Type selector only applies to UTILITY records;
                       inspection records derive the doctype from their log book. -->
                  <BaseField v-if="!isInspectionRecord" label="Document Type" required>
                    <DocumentTypeSelectMenu v-model="documentTypeId" required />
                  </BaseField>
                  <DynamicForm
                    v-model="formData"
                    :fields="templateSchema"
                    :loading="submitting"
                    @submit="handleSubmit"
                  >
                    <template #footer>
                      <!-- Flag-on-submit (I&L only) — let the floor user raise
                           a flag at the moment of submission. Notes required
                           when on; severity defaults to WARN. The flag posts
                           to /v1/services/fieldRecords/:id/flag right after
                           the record is created. -->
                      <div
                        v-if="isInspectionRecord"
                        class="tw:mt-4 tw:p-3 tw:border tw:border-divider tw:rounded-lg tw:bg-main"
                      >
                        <label
                          class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-on-main tw:cursor-pointer"
                        >
                          <input v-model="flagOnSubmit" type="checkbox" />
                          <span>Flag this entry for supervisor review</span>
                          <span class="tw:text-xs tw:text-secondary">
                            (anomaly, out-of-spec, needs attention)
                          </span>
                        </label>
                        <div v-if="flagOnSubmit" class="tw:mt-3 tw:flex tw:flex-col tw:gap-2">
                          <div class="tw:flex tw:items-center tw:gap-2">
                            <span class="tw:text-xs tw:font-semibold tw:text-secondary">
                              Severity
                            </span>
                            <select
                              v-model="flagSeverity"
                              class="tw:rounded tw:border tw:border-divider tw:bg-card tw:px-2 tw:py-1 tw:text-sm"
                            >
                              <option value="INFO">Info — minor note</option>
                              <option value="WARN">Warn — needs attention</option>
                              <option value="CRITICAL">Critical — escalates now</option>
                            </select>
                          </div>
                          <RichTextAttachments
                            v-model="flagNotes"
                            placeholder="What's off about this entry? Add detail, paste/drag photos or attach files to help your supervisor act faster."
                          />
                          <div class="tw:text-xs tw:text-secondary">
                            Paste or drag a photo right into the box, or attach a file. Critical
                            flags send an immediate alert.
                          </div>
                        </div>
                      </div>

                      <div class="tw:flex tw:justify-end tw:gap-2 tw:mt-4">
                        <button
                          class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:text-on-main"
                          @click="handleBack"
                        >
                          {{ props.logBookId ? 'Cancel' : 'Back' }}
                        </button>
                        <button
                          class="tw:px-4 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:disabled:opacity-50"
                          :disabled="submitting || (flagOnSubmit && !flagHasContent)"
                          @click="handleSubmit(formData)"
                        >
                          <BaseSpinner v-if="submitting" size="sm" color="white" class="tw:mr-2" />
                          {{ requiresSignatureAtSubmit ? 'Sign &amp; Submit' : 'Save Record' }}
                        </button>
                      </div>
                    </template>
                  </DynamicForm>
                </div>
              </div>

              <!-- E-sig prompt — reused from the workflow approver flow.
                   `@verified` fires with { method, provider, token }; we
                   translate to the backend's esign shape in buildEsignFromVerified. -->
              <WorkflowInstanceEsignAuthDialog
                v-model="showEsignDialog"
                @verified="onEsignVerified"
              />
            </div>
          </div>

          <!-- Step 3: Success -->
          <div v-else class="tw:flex-1 tw:flex tw:flex-col tw:items-center tw:justify-center">
            <IconCircleCheck :size="64" class="tw:text-green-500" />
            <div class="tw:text-2xl tw:font-bold tw:mt-4 tw:text-green-600">Record Created!</div>
            <p class="tw:text-secondary tw:mt-2">
              Record number: <strong>{{ createdRecord?.recordNumber }}</strong>
            </p>
            <button
              class="tw:mt-6 tw:px-6 tw:py-2 tw:text-sm tw:font-bold tw:text-white tw:bg-primary tw:rounded-lg tw:cursor-pointer tw:hover:bg-primary/90 tw:transition-colors tw:border-0"
              @click="handleClose"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
